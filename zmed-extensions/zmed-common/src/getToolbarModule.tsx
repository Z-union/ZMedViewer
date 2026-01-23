import ToolbarDivider from './Toolbar/ToolbarDivider';
import ToolbarLayoutSelectorWithServices from './Toolbar/ToolbarLayoutSelector';
import ToolbarSplitButtonWithServices from './Toolbar/ToolbarSplitButtonWithServices';
import ToolbarButtonGroupWithServices from './Toolbar/ToolbarButtonGroupWithServices';
import { ProgressDropdownWithService } from './components/ProgressDropdownWithService';
import { ToolbarButton } from '@ohif/ui';
import type { withAppTypes } from '@ohif/core/types';
import { Enums } from '@cornerstonejs/core';

const ACTIVE = '!text-black bg-primary-light';
const INACTIVE = '!text-common-bright hover:!bg-primary-dark hover:!text-primary-light';
const DISABLED = '!text-common-bright opacity-50 cursor-not-allowed';

const isStackViewport = (csViewport: any) => {
  const v = typeof csViewport?.getViewport === 'function' ? csViewport.getViewport() : csViewport;
  const t = String(v?.type || v?.viewportType || csViewport?.viewportType || '');
  if (t) return t.toLowerCase().includes('stack');
  return /stack/i.test(v?.constructor?.name || csViewport?.constructor?.name || '');
};

const getViewportIds = (state: any): string[] => {
  const v = state?.viewports;
  if (!v) return [];
  if (v instanceof Map) return Array.from(v.keys());
  if (Array.isArray(v)) return v.map((x: any) => x?.viewportId ?? x?.id).filter(Boolean);
  if (typeof v === 'object') return Object.keys(v);
  return [];
};

const freeDrawEnabled = () => !!(window as any)?.__FREEDRAW_STATE?.enabled;
const sliceSyncEnabled = () => !!(window as any)?.__ZMED_SLICE_SYNC_STATE?.enabled;

export default function getToolbarModule({ commandsManager, servicesManager }: withAppTypes) {
  const { cineService, cornerstoneViewportService, viewportGridService } = servicesManager.services as any;

  return [
    { name: 'ohif.radioGroup', defaultComponent: ToolbarButton },
    { name: 'ohif.divider', defaultComponent: ToolbarDivider },
    { name: 'ohif.splitButton', defaultComponent: ToolbarSplitButtonWithServices },
    {
      name: 'ohif.layoutSelector',
      defaultComponent: (props: any) => ToolbarLayoutSelectorWithServices({ ...props, commandsManager, servicesManager }),
    },
    { name: 'ohif.buttonGroup', defaultComponent: ToolbarButtonGroupWithServices },
    { name: 'ohif.progressDropdown', defaultComponent: ProgressDropdownWithService },

    {
      name: 'evaluate.group.promoteToPrimary',
      evaluate: ({ button, itemId }: any) => {
        const { items } = button.props;
        if (!itemId) return { primary: button.props.primary, items };
        const clicked = items.find((it: any) => it.id === itemId || it.itemId === itemId);
        return { primary: clicked, items };
      },
    },

    { name: 'evaluate.cine', evaluate: () => ({ className: cineService.getState().isCineEnabled ? '!text-primary-active' : INACTIVE }) },

    {
      name: 'evaluate.freedraw',
      evaluate: ({ viewportId }: any) => {
        const enabled = freeDrawEnabled();
        const vid = viewportId ?? viewportGridService.getState().activeViewportId;
        const csVp = vid ? cornerstoneViewportService.getCornerstoneViewport(vid) : null;

        if (!csVp || !isStackViewport(csVp)) {
          return { disabled: true, disabledText: 'Free Draw работает только в Stack (2D) viewport', className: DISABLED, toggled: false };
        }

        return { disabled: false, className: enabled ? ACTIVE : INACTIVE, toggled: enabled, isActive: enabled, isToggled: enabled };
      },
    },

    {
      name: 'evaluate.zmed.imageSliceSync',
      evaluate: ({ viewportId }: any) => {
        const enabled = sliceSyncEnabled();
        const state = viewportGridService.getState();
        const ids = getViewportIds(state);

        const stackIds = ids.filter((id) => {
          try {
            const info = cornerstoneViewportService.getViewportInfo?.(id);
            if (info?.getViewportType) return info.getViewportType() === Enums.ViewportType.STACK;
          } catch {}
          return isStackViewport(cornerstoneViewportService.getCornerstoneViewport?.(id));
        });

        const vid = viewportId ?? state?.activeViewportId;
        const activeIsStack = (() => {
          try {
            const info = vid ? cornerstoneViewportService.getViewportInfo?.(vid) : null;
            if (info?.getViewportType) return info.getViewportType() === Enums.ViewportType.STACK;
          } catch {}
          return !!vid && isStackViewport(cornerstoneViewportService.getCornerstoneViewport?.(vid));
        })();

        if (!activeIsStack) return { disabled: true, disabledText: 'Slice Sync работает только в Stack (2D) viewport', className: DISABLED };
        if (stackIds.length < 2) return { disabled: true, disabledText: 'Нужно минимум 2 Stack viewport для синхронизации', className: DISABLED };

        return { disabled: false, toggled: enabled, className: enabled ? '!text-primary-active' : INACTIVE, isActive: enabled, isToggled: enabled };
      },
    },
  ];
}
