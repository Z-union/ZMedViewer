const API_URL =
  (window?.config?.dataSources?.[0]?.configuration?.domain || '') +
    (window?.config?.dataSources?.[0]?.configuration?.personalAccountUri || '') ||
  'https://atlas.z-union.ru/personal';
const AUTH_PREFIX = `${API_URL}/auth`;

let userAuthServiceInstance = null;

export const setUserAuthService = instance => {
  userAuthServiceInstance = instance;
};

export const getUserAuthService = () => userAuthServiceInstance;

let ROUTER_BASENAME = '/';
export const setRouterBasename = base => {
  ROUTER_BASENAME = base || '/';
};

// ключи в localStorage
const LS_KEYS = {
  access: 'access_token',
  refresh: 'refresh_token',
  expAt: 'access_expires_at', // timestamp ms
};
const LS_FLAGS = {
  isAdmin: 'is_admin',
};

// сколько секунд «запаса» учитывать до истечения access
const EXP_SAFETY_SECONDS = 60;

let refreshTimerId = null;
let refreshingPromise = null;

let rawFetch = window.fetch.bind(window);

// ====== Внутренние утилиты ======
function nowMs() {
  return Date.now();
}

function getExpiresAt() {
  const v = localStorage.getItem(LS_KEYS.expAt);
  return v ? parseInt(v, 10) : 0;
}

function setIsAdminFlag(val) {
  if (val === true) {
    localStorage.setItem(LS_FLAGS.isAdmin, '1');
  } else {
    localStorage.setItem(LS_FLAGS.isAdmin, '0');
  }
}

function clearIsAdminFlag() {
  localStorage.removeItem(LS_FLAGS.isAdmin);
}

function setTokensAndSchedule({ access_token, refresh_token, expires_in }) {
  if (access_token) {
    localStorage.setItem(LS_KEYS.access, access_token);
  }
  if (refresh_token) {
    localStorage.setItem(LS_KEYS.refresh, refresh_token);
  }

  const ttlSec = typeof expires_in === 'number' ? expires_in : 1800;
  const expAt = nowMs() + ttlSec * 1000;
  localStorage.setItem(LS_KEYS.expAt, String(expAt));

  scheduleRefresh(expAt);
}

function clearTokensAndTimer() {
  localStorage.removeItem(LS_KEYS.access);
  localStorage.removeItem(LS_KEYS.refresh);
  localStorage.removeItem(LS_KEYS.expAt);
  clearIsAdminFlag();

  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
}

function forceRelogin() {
  clearTokensAndTimer();
  const to = ROUTER_BASENAME.endsWith('/') ? `${ROUTER_BASENAME}login` : `${ROUTER_BASENAME}/login`;
  try {
    window.location.replace(to);
  } catch {
    window.location.href = to;
  }
}

function scheduleRefresh(expAtMs) {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
  const msUntil = Math.max(expAtMs - EXP_SAFETY_SECONDS * 1000 - nowMs(), 0);

  refreshTimerId = setTimeout(() => {
    AuthService.refresh().catch(() => {
      forceRelogin();
    });
  }, msUntil);
}

function isAccessValidSoon() {
  const expAt = getExpiresAt();
  return expAt - EXP_SAFETY_SECONDS * 1000 > nowMs();
}

function addBearer(headers = {}) {
  const access = localStorage.getItem(LS_KEYS.access);
  if (!access) {
    return headers;
  }
  return { ...headers, Authorization: headers.Authorization || `Bearer ${access}` };
}

const isAuthEndpoint = url => {
  return (
    typeof url === 'string' &&
    (url.startsWith(`${AUTH_PREFIX}/login`) ||
      url.startsWith(`${AUTH_PREFIX}/refresh`) ||
      url.startsWith(`${AUTH_PREFIX}/logout`))
  );
};

// ====== Сам сервис ======
class AuthServiceClass {
  async login(username, password) {
    const resp = await rawFetch(`${AUTH_PREFIX}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    if (!resp.ok) {
      let details = '';
      try {
        details = await resp.text();
      } catch {}
      throw new Error(`Invalid credentials (${resp.status}). ${details}`.trim());
    }

    const data = await resp.json();
    setTokensAndSchedule({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });

    this.checkAdminAndCache().catch(() => {});

    const redirectTo = sessionStorage.getItem('postLoginRedirect') || '/';
    sessionStorage.removeItem('postLoginRedirect');
    window.location.replace(redirectTo);
  }

  /**
   * Обновляет токены (ротирует refresh) строго по API:
   * POST /auth/refresh
   * { "refresh_token": "<refresh>" }
   */
  async refresh() {
    if (refreshingPromise) {
      return refreshingPromise;
    }

    const refresh_token = localStorage.getItem(LS_KEYS.refresh);
    if (!refresh_token) {
      forceRelogin();
      throw new Error('No refresh token');
    }

    refreshingPromise = (async () => {
      try {
        const resp = await rawFetch(`${AUTH_PREFIX}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token }),
        });

        if (!resp.ok) {
          const text = await safeText(resp);
          forceRelogin();
          throw new Error(`Refresh failed (${resp.status}). ${text}`);
        }

        const data = await resp.json();
        setTokensAndSchedule({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
        });

        return data;
      } catch (err) {
        forceRelogin();
        throw err;
      } finally {
        refreshingPromise = null;
      }
    })();

    return refreshingPromise;
  }

  async logout() {
    const refresh_token = localStorage.getItem(LS_KEYS.refresh);
    const access_token = localStorage.getItem(LS_KEYS.access);

    try {
      await rawFetch(`${AUTH_PREFIX}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ refresh_token }),
      });
    } catch (e) {
      // ignore
    } finally {
      clearTokensAndTimer();

      const to = ROUTER_BASENAME.endsWith('/')
        ? `${ROUTER_BASENAME}login`
        : `${ROUTER_BASENAME}/login`;
      window.location.replace(to);
    }
  }

  async initializeAutoRefresh({ immediate = true } = {}) {
    if (refreshTimerId) {
      clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }

    const hasRefresh = !!localStorage.getItem(LS_KEYS.refresh);
    const hasAccess = !!localStorage.getItem(LS_KEYS.access);

    if (immediate && hasRefresh) {
      try {
        await this.refresh(); // поставит новый таймер через setTokensAndSchedule
        // после успешного refresh при желании можно освежить флаг ADMIN
        // await this.checkAdminAndCache().catch(() => {});
        return;
      } catch {
        forceRelogin();
        return;
      }
    }

    const expAt = getExpiresAt();
    if (hasAccess && expAt) {
      scheduleRefresh(expAt);
    }
  }

  getAccessToken() {
    return localStorage.getItem(LS_KEYS.access);
  }

  isAuthenticated() {
    const token = this.getAccessToken();
    if (!token) {
      return false;
    }
    return true;
  }

  /**
   * Вернёт готовый Authorization-хедер: { Authorization: 'Bearer <access>' }.
   * Удобно для axios и DICOMwebClient.headers.
   */
  getAuthorizationHeader() {
    const access = localStorage.getItem(LS_KEYS.access);
    return access ? { Authorization: `Bearer ${access}` } : {};
  }

  /**
   * Добавить Bearer в уже существующие headers-объекты.
   */
  withAuthHeader(headers = {}) {
    return addBearer(headers);
  }

  /**
   * ====== PROTECTED (ADMIN only) ======
   * POST {API_URL}/protected
   * 200: { message: "Hi, admin" }
   * 403: нет прав ADMIN
   * 404: текущий пользователь не найден
   */
  async protectedPing() {
    const url = `${AUTH_PREFIX}/protected`;
    const headers = addBearer({ 'Content-Type': 'application/json' });
    const resp = await rawFetch(url, { method: 'POST', headers });

    if (resp.ok) {
      try {
        return await resp.json();
      } catch {
        return { message: 'OK' };
      }
    }

    const text = await safeText(resp);
    if (resp.status === 403) throw new Error('403: нет прав ADMIN');
    if (resp.status === 404) throw new Error('404: текущий пользователь не найден');
    throw new Error(`Protected failed (${resp.status}). ${text}`);
  }

  /**
   * Проверить доступ к /protected и закэшировать признак ADMIN.
   * Возвращает true/false.
   */
  async checkAdminAndCache() {
    try {
      await this.protectedPing();
      setIsAdminFlag(true);
      return true;
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.startsWith('403') || msg.startsWith('404')) {
        setIsAdminFlag(false);
        return false;
      }
      throw e;
    }
  }

  /**
   * Синхронно возвращает кэшированный признак ADMIN.
   */
  isAdmin() {
    return localStorage.getItem(LS_FLAGS.isAdmin) === '1';
  }

  /**
   * Устанавливает перехватчик глобального fetch:
   * - НЕ трогает /auth/login|refresh|logout (байпас)
   * - Подставляет Bearer к запросам на API_URL
   * - Перед запросом обновляет access, если он вот-вот истечёт
   * - На 401 один раз пробует refresh и «повтор» оригинального запроса
   * - Если /auth/refresh вернул 401 — принудительный релогин
   */
  installAuthFetchInterceptor() {
    if (this._interceptorInstalled) {
      return;
    }
    this._interceptorInstalled = true;

    const originalFetch = window.fetch.bind(window);
    rawFetch = originalFetch;

    window.fetch = async (input, init = {}) => {
      const req = normalizeRequest(input, init);
      const url = req.url;
      const preparedInit = { ...req.init };

      const onAtlasApi = typeof url === 'string' && url.startsWith(API_URL);
      const onAuth = isAuthEndpoint(url);

      if (onAuth) {
        const resp = await originalFetch(url, preparedInit);
        if (url.startsWith(`${AUTH_PREFIX}/refresh`) && resp.status === 401) {
          forceRelogin();
        }
        return resp;
      }

      if (onAtlasApi) {
        try {
          if (!isAccessValidSoon()) {
            await this.refresh();
          }
        } catch {
          // игнор, ниже 401 ещё обработаем
        }
        preparedInit.headers = addBearer(preparedInit.headers);
      }

      let response = await originalFetch(url, preparedInit);

      if (onAtlasApi && response.status === 401) {
        try {
          await this.refresh();
          const retryInit = { ...preparedInit, headers: addBearer(preparedInit.headers) };
          response = await originalFetch(url, retryInit);
        } catch {
        }
      }

      return response;
    };

    const expAt = getExpiresAt();
    if (expAt) {
      scheduleRefresh(expAt);
    }
  }
}

// ====== Вспомогательные ======
function normalizeRequest(input, init) {
  if (typeof input === 'string') {
    return { url: input, init: init || {} };
  }
  return { url: input.url, init: init || {} };
}

async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

const AuthService = new AuthServiceClass();
export default AuthService;
