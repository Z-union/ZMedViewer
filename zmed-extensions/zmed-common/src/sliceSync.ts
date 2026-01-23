import { Enums, metaData } from '@cornerstonejs/core';

type Services = { viewportGridService: any; cornerstoneViewportService: any };

type CacheEntry = {
  imageIds: string[];
  scalars: number[];
  seriesNormal: [number, number, number] | null;
  alignedToGroup: boolean;
};

const now = () => (typeof performance?.now === 'function' ? performance.now() : Date.now());

const getViewportIds = (state: any): string[] => {
  const v = state?.viewports;
  if (!v) return [];
  if (v instanceof Map) return Array.from(v.keys());
  if (Array.isArray(v)) return v.map((x: any) => x?.viewportId ?? x?.id).filter(Boolean);
  if (typeof v === 'object') return Object.keys(v);
  return [];
};

const isStackViewport = (csViewport: any) => {
  const v = typeof csViewport?.getViewport === 'function' ? csViewport.getViewport() : csViewport;
  const t = String(v?.type || v?.viewportType || csViewport?.viewportType || '');
  if (t) return t.toLowerCase().includes('stack');
  return /stack/i.test(v?.constructor?.name || csViewport?.constructor?.name || '');
};

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (v: number[]) => Math.sqrt(dot(v, v));
const normalize = (v: number[]): [number, number, number] | null => {
  const n = norm(v);
  if (!n || !Number.isFinite(n)) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const absDot = (a: number[], b: number[]) => Math.abs(dot(a, b));

const getStackApi = (vp: any) => (typeof vp?.getViewport === 'function' ? vp.getViewport() : vp) ?? vp;
const getImageIds = (vp: any) => {
  const v = getStackApi(vp);
  const ids = v?.getImageIds?.() ?? v?.imageIds;
  return Array.isArray(ids) ? ids : [];
};
const getIndex = (vp: any) => {
  const v = getStackApi(vp);
  const i =
    (typeof v?.getCurrentImageIdIndex === 'function' && v.getCurrentImageIdIndex()) ??
    v?.currentImageIdIndex ??
    (typeof v?.getImageIdIndex === 'function' && v.getImageIdIndex()) ??
    0;
  return Number.isFinite(i) ? Number(i) : 0;
};
const setIndex = async (vp: any, index: number) => {
  const v = getStackApi(vp);
  if (typeof v?.setImageIdIndex === 'function') return v.setImageIdIndex(index);
  if (typeof v?.scroll === 'function') {
    const cur = getIndex(v);
    const d = index - cur;
    if (d) v.scroll(d);
    return;
  }
  throw new Error('No setImageIdIndex/scroll');
};

const plane = (imageId: string) => metaData.get('imagePlaneModule', imageId) as any;

const seriesNormalFromImage = (imageId: string): [number, number, number] | null => {
  const p = plane(imageId);
  const row = p?.rowCosines ?? p?.imageOrientationPatient?.slice?.(0, 3);
  const col = p?.columnCosines ?? p?.imageOrientationPatient?.slice?.(3, 6);
  if (!Array.isArray(row) || !Array.isArray(col) || row.length < 3 || col.length < 3) return null;
  return normalize(cross([row[0], row[1], row[2]], [col[0], col[1], col[2]]));
};

const scalarByNormal = (imageId: string, n: [number, number, number]) => {
  const p = plane(imageId);
  const ipp = p?.imagePositionPatient;
  if (!Array.isArray(ipp) || ipp.length < 3) return null;
  const s = dot([ipp[0], ipp[1], ipp[2]], n);
  return Number.isFinite(s) ? s : null;
};

const nearestIndex = (arr: number[], x: number) => {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    const d = Math.abs(v - x);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
};

const percentFallback = (srcIndex: number, srcLen: number, dstLen: number) => {
  if (srcLen <= 1 || dstLen <= 1) return 0;
  const t = srcIndex / (srcLen - 1);
  return Math.max(0, Math.min(dstLen - 1, Math.round(t * (dstLen - 1))));
};

type PatchState = { scroll?: any; setImageIdIndex?: any };

export default class ZMedSliceSyncController {
  private services: Services;
  private started = false;

  private userEnabled = true;
  private runtimeEnabled = false;

  private listeners = new Map<string, () => void>();
  private cache = new Map<string, CacheEntry>();

  private suppressUntil = new Map<string, number>();
  private groupNormal: [number, number, number] | null = null;

  private applying = false;
  private pending: { viewportId: string; reason: string } | null = null;
  private raf = 0;

  constructor(services: Services) {
    this.services = services;
    this.userEnabled = window.__ZMED_SLICE_SYNC_STATE ? !!window.__ZMED_SLICE_SYNC_STATE.enabled : true;
  }

  start() {
    if (this.started) return;
    this.started = true;

    const { viewportGridService } = this.services;
    const ev = viewportGridService?.EVENTS;

    try {
      if (ev && viewportGridService?.subscribe) {
        viewportGridService.subscribe(ev.GRID_STATE_CHANGED, () => this.autoCheck('GRID'));
        viewportGridService.subscribe(ev.VIEWPORTS_READY, () => this.autoCheck('READY'));
        viewportGridService.subscribe(ev.ACTIVE_VIEWPORT_ID_CHANGED, () => this.autoCheck('ACTIVE'));
      } else {
        this.autoCheck('INIT');
        setTimeout(() => this.autoCheck('T+500'), 500);
        setTimeout(() => this.autoCheck('T+1500'), 1500);
      }
    } catch {
      this.autoCheck('INIT');
    }
  }

  isEnabled() {
    return this.runtimeEnabled;
  }

  setEnabled(enabled: boolean, reason = 'manual') {
    this.userEnabled = !!enabled;
    window.__ZMED_SLICE_SYNC_STATE = { enabled: this.userEnabled };
    this.autoCheck(`setEnabled:${reason}`);
  }

  rescanAndAttach(reason = 'manual-rescan') {
    if (!this.runtimeEnabled) return this.autoCheck(`rescanWhileDisabled:${reason}`);
    this.rescan(reason);
  }

  private autoCheck(reason: string) {
    const { viewportGridService, cornerstoneViewportService } = this.services;
    const state = viewportGridService?.getState?.() ?? {};
    const ids = getViewportIds(state);

    const stackIds = ids.filter((id) => {
      try {
        const cs = cornerstoneViewportService.getCornerstoneViewport?.(id);
        return isStackViewport(cs);
      } catch {
        return false;
      }
    });

    const shouldEnable = this.userEnabled && stackIds.length >= 2;

    if (!shouldEnable) {
      if (this.runtimeEnabled) {
        this.runtimeEnabled = false;
        this.detachAll();
        this.cache.clear();
        this.groupNormal = null;
      }
      return;
    }

    if (!this.runtimeEnabled) this.runtimeEnabled = true;
    this.rescan(`auto:${reason}`);
  }

  private rescan(reason: string) {
    if (!this.runtimeEnabled) return;

    const { viewportGridService, cornerstoneViewportService } = this.services;
    const state = viewportGridService?.getState?.() ?? {};
    const ids = getViewportIds(state);

    const stackIds = ids.filter((id) => {
      try {
        const cs = cornerstoneViewportService.getCornerstoneViewport?.(id);
        return isStackViewport(cs);
      } catch {
        return false;
      }
    });

    for (const id of stackIds) {
      if (!this.listeners.has(id)) this.attachViewport(id);
      this.ensureCache(id);
    }

    for (const [id, unsub] of this.listeners.entries()) {
      if (!stackIds.includes(id)) {
        try { unsub(); } catch {}
        this.listeners.delete(id);
        this.cache.delete(id);
        this.suppressUntil.delete(id);
      }
    }

    this.refreshGroupNormalAndScalars();
  }

  private detachAll() {
    for (const unsub of this.listeners.values()) {
      try { unsub(); } catch {}
    }
    this.listeners.clear();
    this.suppressUntil.clear();
  }

  private suppressed(viewportId: string) {
    const t = this.suppressUntil.get(viewportId);
    return typeof t === 'number' && t > now();
  }

  private suppress(viewportId: string, ms: number) {
    this.suppressUntil.set(viewportId, now() + ms);
  }

  private attachViewport(viewportId: string) {
    const { cornerstoneViewportService } = this.services;
    const csVp = cornerstoneViewportService.getCornerstoneViewport?.(viewportId);
    const vp = csVp?.getViewport?.() ?? csVp;
    const el = csVp?.element ?? vp?.element;
    if (!csVp || !el) return;

    const evScroll = (Enums as any).Events?.STACK_VIEWPORT_SCROLL ?? 'STACK_VIEWPORT_SCROLL';
    const evScrollAlt = 'CORNERSTONE_STACK_VIEWPORT_SCROLL';
    const evNew = (Enums as any).Events?.STACK_NEW_IMAGE ?? 'STACK_NEW_IMAGE';
    const evNewAlt = 'CORNERSTONE_STACK_NEW_IMAGE';

    const h = () => this.scheduleFrom(viewportId, 'EVENT');

    el.addEventListener(evScroll, h);
    el.addEventListener(evScrollAlt, h);
    el.addEventListener(evNew, h);
    el.addEventListener(evNewAlt, h);

    const stackApi = getStackApi(vp);
    const unpatch = this.patchHooks(viewportId, stackApi);

    const unsub = () => {
      try { el.removeEventListener(evScroll, h); } catch {}
      try { el.removeEventListener(evScrollAlt, h); } catch {}
      try { el.removeEventListener(evNew, h); } catch {}
      try { el.removeEventListener(evNewAlt, h); } catch {}
      try { unpatch(); } catch {}
    };

    this.listeners.set(viewportId, unsub);
  }

  private patchHooks(viewportId: string, vp: any) {
    const key = '__ZMED_SLICE_SYNC_PATCHED__';
    if (vp?.[key]?.unpatch) return vp[key].unpatch as () => void;

    const state: PatchState = {};
    const self = this;

    if (typeof vp?.scroll === 'function') {
      state.scroll = vp.scroll;
      vp.scroll = function (...args: any[]) {
        const r = state.scroll.apply(this, args);
        self.scheduleFrom(viewportId, 'HOOK_scroll');
        return r;
      };
    }

    if (typeof vp?.setImageIdIndex === 'function') {
      state.setImageIdIndex = vp.setImageIdIndex;
      vp.setImageIdIndex = function (...args: any[]) {
        const r = state.setImageIdIndex.apply(this, args);
        self.scheduleFrom(viewportId, 'HOOK_setImageIdIndex');
        return r;
      };
    }

    const unpatch = () => {
      try { if (state.scroll) vp.scroll = state.scroll; } catch {}
      try { if (state.setImageIdIndex) vp.setImageIdIndex = state.setImageIdIndex; } catch {}
      try { delete vp[key]; } catch {}
    };

    vp[key] = { unpatch };
    return unpatch;
  }

  private scheduleFrom(viewportId: string, reason: string) {
    if (!this.runtimeEnabled || this.applying || this.suppressed(viewportId)) return;

    this.pending = { viewportId, reason };
    if (this.raf) return;

    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const p = this.pending;
      this.pending = null;
      if (p) this.syncFrom(p.viewportId);
    });
  }

  private ensureCache(viewportId: string) {
    const { cornerstoneViewportService } = this.services;
    const csVp = cornerstoneViewportService.getCornerstoneViewport?.(viewportId);
    const vp = csVp?.getViewport?.() ?? csVp;
    const ids = getImageIds(vp);

    if (!ids.length) {
      this.cache.delete(viewportId);
      return;
    }

    const cur = this.cache.get(viewportId);
    const same =
      cur &&
      cur.imageIds.length === ids.length &&
      cur.imageIds[0] === ids[0] &&
      cur.imageIds[ids.length - 1] === ids[ids.length - 1];

    if (same) return;

    let seriesNormal: [number, number, number] | null = null;
    for (const id of ids) {
      const n = seriesNormalFromImage(id);
      if (n) { seriesNormal = n; break; }
    }

    this.cache.set(viewportId, { imageIds: ids, scalars: [], seriesNormal, alignedToGroup: false });
  }

  private refreshGroupNormalAndScalars() {
    let newGroup: [number, number, number] | null = null;
    for (const e of this.cache.values()) {
      if (e.seriesNormal) { newGroup = e.seriesNormal; break; }
    }

    if (!newGroup) {
      this.groupNormal = null;
      for (const e of this.cache.values()) { e.scalars = []; e.alignedToGroup = false; }
      return;
    }

    if (!this.groupNormal || absDot(this.groupNormal, newGroup) < 0.999) this.groupNormal = newGroup;

    for (const [id] of this.cache.entries()) this.rebuildScalars(id);
  }

  private rebuildScalars(viewportId: string) {
    const e = this.cache.get(viewportId);
    if (!e) return;

    if (!this.groupNormal || !e.imageIds.length) {
      e.scalars = [];
      e.alignedToGroup = false;
      return;
    }

    const compatible = !!e.seriesNormal && absDot(e.seriesNormal, this.groupNormal) >= 0.98;
    if (!compatible) {
      e.scalars = [];
      e.alignedToGroup = false;
      return;
    }

    const scalars = new Array(e.imageIds.length);
    let ok = 0;

    for (let i = 0; i < e.imageIds.length; i++) {
      const s = scalarByNormal(e.imageIds[i], this.groupNormal);
      scalars[i] = s == null ? Number.NaN : s;
      if (Number.isFinite(scalars[i])) ok++;
    }

    e.scalars = scalars;
    e.alignedToGroup = ok >= 2;
  }

  private syncFrom(sourceViewportId: string) {
    if (!this.runtimeEnabled) return;

    const { cornerstoneViewportService } = this.services;
    const srcCs = cornerstoneViewportService.getCornerstoneViewport?.(sourceViewportId);
    const srcVp = srcCs?.getViewport?.() ?? srcCs;
    if (!srcVp) return;

    this.ensureCache(sourceViewportId);

    const srcIds = getImageIds(srcVp);
    if (!srcIds.length) return;

    const srcIdx = Math.max(0, Math.min(srcIds.length - 1, getIndex(srcVp)));
    let srcScalar: number | null = null;

    if (this.groupNormal) {
      const entry = this.cache.get(sourceViewportId);
      const fromCache = entry?.scalars?.[srcIdx];
      if (Number.isFinite(fromCache)) srcScalar = fromCache;
      if (srcScalar == null) {
        const s = scalarByNormal(srcIds[srcIdx], this.groupNormal);
        if (s != null) srcScalar = s;
      }
    }

    this.applying = true;
    try {
      for (const targetId of this.listeners.keys()) {
        if (targetId === sourceViewportId) continue;
        this.propagate(targetId, srcIdx, srcIds.length, srcScalar);
      }
    } finally {
      this.applying = false;
    }
  }

  private propagate(targetId: string, srcIdx: number, srcLen: number, srcScalar: number | null) {
    const { cornerstoneViewportService } = this.services;
    const tgtCs = cornerstoneViewportService.getCornerstoneViewport?.(targetId);
    const tgtVp = tgtCs?.getViewport?.() ?? tgtCs;
    if (!tgtVp) return;

    const tgtIds = getImageIds(tgtVp);
    if (!tgtIds.length) return;

    this.ensureCache(targetId);
    const entry = this.cache.get(targetId);

    let tgtIdx: number;
    if (srcScalar != null && entry?.alignedToGroup && entry.scalars.length) {
      tgtIdx = nearestIndex(entry.scalars, srcScalar);
    } else {
      tgtIdx = percentFallback(srcIdx, srcLen, tgtIds.length);
    }

    tgtIdx = Math.max(0, Math.min(tgtIds.length - 1, tgtIdx));
    if (getIndex(tgtVp) === tgtIdx) return;

    this.suppress(targetId, 120);
    void setIndex(tgtVp, tgtIdx).catch(() => {});
  }
}
