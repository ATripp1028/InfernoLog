import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { credentialRules } from '../../eslint.credentials.mjs'

export default tseslint.config(
  {
    ignores: ['dist/**', '.sst/**', 'node_modules/**'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.ts', 'infra/**/*.ts', 'sst.config.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // Passwords and verification codes never reach a log, console, Sentry
      // call, or error message. See eslint.credentials.mjs.
      ...credentialRules,
    },
  },
  {
    // Type-aware rules. Scoped to src because tsconfig.json — the project these
    // rules read types from — does not include infra/** or sst.config.ts.
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
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
    // SST supplies its globals ($config, $app, sst, aws, $interpolate) through
    // a triple-slash reference — that is the documented mechanism and there is
    // no import form of it. The rule's autofixer rewrites the reference into a
    // real `import`, which breaks `sst dev` two ways: sst.config.ts is then
    // rejected outright ("has top level imports"), and infra/** starts pulling
    // .sst/platform/src/global.d.ts in as a bundled module.
    files: ['infra/**/*.ts', 'sst.config.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  }
)
