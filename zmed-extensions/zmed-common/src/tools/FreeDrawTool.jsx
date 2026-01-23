import { useEffect, useRef, useState } from 'react';

const EVT_TOGGLE = 'ohif:freedraw:toggle';
const EVT_SET = 'ohif:freedraw:set';
const EVT_CLEAR = 'ohif:freedraw:clear';

type WorldPoint = [number, number, number];
type Stroke = { points: WorldPoint[] };

const isTextInput = (t: EventTarget | null) => {
  const el = t as any;
  const tag = String(el?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
};

const ensureRelative = (el: HTMLElement) => {
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
};

const getViewportIds = (state: any): string[] => {
  const v = state?.viewports;
  if (!v) return [];
  if (v instanceof Map) return Array.from(v.keys());
  if (Array.isArray(v)) return v.map((x: any) => x?.viewportId ?? x?.id).filter(Boolean);
  if (typeof v === 'object') return Object.keys(v);
  return [];
};

const getCoreViewport = (cornerstoneViewportService: any, viewportId: string) => {
  const cs = cornerstoneViewportService?.getCornerstoneViewport?.(viewportId);
  if (!cs) return null;
  return (typeof cs.getViewport === 'function' ? cs.getViewport() : cs) ?? null;
};

const getCurrentImageId = (csViewport: any): string | null => {
  if (!csViewport) return null;
  if (typeof csViewport.getCurrentImageId === 'function') {
    const v = csViewport.getCurrentImageId();
    return typeof v === 'string' ? v : null;
  }
  if (typeof csViewport.getImageId === 'function') {
    const v = csViewport.getImageId();
    return typeof v === 'string' ? v : null;
  }
  if (typeof csViewport.getImageIds === 'function') {
    const ids = csViewport.getImageIds();
    if (Array.isArray(ids) && ids.length) {
      const idx =
        (typeof csViewport.getCurrentImageIdIndex === 'function' && csViewport.getCurrentImageIdIndex()) ||
        (typeof csViewport.getCurrentImageIndex === 'function' && csViewport.getCurrentImageIndex()) ||
        0;
      const i = Number.isFinite(idx) ? Math.max(0, Math.min(ids.length - 1, idx)) : 0;
      return typeof ids[i] === 'string' ? ids[i] : typeof ids[0] === 'string' ? ids[0] : null;
    }
  }
  return null;
};

const normalizeImageIdKey = (imageId: string) => {
  const [base, q] = imageId.split('?');
  if (!q) return base;
  try {
    const sp = new URLSearchParams(q);
    const frame = sp.get('frame');
    return frame != null ? `${base}?frame=${frame}` : base;
  } catch {
    return base;
  }
};

const resolveSliceKey = (cornerstoneViewportService: any, viewportId: string | null) => {
  if (!viewportId) return null;
  const cs = cornerstoneViewportService?.getCornerstoneViewport?.(viewportId);
  const imageId = getCurrentImageId(cs);
  if (!imageId) return `viewport:${viewportId}`;
  return `slice:${normalizeImageIdKey(imageId)}`;
};

const worldToCanvas = (vp: any, wp: WorldPoint) => {
  if (!vp?.worldToCanvas) return null;
  const out = vp.worldToCanvas(wp);
  return Array.isArray(out) && out.length >= 2 ? { x: out[0], y: out[1] } : null;
};

const canvasToWorld = (vp: any, x: number, y: number): WorldPoint | null => {
  if (!vp?.canvasToWorld) return null;
  const out = vp.canvasToWorld([x, y]);
  return Array.isArray(out) && out.length >= 3 ? [out[0], out[1], out[2]] : null;
};

type Overlay = {
  viewportId: string;
  hostEl: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ro: ResizeObserver;
  coreViewport: any | null;
  currentKey: string | null;
  cleanup: () => void;
};

export default function FreeDrawTool({ servicesManager }: any) {
  const viewportGridService = servicesManager?.services?.viewportGridService;
  const cornerstoneViewportService = servicesManager?.services?.cornerstoneViewportService;
  if (!viewportGridService || !cornerstoneViewportService) return null;

  const [enabled, setEnabled] = useState<boolean>(() => !!(window as any).__FREEDRAW_STATE?.enabled);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const activeViewportIdRef = useRef<string | null>(viewportGridService.getState?.()?.activeViewportId ?? null);

  const overlaysRef = useRef<Map<string, Overlay>>(new Map());

  const strokesByKeyRef = useRef<Map<string, Stroke[]>>(new Map());
  const redoByKeyRef = useRef<Map<string, Stroke[]>>(new Map());

  const activeKeyRef = useRef<string | null>(null);
  const currentStrokesRef = useRef<Stroke[]>([]);
  const currentRedoRef = useRef<Stroke[]>([]);

  const drawingRef = useRef(false);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const drawingViewportIdRef = useRef<string | null>(null);

  const ensureBucket = (key: string) => {
    let strokes = strokesByKeyRef.current.get(key);
    if (!strokes) { strokes = []; strokesByKeyRef.current.set(key, strokes); }
    let redo = redoByKeyRef.current.get(key);
    if (!redo) { redo = []; redoByKeyRef.current.set(key, redo); }
    return { strokes, redo };
  };

  const cancelDrawing = () => {
    if (!drawingRef.current && !activeStrokeRef.current) return;
    drawingRef.current = false;
    const s = activeStrokeRef.current;
    if (s && s.points.length < 2) {
      const arr = currentStrokesRef.current;
      const i = arr.indexOf(s);
      if (i >= 0) arr.splice(i, 1);
    }
    activeStrokeRef.current = null;
    drawingViewportIdRef.current = null;
  };

  const setActiveSlicePointers = (reason?: string) => {
    const vpId = activeViewportIdRef.current;
    const key = resolveSliceKey(cornerstoneViewportService, vpId);
    if (!key) return;
    if (activeKeyRef.current === key) return;

    cancelDrawing();
    activeKeyRef.current = key;

    const { strokes, redo } = ensureBucket(key);
    currentStrokesRef.current = strokes;
    currentRedoRef.current = redo;
  };

  const redrawOverlay = (ov: Overlay) => {
    const w = ov.hostEl.clientWidth;
    const h = ov.hostEl.clientHeight;
    ov.ctx.clearRect(0, 0, w, h);

    if (!ov.coreViewport) ov.coreViewport = getCoreViewport(cornerstoneViewportService, ov.viewportId);
    const vp = ov.coreViewport;
    if (!vp) return;

    const key = ov.currentKey ?? resolveSliceKey(cornerstoneViewportService, ov.viewportId);
    ov.currentKey = key;
    if (!key) return;

    const strokes = strokesByKeyRef.current.get(key);
    if (!strokes?.length) return;

    for (const s of strokes) {
      if (s.points.length < 2) continue;
      const p0 = worldToCanvas(vp, s.points[0]);
      if (!p0) continue;
      ov.ctx.beginPath();
      ov.ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < s.points.length; i++) {
        const pi = worldToCanvas(vp, s.points[i]);
        if (pi) ov.ctx.lineTo(pi.x, pi.y);
      }
      ov.ctx.stroke();
    }
  };

  const redrawAll = () => {
    for (const ov of overlaysRef.current.values()) redrawOverlay(ov);
  };

  const redrawKey = (key: string | null) => {
    if (!key) return;
    for (const ov of overlaysRef.current.values()) {
      const k = ov.currentKey ?? resolveSliceKey(cornerstoneViewportService, ov.viewportId);
      ov.currentKey = k;
      if (k === key) redrawOverlay(ov);
    }
  };

  const createOverlay = (viewportId: string): Overlay | null => {
    const csVp = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    const hostEl: HTMLElement | undefined = csVp?.element;
    if (!hostEl) return null;

    ensureRelative(hostEl);

    const sel = `canvas[data-ohif-free-draw="1"][data-viewport-id="${viewportId}"]`;
    let canvas = hostEl.querySelector(sel) as HTMLCanvasElement | null;

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('data-ohif-free-draw', '1');
      canvas.setAttribute('data-viewport-id', viewportId);
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '1';
      canvas.style.pointerEvents = 'none';
      canvas.style.background = 'transparent';
      hostEl.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const dpr = window.devicePixelRatio || 1;

    const ov: Overlay = {
      viewportId,
      hostEl,
      canvas,
      ctx,
      ro: new ResizeObserver(() => resize()),
      coreViewport: getCoreViewport(cornerstoneViewportService, viewportId),
      currentKey: resolveSliceKey(cornerstoneViewportService, viewportId),
      cleanup: () => {},
    };

    const resize = () => {
      const w = hostEl.clientWidth;
      const h = hostEl.clientHeight;
      canvas!.width = Math.max(1, Math.floor(w * dpr));
      canvas!.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      redrawOverlay(ov);
    };

    const onRendered = () => {
      const cur = overlaysRef.current.get(viewportId);
      if (!cur) return;
      cur.coreViewport = getCoreViewport(cornerstoneViewportService, viewportId);
      cur.currentKey = resolveSliceKey(cornerstoneViewportService, viewportId);
      if (viewportId === activeViewportIdRef.current) setActiveSlicePointers('render');
      redrawOverlay(cur);
    };

    const RENDER_EVENTS = ['CORNERSTONE_IMAGE_RENDERED', 'CORNERSTONE_VIEWPORT_RENDERED'];

    for (const ev of RENDER_EVENTS) hostEl.addEventListener(ev as any, onRendered);

    const getPos = (e: PointerEvent) => {
      const r = hostEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDownCapture = (e: PointerEvent) => {
      if (!enabledRef.current) return;
      if (viewportId !== activeViewportIdRef.current) return;
      if (isTextInput(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const cur = overlaysRef.current.get(viewportId);
      const vp = cur?.coreViewport ?? getCoreViewport(cornerstoneViewportService, viewportId);
      if (!vp?.canvasToWorld || !vp?.worldToCanvas) return;

      e.preventDefault();
      e.stopPropagation();

      setActiveSlicePointers('down');

      cancelDrawing();
      if (currentRedoRef.current.length) currentRedoRef.current.length = 0;

      drawingRef.current = true;
      drawingViewportIdRef.current = viewportId;

      try { (hostEl as any).setPointerCapture?.(e.pointerId); } catch {}

      const p = getPos(e);
      const wp = canvasToWorld(vp, p.x, p.y);
      if (!wp) { drawingRef.current = false; drawingViewportIdRef.current = null; return; }

      const stroke: Stroke = { points: [wp] };
      activeStrokeRef.current = stroke;
      currentStrokesRef.current.push(stroke);
    };

    const onMoveCapture = (e: PointerEvent) => {
      if (!enabledRef.current || !drawingRef.current) return;
      if (drawingViewportIdRef.current !== viewportId) return;

      e.preventDefault();
      e.stopPropagation();

      const cur = overlaysRef.current.get(viewportId);
      const vp = cur?.coreViewport;
      const stroke = activeStrokeRef.current;
      if (!cur || !vp || !stroke) return;

      const p = getPos(e);
      const wp = canvasToWorld(vp, p.x, p.y);
      if (!wp) return;

      stroke.points.push(wp);
      redrawOverlay(cur);
    };

    const onUpCapture = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      if (drawingViewportIdRef.current !== viewportId) return;

      e.preventDefault();
      e.stopPropagation();

      drawingRef.current = false;

      const s = activeStrokeRef.current;
      if (s && s.points.length < 2) {
        const arr = currentStrokesRef.current;
        const i = arr.indexOf(s);
        if (i >= 0) arr.splice(i, 1);
      }

      activeStrokeRef.current = null;
      drawingViewportIdRef.current = null;

      redrawKey(activeKeyRef.current);
    };

    hostEl.addEventListener('pointerdown', onDownCapture, true);
    hostEl.addEventListener('pointermove', onMoveCapture, true);
    hostEl.addEventListener('pointerup', onUpCapture, true);
    hostEl.addEventListener('pointercancel', onUpCapture, true);

    ov.cleanup = () => {
      try { ov.ro.disconnect(); } catch {}
      for (const ev of RENDER_EVENTS) {
        try { hostEl.removeEventListener(ev as any, onRendered); } catch {}
      }
      try { hostEl.removeEventListener('pointerdown', onDownCapture, true); } catch {}
      try { hostEl.removeEventListener('pointermove', onMoveCapture, true); } catch {}
      try { hostEl.removeEventListener('pointerup', onUpCapture, true); } catch {}
      try { hostEl.removeEventListener('pointercancel', onUpCapture, true); } catch {}
      try { if (canvas.parentElement === hostEl) hostEl.removeChild(canvas); } catch {}
    };

    ov.ro.observe(hostEl);
    resize();

    return ov;
  };

  const ensureOverlay = (viewportId: string | null, attempt = 0) => {
    if (!viewportId) return;
    if (overlaysRef.current.has(viewportId)) return;

    const ov = createOverlay(viewportId);
    if (ov) {
      overlaysRef.current.set(viewportId, ov);
      redrawOverlay(ov);
      return;
    }

    if (attempt < 8) requestAnimationFrame(() => ensureOverlay(viewportId, attempt + 1));
  };

  const rescan = () => {
    const state = viewportGridService.getState?.() ?? {};
    const ids = getViewportIds(state);

    for (const id of ids) ensureOverlay(id);

    for (const [id, ov] of overlaysRef.current.entries()) {
      if (!ids.includes(id)) {
        try { ov.cleanup(); } catch {}
        overlaysRef.current.delete(id);
      }
    }

    setActiveSlicePointers('rescan');
    redrawAll();
  };

  const setActiveViewport = (viewportId: string | null) => {
    activeViewportIdRef.current = viewportId;
    ensureOverlay(viewportId);
    setActiveSlicePointers('active');
    redrawAll();
  };

  const undo = () => {
    if (!enabledRef.current) return;
    cancelDrawing();
    const s = currentStrokesRef.current;
    if (!s.length) return;
    const last = s.pop()!;
    currentRedoRef.current.push(last);
    redrawKey(activeKeyRef.current);
  };

  const redo = () => {
    if (!enabledRef.current) return;
    cancelDrawing();
    const r = currentRedoRef.current;
    if (!r.length) return;
    const last = r.pop()!;
    currentStrokesRef.current.push(last);
    redrawKey(activeKeyRef.current);
  };

  useEffect(() => {
    rescan();
    setActiveViewport(viewportGridService.getState?.()?.activeViewportId ?? null);

    const sActive = viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, (p: any) => {
      const id = p?.viewportId ?? viewportGridService.getState?.()?.activeViewportId ?? null;
      setActiveViewport(id);
    });

    const sGrid = viewportGridService.subscribe(viewportGridService.EVENTS.GRID_STATE_CHANGED, () => rescan());
    const sReady = viewportGridService.subscribe(viewportGridService.EVENTS.VIEWPORTS_READY, () => {
      rescan();
      setActiveViewport(viewportGridService.getState?.()?.activeViewportId ?? null);
    });

    return () => {
      sActive?.unsubscribe?.();
      sGrid?.unsubscribe?.();
      sReady?.unsubscribe?.();
      for (const ov of overlaysRef.current.values()) {
        try { ov.cleanup(); } catch {}
      }
      overlaysRef.current.clear();
    };
  }, [viewportGridService, cornerstoneViewportService]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabledRef.current) return;
      if (isTextInput(e.target)) return;

      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (!ctrlOrCmd || e.altKey) return;

      const code = String(e.code || '').toLowerCase();
      const key = String(e.key || '').toLowerCase();

      const isZ = code === 'keyz' || key === 'z';
      const isY = code === 'keyy' || key === 'y';

      if (isZ && e.shiftKey) { e.preventDefault(); e.stopPropagation(); redo(); return; }
      if (isZ) { e.preventDefault(); e.stopPropagation(); undo(); return; }
      if (isY) { e.preventDefault(); e.stopPropagation(); redo(); }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    const onToggle = () => setEnabled((p) => !p);

    const onSet = (e: any) => {
      const v = !!e?.detail?.enabled;
      (window as any).__FREEDRAW_STATE = { ...(window as any).__FREEDRAW_STATE, enabled: v };
      enabledRef.current = v;
      setEnabled(v);
      setActiveSlicePointers('set');
      redrawAll();
    };

    const onClear = (e: any) => {
      const viewportId = e?.detail?.viewportId ?? null;
      cancelDrawing();

      if (viewportId === null) {
        strokesByKeyRef.current.clear();
        redoByKeyRef.current.clear();
        activeKeyRef.current = null;
        currentStrokesRef.current = [];
        currentRedoRef.current = [];
        redrawAll();
        return;
      }

      const key = resolveSliceKey(cornerstoneViewportService, viewportId);
      if (!key) return;

      strokesByKeyRef.current.delete(key);
      redoByKeyRef.current.delete(key);

      if (key === activeKeyRef.current) {
        const buckets = ensureBucket(key);
        currentStrokesRef.current = buckets.strokes;
        currentRedoRef.current = buckets.redo;
      }

      redrawKey(key);
    };

    window.addEventListener(EVT_TOGGLE, onToggle);
    window.addEventListener(EVT_SET, onSet);
    window.addEventListener(EVT_CLEAR, onClear);

    return () => {
      window.removeEventListener(EVT_TOGGLE, onToggle);
      window.removeEventListener(EVT_SET, onSet);
      window.removeEventListener(EVT_CLEAR, onClear);
    };
  }, [cornerstoneViewportService]);

  useEffect(() => {
    enabledRef.current = enabled;
    setActiveSlicePointers('enabled');
    redrawAll();
  }, [enabled]);

  return null;
}
