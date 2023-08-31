import { CustomizationService } from '@ohif/core';
import React from 'react';
import DataSourceWrapper from './DataSourceWrapper';
import WorkSheet from './WorkSheet/WorkSheet';
// import DataSourceSelector from './Panels/DataSourceSelector';
// import DataSourceConfigurationComponent from './Components/DataSourceConfigurationComponent';
// import { GoogleCloudDataSourceConfigurationAPI } from './DataSourceConfigurationAPI/GoogleCloudDataSourceConfigurationAPI';

/**
 *
 * Note: this is an example of how the customization module can be used
 * using the customization module. Below, we are adding a new custom route
 * to the application at the path /custom and rendering a custom component
 * Real world use cases of the having a custom route would be to add a
 * custom page for the user to view their profile, or to add a custom
 * page for login etc.
 */

// const { customizationService } = servicesManager.services;

// const WorkListRoute = {
//   path: '/',
//   children: DataSourceWrapper,
//   private: true,
//   props: { children: WorkList, servicesManager, extensionManager },
// };

export default function getCustomizationModule({
  servicesManager,
  extensionManager,
}) {
  return [
    {
      name: 'worksheet',
      value: {
        id: 'customRoutes',
        routes: [
          {
            path: '/',
            children: DataSourceWrapper,
            private: true,
            props: { children: WorkSheet, servicesManager, extensionManager },
          },
        ],
      },
    },
  ];
}
