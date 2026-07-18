// Self-contained lint config for the smoke-session package. `root: true` stops
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
    // The socket library is confined to the two production adapters (see the
    // override below). Everywhere else — the store, ports, fakes — must speak
    // only through the ports, so the core stays socket-free and fully fakeable.
    'no-restricted-imports': ['error', { paths: [{ name: 'socket.io-client' }] }],
  },
  overrides: [
    {
      files: ['src/adapters/cloud-socket.ts', 'src/adapters/device-feed.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
