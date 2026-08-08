import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

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
  },
)