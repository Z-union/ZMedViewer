import React, { useState } from 'react';
import AuthService from '../../services/AuthService';
import logo from './login-logo.svg';
import atlasBg from './atlas-bg.svg';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      await AuthService.login(username, password);
      onLogin();
    } catch (e) {
      setError('Неверный логин или пароль');
    }
  };

  return (
    <div className="relative isolate min-h-screen w-screen overflow-hidden bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${atlasBg})`, opacity: 0.6 }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-[90vw] items-stretch gap-8">
        <div className="flex-1">
          <div className="mx-auto flex min-h-screen flex-col justify-center">
            <div className="mx-auto">
              <div
                className="mb-[50px] h-[78px] w-[265px] bg-contain bg-no-repeat"
                style={{ backgroundImage: `url(${logo})` }}
                aria-label="Логотип"
              />
              <div className="mb-[60px] text-[30px] font-[400]">Вход в личный кабинет</div>

              <form
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                {error && (
                  <div className="rounded border border-red-400 bg-red-500/10 px-3 py-2 text-red-300 shadow">
                    {error}
                  </div>
                )}

                <div className="relative w-[300px]">
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="peer h-12 w-full border-0 border-b border-white/40 bg-transparent px-3 pt-5 pb-2 text-white placeholder-transparent outline-none ring-0 transition focus:border-white"
                    placeholder=" "
                  />
                  <label
                    htmlFor="username"
                    className="pointer-events-none absolute left-3 top-3 text-white/80 transition-all
                               peer-placeholder-shown:top-3 peer-placeholder-shown:text-base
                               peer-focus:top-1 peer-focus:text-xs
                               peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs"
                  >
                    Логин
                  </label>
                </div>

                <div className="relative w-[300px]">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="peer h-12 w-full border-0 border-b border-white/40 bg-transparent px-3 pt-5 pb-2 text-white placeholder-transparent outline-none ring-0 transition focus:border-white"
                    placeholder=" "
                  />
                  <label
                    htmlFor="password"
                    className="pointer-events-none absolute left-3 top-3 text-white/80 transition-all
                               peer-placeholder-shown:top-3 peer-placeholder-shown:text-base
                               peer-focus:top-1 peer-focus:text-xs
                               peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs"
                  >
                    Пароль
                  </label>
                </div>

                <div className="h-[30px] w-auto" />
                <button
                  type="submit"
                  id="kc-login"
                  name="login"
                  className="inline-flex items-center justify-center rounded bg-white px-6 py-3 font-medium text-black shadow hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  Войти
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 z-20 m-0 w-full bg-white/5 px-5 py-3 text-center text-sm text-white/90 backdrop-blur">
        For best user experience please use Google Chrome browser
      </div>
    </div>
  );
}
