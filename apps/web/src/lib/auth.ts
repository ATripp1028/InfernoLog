import { Amplify } from 'aws-amplify'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [import.meta.env.VITE_REDIRECT_SIGN_IN],
          // Each is also registered as a logout URL on the pool
          // (apps/api/infra/auth.ts). /signup is where a Google signup refused
          // for an email another account already has lands.
          redirectSignOut: [
            import.meta.env.VITE_REDIRECT_SIGN_OUT,
            `${import.meta.env.VITE_REDIRECT_SIGN_OUT}/no-account-found`,
            `${import.meta.env.VITE_REDIRECT_SIGN_OUT}/signup`,
          ],
          responseType: 'code',
        },
      },
    },
  },
})
