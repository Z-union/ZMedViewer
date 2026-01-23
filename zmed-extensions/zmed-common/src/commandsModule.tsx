import { ServicesManager, Types } from '@ohif/core';
import GPTAnalyzer from './GPTAnalyzer/GPTAnalyzer';
import ZMedSliceSyncController from './sliceSync';

const EVT_SET = 'ohif:freedraw:set';
const EVT_CLEAR = 'ohif:freedraw:clear';

type FreeDrawState = {
  enabled: boolean;
  prevPrimaryByViewport: Record<string, string | null>;
  autoEnabledOnce?: boolean;
};

declare global {
  interface Window {
    __ZMED_SLICE_SYNC?: ZMedSliceSyncController;
    __ZMED_SLICE_SYNC_STATE?: { enabled: boolean };
    __FREEDRAW_STATE?: FreeDrawState;
  }
}

let __localSliceSync: ZMedSliceSyncController | undefined;

function getFreeDrawState(): FreeDrawState {
  const w = window as any;
  if (!w.__FREEDRAW_STATE) w.__FREEDRAW_STATE = { enabled: false, prevPrimaryByViewport: {}, autoEnabledOnce: false };
  return w.__FREEDRAW_STATE;
}

function isStackViewport(csViewport: any): boolean {
  const v = typeof csViewport?.getViewport === 'function' ? csViewport.getViewport() : csViewport;
  const t = String(v?.type || v?.viewportType || csViewport?.viewportType || '');
  if (t) return t.toLowerCase().includes('stack');
  return /stack/i.test(v?.constructor?.name || csViewport?.constructor?.name || '');
}

function getOrCreateSliceSync(sm: ServicesManager): ZMedSliceSyncController | null {
  const { viewportGridService, cornerstoneViewportService } = sm.services as any;
  if (!viewportGridService || !cornerstoneViewportService) return null;

  if (window.__ZMED_SLICE_SYNC) return window.__ZMED_SLICE_SYNC;

  if (!__localSliceSync) {
    __localSliceSync = new ZMedSliceSyncController({ viewportGridService, cornerstoneViewportService } as any);
    try { __localSliceSync.start(); } catch {}
  }

  window.__ZMED_SLICE_SYNC = __localSliceSync;
  window.__ZMED_SLICE_SYNC_STATE = window.__ZMED_SLICE_SYNC_STATE ?? { enabled: true };
  return __localSliceSync;
}

export default function commandsModule({
  servicesManager,
  commandsManager,
}: Types.Extensions.ExtensionParams): Types.Extensions.CommandsModule {
  const sm = servicesManager as ServicesManager;
  const {
    uiNotificationService,
    viewportGridService,
    cornerstoneViewportService,
    toolGroupService,
    toolbarService: _toolbarService,
  } = sm.services as any;

  const toolbarService = _toolbarService ?? (sm.services as any).toolBarService;
  const { UIModalService } = sm.services as any;

  const sliceSync = getOrCreateSliceSync(sm);

  const refreshToolbar = (reason: string) => {
    const viewportId = viewportGridService?.getState?.()?.activeViewportId;
    toolbarService?.refreshToolbarState?.({ viewportId, source: 'ZMed', reason });
  };

  const ensureActiveStack = (viewportId: string | null, title: string) => {
    if (!viewportId) {
      uiNotificationService?.show?.({ title, message: 'No active viewport', type: 'warning' });
      return null;
    }
    const csVp = cornerstoneViewportService?.getCornerstoneViewport?.(viewportId);
    if (!csVp) {
      uiNotificationService?.show?.({ title, message: 'This tool works only on image viewports', type: 'warning' });
      return null;
    }
    if (!isStackViewport(csVp)) {
      uiNotificationService?.show?.({ title, message: 'Работает только в Stack (2D) viewport', type: 'warning' });
      return null;
    }
    return csVp;
  };

  const suppressPrimary = (enabled: boolean, viewportId: string) => {
    const st = getFreeDrawState();
    const tg = toolGroupService?.getToolGroupForViewport?.(viewportId);
    if (!tg) return;

    if (enabled) {
      if (st.prevPrimaryByViewport[viewportId] !== undefined) return;
      const prev =
        tg.getActivePrimaryMouseButtonTool?.() ??
        tg.getActivePrimaryTool?.() ??
        null;

      st.prevPrimaryByViewport[viewportId] = prev;
      if (prev && tg.setToolPassive) tg.setToolPassive(prev);
      return;
    }

    const prev = st.prevPrimaryByViewport[viewportId] ?? null;
    delete st.prevPrimaryByViewport[viewportId];
    if (prev) {
      try { commandsManager.runCommand('setToolActive', { toolName: prev }, 'CORNERSTONE'); } catch {}
    }
  };

  const restoreSuppressed = (opts?: { skipViewportId?: string }) => {
    const st = getFreeDrawState();
    const skip = opts?.skipViewportId;
    for (const viewportId of Object.keys(st.prevPrimaryByViewport)) {
      const prev = st.prevPrimaryByViewport[viewportId];
      delete st.prevPrimaryByViewport[viewportId];
      if (skip && viewportId === skip) continue;
      if (prev) {
        try { commandsManager.runCommand('setToolActive', { toolName: prev }, 'CORNERSTONE'); } catch {}
      }
    }
  };

  const setFreeDrawEnabled = (enabled: boolean, reason: string) => {
    const st = getFreeDrawState();
    st.enabled = enabled;
    window.__FREEDRAW_STATE = { ...window.__FREEDRAW_STATE, enabled };
    window.dispatchEvent(new CustomEvent(EVT_SET, { detail: { enabled } }));
    refreshToolbar(`freedraw:${reason}`);
  };

  const disableFreeDrawForSwitch = (viewportId: string) => {
    const st = getFreeDrawState();
    if (!st.enabled) return;
    restoreSuppressed({ skipViewportId: viewportId });
    setFreeDrawEnabled(false, 'switchTool');
  };

  const actions: Record<string, any> = {
    openGPTAnalyzer() {
      const { activeViewportId } = viewportGridService.getState();
      const csVp = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
      const vp = csVp?.getViewport?.() ?? csVp;
      if (!vp) {
        uiNotificationService?.show?.({ title: 'ZMed Analyzer', message: 'Image cannot be downloaded', type: 'error' });
        return;
      }
      UIModalService.show({
        content: GPTAnalyzer,
        contentProps: { activeViewportId, onClose: UIModalService.hide, cornerstoneViewportService, viewPort: vp },
        title: 'ZMed Analyzer',
      });
    },

    toggleFreeDraw() {
      const { activeViewportId } = viewportGridService.getState();
      if (!ensureActiveStack(activeViewportId, 'Free Draw')) return;

      const st = getFreeDrawState();
      const next = !st.enabled;

      if (next) {
        suppressPrimary(true, activeViewportId);
        setFreeDrawEnabled(true, 'toggle');
      } else {
        restoreSuppressed();
        setFreeDrawEnabled(false, 'toggle');
      }
    },

    enableFreeDraw() {
      const { activeViewportId } = viewportGridService.getState();
      if (!ensureActiveStack(activeViewportId, 'Free Draw')) return;
      suppressPrimary(true, activeViewportId);
      setFreeDrawEnabled(true, 'enable');
    },

    disableFreeDraw() {
      restoreSuppressed();
      setFreeDrawEnabled(false, 'disable');
    },

    clearFreeDrawActiveViewport() {
      const { activeViewportId } = viewportGridService.getState();
      window.dispatchEvent(new CustomEvent(EVT_CLEAR, { detail: { viewportId: activeViewportId } }));
    },

    clearFreeDrawAll() {
      window.dispatchEvent(new CustomEvent(EVT_CLEAR, { detail: { viewportId: null } }));
    },

    setFreeDrawEnabled({ enabled }: { enabled: boolean }) {
      const { activeViewportId } = viewportGridService.getState();
      if (enabled) {
        if (!ensureActiveStack(activeViewportId, 'Free Draw')) return;
        suppressPrimary(true, activeViewportId);
        setFreeDrawEnabled(true, 'set');
      } else {
        restoreSuppressed();
        setFreeDrawEnabled(false, 'set');
      }
    },

    setToolActiveToolbarWithFreeDrawGuard(commandOptions: any) {
      const { activeViewportId } = viewportGridService.getState();
      if (activeViewportId) disableFreeDrawForSwitch(activeViewportId);
      commandsManager.runCommand('setToolActiveToolbar', commandOptions, 'CORNERSTONE');
    },

    'zmed:sliceSync:setEnabled'({ enabled }: { enabled: boolean }) {
      if (!sliceSync) return;
      sliceSync.setEnabled(!!enabled, 'manual');
      refreshToolbar('slicesync:setEnabled');
    },

    'zmed:sliceSync:toggle'() {
      const cur = window.__ZMED_SLICE_SYNC_STATE?.enabled ?? true;
      const next = !cur;
      if (!sliceSync) return;
      sliceSync.setEnabled(next, 'manual-toggle');
      refreshToolbar('slicesync:toggle');
    },

    'zmed:sliceSync:rescan'() {
      sliceSync?.rescanAndAttach?.('manual-rescan');
      refreshToolbar('slicesync:rescan');
    },

    'zmed:sliceSync:getState'() {
      return window.__ZMED_SLICE_SYNC_STATE ?? { enabled: true };
    },
  };

  const definitions: Record<string, Types.Extensions.CommandDefinition> = Object.fromEntries(
    Object.entries(actions).map(([k, fn]) => [k, { commandFn: fn }])
  );

  try {
    const st = getFreeDrawState();

    if (!st.autoEnabledOnce && viewportGridService?.subscribe) {
      const sub = viewportGridService.subscribe(viewportGridService.EVENTS.VIEWPORTS_READY, () => {
        st.autoEnabledOnce = true;
        actions.enableFreeDraw();
        sub?.unsubscribe?.();
      });
    }

    if (viewportGridService?.subscribe) {
      viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, (payload: any) => {
        const s = getFreeDrawState();
        if (!s.enabled) return;
        const id = payload?.viewportId ?? viewportGridService.getState?.()?.activeViewportId;
        const csVp = id ? cornerstoneViewportService.getCornerstoneViewport(id) : null;
        if (id && csVp && isStackViewport(csVp)) suppressPrimary(true, id);
        refreshToolbar('freedraw:activeViewportChanged');
      });
    }
  } catch {}

  return { actions, definitions, defaultContext: 'DEFAULT' };
}
