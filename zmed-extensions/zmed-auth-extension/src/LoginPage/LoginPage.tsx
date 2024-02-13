import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { User } from 'oidc-client';
import { Button, Input, Icon } from '@ohif/ui';

const LoginPage = ({
  routerBasename,
  userAuthenticationService,
  userManager,
  clientSecret,
  clientId,
}) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [unathorizedError, setUnathorizedError] = useState<boolean>(false);
  const [unknownError, setUnknownError] = useState<boolean>(false);

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
  };

  const login = async (e) => {
    e.preventDefault();
    const data = new URLSearchParams();
    data.append('grant_type', 'password');
    data.append('client_id', clientId);
    data.append('client_secret', clientSecret);
    data.append('username', email);
    data.append('password', password);

    axios
      .post(
        'http://localhost:8080/realms/test-realm/protocol/openid-connect/token',
        data,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )
      .then((response) => {
        localStorage.setItem('access_token', response.data.access_token);
        const user = new User(response.data);
        userManager.storeUser(user);
        userAuthenticationService.setUser(user);
      })
      .then(() => {
        navigate(routerBasename);
      })
      .catch((error) => {
        const status = error.response.status;
        switch (status) {
          case 401:
            setUnathorizedError(true);
          default:
            setUnknownError(true);
        }
      });
  };

  return (
    <div className="text-white flex flex-row">
      <div className="flex-auto flex items-center justify-center flex-col px-16 basis-5/12">
        <div className="px-20">
          <div className="flex items-start w-56 h-18 mb-3">
            <Icon name="zmed-logo" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col">
            <p className="text-3xl mb-8">Вход в личный кабинет</p>
            <form className="flex flex-col">
              <Input
                containerClassName="bg-black-500"
                label="Email"
                labelClassName="text-white-500"
                className="mb-6"
                placeholder="Введите ваш email"
                value={email}
                onChange={handleEmailChange}
              />
              <Input
                containerClassName="bg-black-500"
                label="Пароль"
                labelClassName="text-white-500"
                className="mb-8"
                placeholder="Введите пароль"
                value={password}
                onChange={handlePasswordChange}
              />
              <div className="flex justify-end align-center mb-14 w-full gap-8">
                {unathorizedError ? (
                  <p className="item-center align-center text-red-600 mr-4">
                    Неверный логин или пароль
                  </p>
                ) : unknownError ? (
                  <p className="item-center align-center text-red-600 mr-4">
                    Произошла ошибка
                  </p>
                ) : (
                  ''
                )}
                <Button
                  className="bg-black"
                  endIcon={<Icon name="arrow-right-small" />}
                  onClick={(e) => login(e)}
                >
                  Войти
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div className="basis-7/12">
        <img
          className="h-screen object-fill"
          // src={zmedLoginBg}
          alt="login-bg.png"
        />
      </div>
    </div>
  );
};

export default LoginPage;
