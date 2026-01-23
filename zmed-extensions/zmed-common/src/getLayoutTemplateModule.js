import React from 'react';
import ViewerLayout from './ViewerLayout';
import FreeDrawTool from './tools/FreeDrawTool';

export default function getLayoutTemplateModule({
  servicesManager,
  extensionManager,
  commandsManager,
  hotkeysManager,
}: any) {
  function ViewerLayoutWithServices(props: any) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(FreeDrawTool, { servicesManager }),
      React.createElement(ViewerLayout, {
        servicesManager,
        extensionManager,
        commandsManager,
        hotkeysManager,
        ...props,
      })
    );
  }

  return [{ name: 'viewerLayout', id: 'viewerLayout', component: ViewerLayoutWithServices }];
}
