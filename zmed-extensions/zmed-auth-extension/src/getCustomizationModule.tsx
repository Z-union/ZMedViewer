import DataSourceWrapper from './DataSourceWrapper';
import LoginPage from './LoginPage/LoginPage';
import authWrapper from './authWrapper';
import { oidc } from './oidc/oidc-settings';

export default function getCustomizationModule({
  servicesManager,
  extensionManager
}) {
  return [
    {
      name: 'loginPage',
      value: {
        id: 'authRoutes',
        routes: [
          {
            path: '/login',
            children: DataSourceWrapper,
            private: true,
            props: { children: LoginPage, servicesManager, extensionManager, oidc},
          },
        ],
      },
    },
    {
      name: 'authWrapper', // for default.js
      value: {
        id: 'authWrapper', // for customizationService.get('')
        component: authWrapper,
      },
    },
  ];
}
