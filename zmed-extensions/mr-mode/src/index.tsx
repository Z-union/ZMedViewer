import { hotkeys } from '@ohif/core';
import type { withAppTypes } from '@ohif/core/types';
import toolbarButtons from './toolbarButtons';
import { id } from './id.js';
import initToolGroups from './initToolGroups.js';
import moreTools from './moreTools';

const NON_IMAGE_MODALITIES = ['SM', 'ECG', 'SR', 'SEG', 'RTSTRUCT'];

const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-measurement-tracking': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-rt': '^3.0.0',
  '@ohif/extension-dicom-pdf': '^3.0.1',
  '@ohif/extension-dicom-video': '^3.0.1',
};

const ohif = {
  layout: 'zmed-common.layoutTemplateModule.viewerLayout',
  sopStack: '@ohif/extension-default.sopClassHandlerModule.stack',
};

const tracked = {
  thumb: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};

const dicom = {
  sr: {
    sop: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr',
    viewport: '@ohif/extension-cornerstone-dicom-sr.viewportModule.dicom-sr',
  },
  video: {
    sop: '@ohif/extension-dicom-video.sopClassHandlerModule.dicom-video',
    viewport: '@ohif/extension-dicom-video.viewportModule.dicom-video',
  },
  pdf: {
    sop: '@ohif/extension-dicom-pdf.sopClassHandlerModule.dicom-pdf',
    viewport: '@ohif/extension-dicom-pdf.viewportModule.dicom-pdf',
  },
  seg: {
    sop: '@ohif/extension-cornerstone-dicom-seg.sopClassHandlerModule.dicom-seg',
    viewport: '@ohif/extension-cornerstone-dicom-seg.viewportModule.dicom-seg',
    panel: '@ohif/extension-cornerstone-dicom-seg.panelModule.panelSegmentation',
  },
  rt: {
    sop: '@ohif/extension-cornerstone-dicom-rt.sopClassHandlerModule.dicom-rt',
    viewport: '@ohif/extension-cornerstone-dicom-rt.viewportModule.dicom-rt',
  },
};

const panelZMedMR = { panel: 'zmed-common.panelModule.panelZMedMR' };

function modeFactory({ modeConfiguration }: any) {
  return {
    id,
    routeName: 'mr-viewer',
    displayName: 'MR Viewer',

    onModeEnter({ servicesManager, extensionManager, commandsManager }: withAppTypes) {
      const { measurementService, toolbarService, toolGroupService, customizationService } =
        servicesManager.services as any;

      measurementService?.clearMeasurements?.();

      initToolGroups(extensionManager, toolGroupService, commandsManager, (this as any).labelConfig);

      toolbarService?.addButtons?.([...toolbarButtons, ...moreTools]);
      toolbarService?.createButtonSection?.('primary', [
        'FreeDraw',
        'MeasurementTools',
        'Zoom',
        'Pan',
        'TrackballRotate',
        'WindowLevel',
        'Capture',
        'Layout',
        'Crosshairs',
        'MoreTools',
      ]);

      customizationService?.addModeCustomizations?.([{ id: 'segmentation.panel', disableEditing: true }]);
    },

    onModeExit({ servicesManager }: withAppTypes) {
      const {
        toolGroupService,
        syncGroupService,
        segmentationService,
        cornerstoneViewportService,
        uiDialogService,
        uiModalService,
      } = servicesManager.services as any;

      uiDialogService?.dismissAll?.();
      uiModalService?.hide?.();

      toolGroupService?.destroy?.();
      syncGroupService?.destroy?.();
      segmentationService?.destroy?.();
      cornerstoneViewportService?.destroy?.();
    },

    validationTags: { study: [], series: [] },

    isValidMode({ modalities }: any) {
      return modalities
        .split('\\')
        .some((m: string) => !NON_IMAGE_MODALITIES.includes(m));
    },

    routes: [
      {
        path: 'zmed-longitudinal',
        layoutTemplate: () => ({
          id: ohif.layout,
          props: {
            leftPanels: [tracked.thumb],
            rightPanels: [panelZMedMR.panel, dicom.seg.panel],
            rightPanelDefaultClosed: true,
            viewports: [
              { namespace: tracked.viewport, displaySetsToDisplay: [ohif.sopStack] },
              { namespace: dicom.sr.viewport, displaySetsToDisplay: [dicom.sr.sop] },
              { namespace: dicom.video.viewport, displaySetsToDisplay: [dicom.video.sop] },
              { namespace: dicom.pdf.viewport, displaySetsToDisplay: [dicom.pdf.sop] },
              { namespace: dicom.seg.viewport, displaySetsToDisplay: [dicom.seg.sop] },
              { namespace: dicom.rt.viewport, displaySetsToDisplay: [dicom.rt.sop] },
            ],
          },
        }),
      },
    ],

    extensions: extensionDependencies,
    hangingProtocol: 'default',
    sopClassHandlers: [
      dicom.video.sop,
      dicom.seg.sop,
      ohif.sopStack,
      dicom.pdf.sop,
      dicom.sr.sop,
      dicom.rt.sop,
    ],
    hotkeys: [...hotkeys.defaults.hotkeyBindings],
    ...modeConfiguration,
  };
}

const mode = { id, modeFactory, extensionDependencies };
export default mode;

export { initToolGroups, toolbarButtons };
