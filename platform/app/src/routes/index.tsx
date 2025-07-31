import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary, Icon } from '@ohif/ui';
import { useTranslation } from 'react-i18next';

// Route Components
import DataSourceWrapper from './DataSourceWrapper';
import WorkList from './WorkList';
import Local from './Local';
import Debug from './Debug';
import NotFound from './NotFound';
import buildModeRoutes from './buildModeRoutes';
import PrivateRoute from './PrivateRoute';
import PropTypes from 'prop-types';

const NotFoundServer = ({
  message = 'Unable to query for studies at this time. Check your data source configuration or network connection',
}: {
  message?: string;
}) => {
  const { t } = useTranslation('Messages');
  return (
    <div className="absolute flex h-full w-full items-center justify-center">
      <div
        className="grid h-full w-full grid-cols-2"
        style={{ 'grid-template-columns': '1fr 6fr' }}
      >
        <a
          href={'/'}
          className="bg-primary-dark hover:bg-primary-light flex h-full items-center rounded py-4 hover:opacity-30"
        >
          <Icon
            name="arrow-right"
            className="scale-x-[-1] transform"
          ></Icon>
        </a>
        <div className="flex w-full items-center justify-center px-4 text-white">
          <h4>{t(message)}</h4>
        </div>
      </div>
    </div>
  );
};

NotFoundServer.propTypes = {
  message: PropTypes.string,
};

const NotFoundStudy = ({
  message = 'One or more of the requested studies are not available at this time.Return to the study list to select a different study to view.',
}: {
  message?: string;
}) => {
  const { t } = useTranslation('Messages');
  return (
    <div className="absolute flex h-full w-full items-center justify-center">
      <div
        className="grid h-full w-full grid-cols-2"
        style={{ 'grid-template-columns': '1fr 6fr' }}
      >
        <a
          href={'/'}
          className="bg-primary-dark hover:bg-primary-light flex h-full items-center rounded py-4 hover:opacity-30"
        >
          <Icon
            name="arrow-right"
            className="scale-x-[-1] transform"
          ></Icon>
        </a>
        <div className="flex w-full items-center justify-center px-4 text-white">
          <h4>{t(message)}</h4>
        </div>
      </div>
    </div>
  );
};

NotFoundStudy.propTypes = {
  message: PropTypes.string,
};

// TODO: Include "routes" debug route if dev build
const bakedInRoutes = [
  {
    path: `/notfoundserver`,
    children: NotFoundServer,
  },
  {
    path: `/notfoundstudy`,
    children: NotFoundStudy,
  },
  {
    path: `/debug`,
    children: Debug,
  },
  {
    path: `/local`,
    children: Local.bind(null, { modePath: '' }), // navigate to the worklist
  },
  {
    path: `/localbasic`,
    children: Local.bind(null, { modePath: 'viewer/dicomlocal' }),
  },
];

// NOT FOUND (404)
const notFoundRoute = { component: NotFound };

const createRoutes = ({
  modes,
  dataSources,
  extensionManager,
  servicesManager,
  commandsManager,
  hotkeysManager,
  showStudyList,
}: withAppTypes) => {
  const routes =
    buildModeRoutes({
      modes,
      dataSources,
      extensionManager,
      servicesManager,
      commandsManager,
      hotkeysManager,
    }) || [];

  const { customizationService } = servicesManager.services;

  const path =
    routerBasename.length > 1 && routerBasename.endsWith('/')
      ? routerBasename.substring(0, routerBasename.length - 1)
      : routerBasename;

  console.log('Registering worklist route', routerBasename, path);

  const WorkListRoute = {
    path: '/',
    children: DataSourceWrapper,
    private: true,
    props: { children: WorkList, servicesManager, extensionManager },
  };

  const customRoutes = customizationService.getCustomization('routes.customRoutes');

  const allRoutes = [
    ...routes,
    ...(showStudyList ? [WorkListRoute] : []),
    ...(customRoutes?.routes || []),
    ...bakedInRoutes,
    customRoutes?.notFoundRoute || notFoundRoute,
  ];

  function RouteWithErrorBoundary({ route, ...rest }) {
    history.navigate = useNavigate();

    // eslint-disable-next-line react/jsx-props-no-spreading
    return (
      <ErrorBoundary context={`Route ${route.path}`}>
        <route.children
          {...rest}
          {...route.props}
          route={route}
          servicesManager={servicesManager}
          extensionManager={extensionManager}
          hotkeysManager={hotkeysManager}
        />
      </ErrorBoundary>
    );
  }

  const { userAuthenticationService } = servicesManager.services;

  // All routes are private by default and then we let the user auth service
  // to check if it is enabled or not
  // Todo: I think we can remove the second public return below
  return (
    <Routes>
      {allRoutes.map((route, i) => {
        return route.private === true ? (
          <Route
            key={i}
            path={route.path}
            element={
              <PrivateRoute
                handleUnauthenticated={() => userAuthenticationService.handleUnauthenticated()}
              >
                <RouteWithErrorBoundary route={route} />
              </PrivateRoute>
            }
          ></Route>
        ) : (
          <Route
            key={i}
            path={route.path}
            element={<RouteWithErrorBoundary route={route} />}
          />
        );
      })}
    </Routes>
  );
};

export default createRoutes;
