import React from 'react';
import { UserAuthenticationProvider } from '@ohif/ui';
import { oidc } from './oidc/oidc-settings';
import { initUserManager } from './oidc/initUserManager';

const DataSourceWrapper = ({
  children: LayoutTemplate,
  servicesManager,
  extensionManager,
  oidc,
}) => {
  const routerBasename = extensionManager._appConfig.routerBasename;
  const userAuthenticationService =
    servicesManager.services.userAuthenticationService;
  const userManager = initUserManager(oidc);
  const clientSecret = oidc[0].client_secret;
  const clientId = oidc[0].client_id;

  return (
    <UserAuthenticationProvider service={userAuthenticationService}>
      <LayoutTemplate
        routerBasename={routerBasename}
        userAuthenticationService={userAuthenticationService}
        userManager={userManager}
        clientSecret={clientSecret}
        clientId={clientId}
      />
    </UserAuthenticationProvider>
  );
};

export default DataSourceWrapper;
