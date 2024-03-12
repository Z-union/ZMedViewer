import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { User } from 'oidc-client';
import { initUserManager } from './oidc/initUserManager';

const authWrapper = ({ userAuthenticationService, oidc }) => {
  const userManager = initUserManager(oidc);
  console.log(oidc);
  const getTokensUrl = oidc[0].get_tokens;

  const getAuthorizationHeader = () => {
    const user = userAuthenticationService.getUser();
    return;

    // if the user is null return early, next time
    // we hit this function we will have a user
    if (!user) {
      return;
    }

    return {
      Authorization: `Bearer ${user}`,
    };
  };

  const handleUnauthenticated = () => {
    window.location.href = '/login';

    // return null because this is used in a react component
    return null;
  };

  useEffect(() => {
    userAuthenticationService.set({ enabled: true });

    userAuthenticationService.setServiceImplementation({
      getAuthorizationHeader,
      handleUnauthenticated,
    });
  }, []);

  const timerIdRef = useRef(null);

  useEffect(() => {
    async function updateTokens() {
      const user = await userManager.getUser();

      if (
        user == null &&
        window.location.href != 'http://localhost:3000/login'
      ) {
        userAuthenticationService.handleUnauthenticated();
      } // Потом надо немного переработать логику, чтобы она взаимодействовала с cookie

      const data = new URLSearchParams();
      data.append('grant_type', 'refresh_token');
      data.append('refresh_token', user.refresh_token);
      data.append('client_id', oidc[0].client_id);
      data.append('client_secret', oidc[0].client_secret);

      axios
        .post(getTokensUrl, data, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
        .then(response => {
          localStorage.setItem('access_token', response.data.access_token);
          const user = new User(response.data);
          userManager.storeUser(user);
        })
        .catch(error => {
          userManager.storeUser(null);
          userAuthenticationService.setUser(null);
          localStorage.removeItem('access_token');
          userAuthenticationService.handleUnauthenticated();
          throw new Error(`Failed to update access token: ${error}`);
        });
    }

    if (!timerIdRef.current) {
      timerIdRef.current = setInterval(updateTokens, 5000);
    }

    updateTokens();

    return () => {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const accessToken = localStorage.getItem('access_token');

    if (accessToken) {
      userAuthenticationService.setUser(accessToken);
    }
  }, []);

  return null;
};

export default authWrapper;
