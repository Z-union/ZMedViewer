import type { Button, RunCommand } from '@ohif/core/types';
import { ToolbarService, ViewportGridService } from '@ohif/core';

const { createButton } = ToolbarService;

export const setToolActiveToolbar = {
  commandName: 'setToolActiveToolbarWithFreeDrawGuard',
  context: 'DEFAULT',
  commandOptions: { toolGroupIds: ['default', 'mpr', 'SRToolGroup', 'volume3d'] },
};

const refLinesListeners: RunCommand = [
  { commandName: 'setSourceViewportForReferenceLinesTool', context: 'CORNERSTONE' },
];

const csTool = (id: string, icon: string, label: string, tooltip = label) =>
  createButton({
    id,
    icon,
    label,
    tooltip,
    commands: setToolActiveToolbar,
    evaluate: 'evaluate.cornerstoneTool',
  });

const toolbarButtons: Button[] = [
  {
    id: 'FreeDraw',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'icon-tool-freehand-roi',
      label: 'Free Draw',
      tooltip: 'Free Draw',
      commands: 'toggleFreeDraw',
      evaluate: 'evaluate.freedraw',
      listeners: {
        [ViewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED]: () => ({}),
        [ViewportGridService.EVENTS.GRID_STATE_CHANGED]: () => ({}),
        [ViewportGridService.EVENTS.VIEWPORTS_READY]: () => ({}),
      },
    },
  },

  {
    id: 'MeasurementTools',
    uiType: 'ohif.splitButton',
    props: {
      groupId: 'MeasurementTools',
      evaluate: 'evaluate.group.promoteToPrimaryIfCornerstoneToolNotActiveInTheList',
      primary: csTool('Length', 'tool-length', 'Length', 'Length Tool'),
      secondary: { icon: 'chevron-down', tooltip: 'More Measure Tools' },
      items: [
        csTool('Length', 'tool-length', 'Length', 'Length Tool'),
        csTool('Bidirectional', 'tool-bidirectional', 'Bidirectional', 'Bidirectional Tool'),
        csTool('ArrowAnnotate', 'tool-annotate', 'Annotation', 'Arrow Annotate'),
        csTool('EllipticalROI', 'tool-ellipse', 'Ellipse', 'Ellipse ROI'),
        csTool('RectangleROI', 'tool-rectangle', 'Rectangle', 'Rectangle ROI'),
        csTool('CircleROI', 'tool-circle', 'Circle', 'Circle Tool'),
        csTool('PlanarFreehandROI', 'icon-tool-freehand-roi', 'Freehand ROI', 'Freehand ROI'),
        csTool('SplineROI', 'icon-tool-spline-roi', 'Spline ROI', 'Spline ROI'),
        csTool('LivewireContour', 'icon-tool-livewire', 'Livewire tool', 'Livewire tool'),
      ],
    },
  },

  { id: 'Zoom', uiType: 'ohif.radioGroup', props: { icon: 'tool-zoom', label: 'Zoom', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' } },
  { id: 'WindowLevel', uiType: 'ohif.radioGroup', props: { icon: 'tool-window-level', label: 'Window Level', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' } },
  { id: 'Pan', uiType: 'ohif.radioGroup', props: { icon: 'tool-move', label: 'Pan', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' } },

  {
    id: 'TrackballRotate',
    uiType: 'ohif.radioGroup',
    props: {
      type: 'tool',
      icon: 'tool-3d-rotate',
      label: '3D Rotate',
      commands: setToolActiveToolbar,
      evaluate: { name: 'evaluate.cornerstoneTool', disabledText: 'Select a 3D viewport to enable this tool' },
    },
  },

  {
    id: 'Capture',
    uiType: 'ohif.radioGroup',
    props: { icon: 'tool-capture', label: 'Capture', commands: 'showDownloadViewportModal', evaluate: 'evaluate.action' },
  },

  { id: 'Layout', uiType: 'ohif.layoutSelector', props: { rows: 3, columns: 4, evaluate: 'evaluate.action', commands: 'setViewportGridLayout' } },

  {
    id: 'Crosshairs',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'tool-crosshair',
      label: 'Crosshairs',
      commands: { commandName: 'setToolActiveToolbarWithFreeDrawGuard', context: 'DEFAULT', commandOptions: { toolGroupIds: ['mpr'] } },
      evaluate: { name: 'evaluate.cornerstoneTool', disabledText: 'Select an MPR viewport to enable this tool' },
    },
  },

  {
    id: 'MoreTools',
    uiType: 'ohif.splitButton',
    props: {
      groupId: 'MoreTools',
      evaluate: 'evaluate.group.promoteToPrimaryIfCornerstoneToolNotActiveInTheList',
      primary: createButton({ id: 'Reset', icon: 'tool-reset', tooltip: 'Reset View', label: 'Reset', commands: 'resetViewport', evaluate: 'evaluate.action' }),
      secondary: { icon: 'chevron-down', label: '', tooltip: 'More Tools' },
      items: [
        createButton({ id: 'Reset', icon: 'tool-reset', label: 'Reset View', tooltip: 'Reset View', commands: 'resetViewport', evaluate: 'evaluate.action' }),
        createButton({ id: 'rotate-right', icon: 'tool-rotate-right', label: 'Rotate Right', tooltip: 'Rotate +90', commands: 'rotateViewportCW', evaluate: 'evaluate.action' }),
        createButton({ id: 'flipHorizontal', icon: 'tool-flip-horizontal', label: 'Flip Horizontal', tooltip: 'Flip Horizontally', commands: 'invertViewport', evaluate: 'evaluate.viewportProperties.toggle' }),
        createButton({
          id: 'ReferenceLines',
          icon: 'tool-referenceLines',
          label: 'Reference Lines',
          tooltip: 'Show Reference Lines',
          commands: 'toggleEnabledDisabledToolbar',
          listeners: {
            [ViewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED]: refLinesListeners,
            [ViewportGridService.EVENTS.VIEWPORTS_READY]: refLinesListeners,
          },
          evaluate: 'evaluate.cornerstoneTool.toggle',
        }),
        createButton({ id: 'ImageOverlayViewer', icon: 'toggle-dicom-overlay', label: 'Image Overlay', tooltip: 'Toggle Image Overlay', commands: 'toggleEnabledDisabledToolbar', evaluate: 'evaluate.cornerstoneTool.toggle' }),
        createButton({ id: 'StackScroll', icon: 'tool-stack-scroll', label: 'Stack Scroll', tooltip: 'Stack Scroll', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' }),
        createButton({ id: 'invert', icon: 'tool-invert', label: 'Invert', tooltip: 'Invert Colors', commands: 'invertViewport', evaluate: 'evaluate.viewportProperties.toggle' }),
        createButton({ id: 'Probe', icon: 'tool-probe', label: 'Probe', tooltip: 'Probe', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' }),
        createButton({ id: 'Cine', icon: 'tool-cine', label: 'Cine', tooltip: 'Cine', commands: 'toggleCine', evaluate: ['evaluate.cine', 'evaluate.not3D'] }),
        createButton({ id: 'Angle', icon: 'tool-angle', label: 'Angle', tooltip: 'Angle', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' }),
        createButton({ id: 'Magnify', icon: 'tool-magnify', label: 'Zoom-in', tooltip: 'Zoom-in', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' }),
        createButton({ id: 'RectangleROI', icon: 'tool-rectangle', label: 'Rectangle', tooltip: 'Rectangle', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' }),
        createButton({ id: 'CalibrationLine', icon: 'tool-calibration', label: 'Calibration', tooltip: 'Calibration Line', commands: setToolActiveToolbar, evaluate: 'evaluate.cornerstoneTool' }),
        createButton({ id: 'TagBrowser', icon: 'dicom-tag-browser', label: 'Dicom Tag Browser', tooltip: 'Dicom Tag Browser', commands: 'openDICOMTagViewer' }),
        createButton({ id: 'AdvancedMagnify', icon: 'icon-tool-loupe', label: 'Magnify Probe', tooltip: 'Magnify Probe', commands: 'toggleActiveDisabledToolbar', evaluate: 'evaluate.cornerstoneTool.toggle.ifStrictlyDisabled' }),
        createButton({ id: 'UltrasoundDirectionalTool', icon: 'icon-tool-ultrasound-bidirectional', label: 'Ultrasound Directional', tooltip: 'Ultrasound Directional', commands: setToolActiveToolbar, evaluate: ['evaluate.cornerstoneTool', 'evaluate.isUS'] }),
        createButton({ id: 'GPTAnalyzer', icon: 'list-bullets', label: 'ZMed Analyzer', tooltip: 'ZMed Analyzer', commands: 'openGPTAnalyzer' }),
      ],
    },
  },
];

export default toolbarButtons;
