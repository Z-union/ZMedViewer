import React, { useState } from 'react';
import { LegacyButton } from '@ohif/ui';
import { useTranslation } from 'react-i18next';
import AuthService from '../../../../platform/app/src/services/AuthService.js';

// Базовый URL как в AuthService
const API_URL =
  (window?.config?.dataSources?.[0]?.configuration?.domain || '') +
    (window?.config?.dataSources?.[0]?.configuration?.personalAccountUri ||
      '') || 'https://dev-zview.z-union.ru/personal';

// POST helper
async function postJSON(path, body) {
  const headers = {
    'Content-Type': 'application/json',
    ...AuthService.getAuthorizationHeader(),
  };
  const resp = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await resp.json();
  } catch {
    /* ignore */
  }
  return { ok: resp.ok, status: resp.status, payload };
}

// Небольшой UI-хелпер для поля формы
const Field = ({ label, hint, children }) => (
  <div className="space-y-2">
    <div className="text-xs uppercase tracking-wide text-gray-300">{label}</div>
    {children}
    {hint ? <div className="text-xs text-gray-400">{hint}</div> : null}
  </div>
);

const Badge = ({ children }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-700 text-gray-200 text-xs">
    {children}
  </span>
);

const AdminModal = () => {
  const { t } = useTranslation('Common');

  // ---- Assign permissions ----
  const [permUserId, setPermUserId] = useState('');
  const [permissions, setPermissions] = useState('');
  const [permLoading, setPermLoading] = useState(false);
  const [permError, setPermError] = useState('');
  const [permSuccess, setPermSuccess] = useState('');

  // ---- Update password ----
  const [passUserId, setPassUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  // Блокируем всплытие keydown, чтобы глобальные хоткеи не «съедали» ввод
  const stopHotkeys = (e) => e.stopPropagation();

  const handleAssignPermissions = async (e) => {
    e.preventDefault();
    setPermError('');
    setPermSuccess('');
    setPermLoading(true);

    try {
      const user_id = Number(permUserId);
      const perms = Number(permissions);
      if (!Number.isFinite(user_id) || !Number.isFinite(perms)) {
        setPermError(t('ErrorInvalidUserAndPerm'));
        return;
      }
      const { ok, status, payload } = await postJSON(
        '/auth/assign-permissions',
        {
          user_id,
          permissions: perms,
        }
      );
      if (ok) {
        setPermSuccess(payload?.message || t('SuccessPermissionsUpdated'));
      } else if (status === 403) {
        setPermError(t('Error403Admin'));
      } else if (status === 404) {
        setPermError(t('Error404UserNotFound'));
      } else {
        setPermError(`${status}: ${payload?.message || 'Error'}`);
      }
    } catch (err) {
      setPermError(String(err?.message || err));
    } finally {
      setPermLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');
    setPassLoading(true);

    try {
      const user_id = Number(passUserId);
      if (!Number.isFinite(user_id) || !newPassword) {
        setPassError(t('ErrorInvalidUserAndPassword'));
        return;
      }
      const { ok, status, payload } = await postJSON('/auth/update-password', {
        user_id,
        new_password: newPassword,
      });
      if (ok) {
        setPassSuccess(payload?.message || t('SuccessPasswordUpdated'));
      } else if (status === 403) {
        setPassError(t('Error403Admin'));
      } else if (status === 404) {
        setPassError(t('Error404UserNotFound'));
      } else {
        setPassError(`${status}: ${payload?.message || 'Error'}`);
      }
    } catch (err) {
      setPassError(String(err?.message || err));
    } finally {
      setPassLoading(false);
    }
  };

  // Общие className для инпутов под тёмную тему OHIF
  const inputCls =
    'w-full bg-black text-white placeholder-gray-400 border border-gray-700 rounded-md px-3 py-2 ' +
    'outline-none focus:border-white transition-colors';

  return (
    <div
      className="p-4 text-white space-y-6"
      onKeyDown={stopHotkeys}
      onKeyUp={stopHotkeys}
      onKeyPress={stopHotkeys}
    >
      {/* Assign permissions */}
      <section className="rounded-lg border border-gray-700 bg-gray-800/80 backdrop-blur p-4 shadow-lg space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('GrantPermissions')}</h3>
          <div className="space-x-2">
            <Badge>USER = 1</Badge>
            <Badge>DOCTOR = 2</Badge>
            <Badge>ADMIN = 4</Badge>
          </div>
        </header>

        <form onSubmit={handleAssignPermissions} className="space-y-4">
          <Field label={t('UserID')}>
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              min="0"
              className={inputCls}
              placeholder={t('PlaceholderUserId')}
              value={permUserId}
              onChange={(e) => setPermUserId(e.target.value)}
            />
          </Field>

          <Field label={t('PermissionsBitmask')} hint={t('PermissionsHint')}>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className={inputCls}
              placeholder={t('PlaceholderPermissions')}
              value={permissions}
              onChange={(e) => setPermissions(e.target.value)}
            />
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <LegacyButton
              type="submit"
              variant="contained"
              disabled={permLoading}
            >
              {permLoading ? t('Sending') : t('AssignPermissions')}
            </LegacyButton>

            {permSuccess && (
              <span className="text-green-400 text-sm">{t(permSuccess)}</span>
            )}
            {permError && (
              <span className="text-red-400 text-sm">{t(permError)}</span>
            )}
          </div>
        </form>
      </section>

      {/* Update password */}
      <section className="rounded-lg border border-gray-700 bg-gray-800/80 backdrop-blur p-4 shadow-lg space-y-4">
        <h3 className="text-lg font-semibold">{t('PasswordChange')}</h3>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <Field label={t('UserID')}>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className={inputCls}
              placeholder={t('PlaceholderUserId')}
              value={passUserId}
              onChange={(e) => setPassUserId(e.target.value)}
            />
          </Field>

          <Field label={t('NewPassword')}>
            <input
              type="password"
              className={inputCls}
              placeholder={t('PlaceholderNewPassword')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <LegacyButton
              type="submit"
              variant="contained"
              disabled={passLoading}
            >
              {passLoading ? t('Sending') : t('UpdatePassword')}
            </LegacyButton>

            {passSuccess && (
              <span className="text-green-400 text-sm">{t(passSuccess)}</span>
            )}
            {passError && (
              <span className="text-red-400 text-sm">{t(passError)}</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
};

export default AdminModal;
