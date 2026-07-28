// Self-contained lint config for the api-transport package. `root: true` stops
// ESLint from walking up to the repo config (whose `packages/**` override
// assumes a React/browser env and mis-references the typescript-eslint
// recommended config). This is a pure, framework-agnostic TypeScript package.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2021,
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    // axios is confined to the single production adapter (see the override
    // below) so the port, the typed error and the fake-backend kernel stay
    // HTTP-library free and usable in any runtime.
    'no-restricted-imports': ['error', { paths: [{ name: 'axios' }] }],
  },
  overrides: [
    {
      files: ['src/httpAdapter.ts', 'src/httpAdapter.test.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
