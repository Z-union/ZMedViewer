// External

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import i18n from '@ohif/i18n';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Compose from './routes/Mode/Compose';
import {
  ExtensionManager,
  CommandsManager,
  HotkeysManager,
  ServiceProvidersManager,
} from '@ohif/core';
import {
  DialogProvider,
  Modal,
  ModalProvider,
  SnackbarProvider,
  ThemeWrapper,
  ViewportDialogProvider,
  ViewportGridProvider,
  CineProvider,
  UserAuthenticationProvider,
  ToolboxProvider,
} from '@ohif/ui';
import { ThemeWrapper as ThemeWrapperNext, NotificationProvider } from '@ohif/ui-next';
// Viewer Project
// TODO: Should this influence study list?
import { AppConfigProvider } from '@state';
import createRoutes from './routes';
import appInit from './appInit.js';
import authService, { setRouterBasename, setUserAuthService } from './services/AuthService';
import LoginPage from './routes/LoginPage';

let commandsManager: CommandsManager,
  extensionManager: ExtensionManager,
  servicesManager: AppTypes.ServicesManager,
  serviceProvidersManager: ServiceProvidersManager,
  hotkeysManager: HotkeysManager;

/** Гард приватных маршрутов */
function Protected({ children }: { children: React.ReactNode }) {
  const isAuth = authService.isAuthenticated();
  const location = useLocation();
  if (!isAuth) {
    sessionStorage.setItem('postLoginRedirect', location.pathname + location.search);
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }
  return <>{children}</>;
}

function App({
  config = {
    routerBaseName: '/',
    showLoadingIndicator: true,
    showStudyList: true,
    oidc: [],
    extensions: [],
  },
  defaultExtensions = [],
  defaultModes = [],
}) {
  const [init, setInit] = useState<any>(null);
  const [isAuth, setIsAuth] = useState(authService.isAuthenticated());
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    appInit(config, defaultExtensions, defaultModes)
      .then(setInit)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const onStorage = e => {
      if ((e.key === 'access_token' || e.key === 'refresh_token') && !e.newValue) {
        setIsAuth(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!init) {
      return;
    }

    let cancelled = false;

    const bootstrapAuth = async () => {
      const base = init.appConfig?.routerBasename || '/';
      setRouterBasename(base);
      authService.installAuthFetchInterceptor();

      try {
        await authService.initializeAutoRefresh({ immediate: true });
        if (!cancelled) {
          setIsAuth(authService.isAuthenticated());
        }
      } catch {
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [init]);

  useEffect(() => {
    if (init) {
      const { servicesManager } = init;
      setUserAuthService(servicesManager.services.userAuthenticationService);
    }
  }, [init]);

  // Пока не инициализировались appInit И начальный auto-refresh — ничего не рендерим,
  // чтобы первый запрос за исследованиями не ушёл со старым access_token
  if (!init || !authReady) {
    return null;
  }

  // Set above for named export
  commandsManager = init.commandsManager;
  extensionManager = init.extensionManager;
  servicesManager = init.servicesManager;
  serviceProvidersManager = init.serviceProvidersManager;
  hotkeysManager = init.hotkeysManager;

  // Set appConfig
  const appConfigState = init.appConfig;
  const { routerBasename, modes, dataSources, showStudyList } = appConfigState;

  // get the maximum 3D texture size
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;

  const max3DTextureSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
  appConfigState.max3DTextureSize = max3DTextureSize;

  const {
    uiDialogService,
    uiModalService,
    uiNotificationService,
    uiViewportDialogService,
    viewportGridService,
    cineService,
    userAuthenticationService,
    customizationService,
  } = servicesManager.services;

  const providers: any[] = [
    [AppConfigProvider, { value: appConfigState }],
    [UserAuthenticationProvider, { service: userAuthenticationService }],
    [I18nextProvider, { i18n }],
    [ThemeWrapperNext],
    [ThemeWrapper],
    [ToolboxProvider],
    [ViewportGridProvider, { service: viewportGridService }],
    [ViewportDialogProvider, { service: uiViewportDialogService }],
    [CineProvider, { service: cineService }],
    // [NotificationProvider, { service: uiNotificationService }],
    [SnackbarProvider, { service: uiNotificationService }],
    [DialogProvider, { service: uiDialogService }],
    [ModalProvider, { service: uiModalService, modal: Modal }],
  ];

  // Loop through and register each of the service providers registered with the ServiceProvidersManager.
  const providersFromManager = Object.entries(serviceProvidersManager.providers);
  if (providersFromManager.length > 0) {
    providersFromManager.forEach(([serviceName, provider]) => {
      providers.push([provider, { service: servicesManager.services[serviceName] }]);
    });
  }

  const CombinedProviders = ({ children }) => Compose({ components: providers, children });

  customizationService.init(extensionManager);

  // Use config to create routes
  const appRoutes = createRoutes({
    modes,
    dataSources,
    extensionManager,
    servicesManager,
    commandsManager,
    hotkeysManager,
    routerBasename,
    showStudyList,
  });

  const handleLogin = () => setIsAuth(true);

  return (
    <CombinedProviders>
      <BrowserRouter basename={routerBasename}>
        <Routes>
          {/* Публичный маршрут логина */}
          <Route
            path="/login"
            element={<LoginPage onLogin={handleLogin} />}
          />

          {/* Все приватные маршруты — внутри Protected */}
          <Route
            path="*"
            element={<Protected>{appRoutes}</Protected>}
          />
        </Routes>
      </BrowserRouter>
    </CombinedProviders>
  );
}

App.propTypes = {
  config: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({
      routerBasename: PropTypes.string.isRequired,
      oidc: PropTypes.array,
      whiteLabeling: PropTypes.object,
      extensions: PropTypes.array,
    }),
  ]).isRequired,
  /* Extensions that are "bundled" or "baked-in" to the application.
   * These would be provided at build time as part of they entry point. */
  defaultExtensions: PropTypes.array,
  /* Modes that are "bundled" or "baked-in" to the application.
   * These would be provided at build time as part of they entry point. */
  defaultModes: PropTypes.array,
};

export default App;

export { commandsManager, extensionManager, servicesManager };
