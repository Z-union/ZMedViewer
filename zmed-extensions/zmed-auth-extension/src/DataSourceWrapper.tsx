import React from 'react';
import { UserAuthenticationProvider } from '@ohif/ui';
import { initUserManager } from './oidc/initUserManager';

const DataSourceWrapper = ({
  children: LayoutTemplate,
  servicesManager,
  extensionManager,
}) => {
  const oidc = extensionManager._appConfig.oidc;
  console.log(oidc);
  const clientSecret = oidc[0].client_secret;
  const clientId = oidc[0].client_id;
  const getTokensUrl = oidc[0].get_tokens;

  const routerBasename = extensionManager._appConfig.routerBasename;
  const userAuthenticationService =
    servicesManager.services.userAuthenticationService;
  const userManager = initUserManager(oidc);

  return (
    <UserAuthenticationProvider service={userAuthenticationService}>
      <LayoutTemplate
        routerBasename={routerBasename}
        userAuthenticationService={userAuthenticationService}
        userManager={userManager}
        clientSecret={clientSecret}
        clientId={clientId}
        getTokensUrl={getTokensUrl}
      />
    </UserAuthenticationProvider>
  );
};

export default DataSourceWrapper;
