import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { credentialRules } from '../../eslint.credentials.mjs'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src/sst-env.d.ts'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      // strict-boolean-expressions needs type information.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
      // Passwords and verification codes never reach a log, console, Sentry
      // call, or error message. See eslint.credentials.mjs.
      ...credentialRules,
      // A truthiness check on a nullable number treats a legitimate 0 as missing
      // (an enjoyment of 0 was once reset to the default this way). Compare
      // against null instead. Strings, booleans and objects are left alone.
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowNullableBoolean: true,
          allowNullableString: true,
          allowNullableEnum: true,
          allowAny: true,
        },
      ],
    },
  },
  {
    // The Playwright suite. Node, not the browser, and none of the React
    // rules apply — it drives the app through a real page rather than
    // rendering anything.
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['e2e/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    // The suite reads the E2E user's password from its env file; it must not
    // print it either.
    rules: credentialRules,
  }
)
