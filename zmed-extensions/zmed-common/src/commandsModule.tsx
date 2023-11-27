import { ServicesManager, utils, Types } from '@ohif/core';

// import {
  // ContextMenuController,
  // defaultContextMenu,
// } from './CustomizableContextMenu';
import GPTAnalyzer from './GPTAnalyzer/GPTAnalyzer';
// import reuseCachedLayouts from './utils/reuseCachedLayouts';
// import findViewportsByPosition, {
  // findOrCreateViewport as layoutFindOrCreate,
// } from './findViewportsByPosition';

// import { ContextMenuProps } from './CustomizableContextMenu/types';
// import { NavigateHistory } from './types/commandModuleTypes';
// import { history } from '@ohif/app';

// const { subscribeToNextViewportGridChange } = utils;

// export type HangingProtocolParams = {
//   protocolId?: string;
//   stageIndex?: number;
//   activeStudyUID?: string;
//   stageId?: string;
// };

// export type UpdateViewportDisplaySetParams = {
//   direction: number;
//   excludeNonImageModalities?: boolean;
// };

/**
 * Determine if a command is a hanging protocol one.
 * For now, just use the two hanging protocol commands that are in this
 * commands module, but if others get added elsewhere this may need enhancing.
 */
const isHangingProtocolCommand = command =>
  command &&
  (command.commandName === 'setHangingProtocol' ||
    command.commandName === 'toggleHangingProtocol');

const commandsModule = ({
  servicesManager,
  commandsManager,
}: Types.Extensions.ExtensionParams): Types.Extensions.CommandsModule => {
  const {
    customizationService,
    measurementService,
    hangingProtocolService,
    uiNotificationService,
    viewportGridService,
    displaySetService,
    stateSyncService,
    toolbarService,
    cornerstoneViewportService,
  } = (servicesManager as ServicesManager).services;

  const { UIModalService } = servicesManager.services;

  const actions = {
        openGPTAnalyzer() {
        const { activeViewportIndex } = viewportGridService.getState();
        console.log(activeViewportIndex);

      if (
        !cornerstoneViewportService.getCornerstoneViewportByIndex(
          activeViewportIndex
        )
      ) {
        // Cannot download a non-cornerstone viewport (image).
        uiNotificationService.show({
          title: 'ZMed Analyzer',
          message: 'Image cannot be downloaded',
          type: 'error',
        });
        return;
      }
  //     const { activeViewportIndex, viewports } = viewportGridService.getState();
  //     const activeViewportSpecificData = viewports[activeViewportIndex];
  //     const { displaySetInstanceUIDs } = activeViewportSpecificData;

      const displaySets = displaySetService.activeDisplaySets;
      console.log("@@@@@@@@");
      console.log(displaySets);
      console.log(activeViewportIndex);
      let viewPort = cornerstoneViewportService.getCornerstoneViewportByIndex(
        activeViewportIndex
      )

  //     const { UIModalService } = servicesManager.services;

      // const displaySetInstanceUID = displaySetInstanceUIDs[0];
      UIModalService.show({
        content: GPTAnalyzer,
        contentProps: {
          activeViewportIndex,
          onClose: UIModalService.hide,
          cornerstoneViewportService,
          viewPort,
        },
        title: 'ZMed Analyzer',
      });
    },
  };
  const definitions = {
    openGPTAnalyzer: {
      commandFn: actions.openGPTAnalyzer,
    },
  };

  return {
    actions,
    definitions,
    defaultContext: 'DEFAULT',
  };
};

export default commandsModule;
