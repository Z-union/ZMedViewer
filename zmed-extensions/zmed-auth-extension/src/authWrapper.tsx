import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { User } from 'oidc-client';
import { initUserManager } from './oidc/initUserManager';
import { oidc } from './oidc/oidc-settings';

const authWrapper = ({ userAuthenticationService }) => {
  const userManager = initUserManager(oidc);

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
      } // replace with checking for the presence of a refresh token in the cookie

      const data = new URLSearchParams();
      data.append('grant_type', 'refresh_token');
      data.append('refresh_token', user.refresh_token);
      data.append('client_id', oidc[0].client_id);
      data.append('client_secret', oidc[0].client_secret);

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
        })
        .catch((error) => {
          userManager.storeUser(null);
          userAuthenticationService.setUser(null);
          localStorage.removeItem('access_token');
          userAuthenticationService.handleUnauthenticated();
          throw new Error(`Failed to update access token: ${error}`);
        });
    }

    //updateTokens();

    if (!timerIdRef.current) {
      timerIdRef.current = setInterval(updateTokens, 3000);
    }

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
