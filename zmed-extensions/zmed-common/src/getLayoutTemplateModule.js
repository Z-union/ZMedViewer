import ViewerLayout from "./ViewerLayout";

export default function({
    servicesManager,
    extensionManager,
    commandsManager,
    hotkeysManager,
  }) {
    function ViewerLayoutWithServices(props) {
      return ViewerLayout({
        servicesManager,
        extensionManager,
        commandsManager,
        hotkeysManager,
        ...props,
      });
    }

    return [
      // Layout Template Definition
      // TODO: this is weird naming
      {
        name: 'viewerLayout',
        id: 'viewerLayout',
        component: ViewerLayoutWithServices,
      },
    ];
  }