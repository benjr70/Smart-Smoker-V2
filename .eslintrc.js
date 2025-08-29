module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.js', // Ignore JS files at root level (like this config)
    'MicroController/',
    '.webpack/',
    'electron-app/',
  ],
  overrides: [
    // TypeScript files (Backend, Device Service) - Uses per-app project references
    {
      files: ['apps/backend/**/*.ts', 'apps/device-service/**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        sourceType: 'module',
        // Don't use project references at root level - rely on app-level configs
      },
      plugins: ['@typescript-eslint'],
      extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
        'prettier',
      ],
      env: {
        node: true,
        jest: true,
      },
      rules: {
        // Smart Smoker V2 specific rules (relaxed for workspace level)
        '@typescript-eslint/interface-name-prefix': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off', // Too strict for workspace level
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': 'error',
        '@typescript-eslint/prefer-const': 'error',
        '@typescript-eslint/no-inferrable-types': 'off',
        // Consistency with best practices
        'prefer-const': 'error',
        'no-var': 'error',
        'object-shorthand': 'error',
        'prefer-template': 'error',
      },
    },
    // React TypeScript files (Frontend, Smoker App)
    {
      files: ['apps/frontend/**/*.{ts,tsx}', 'apps/smoker/**/*.{ts,tsx}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      plugins: ['@typescript-eslint', 'react', 'react-hooks'],
      extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:jsx-a11y/recommended',
        'prettier',
      ],
      env: {
        browser: true,
        es2021: true,
        jest: true,
      },
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        // React specific rules aligned with best practices
        'react/react-in-jsx-scope': 'off', // Not needed in React 17+
        'react/prop-types': 'off', // Using TypeScript
        'react/jsx-uses-react': 'off', // Not needed in React 17+
        'react/jsx-uses-vars': 'error',
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
        // Functional component enforcement (per best practices)
        'react/prefer-stateless-function': 'error',
        'react/function-component-definition': ['error', {
          'namedComponents': 'arrow-function',
          'unnamedComponents': 'arrow-function'
        }],
        // TypeScript rules (relaxed for React)
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': 'error',
        // General rules
        'prefer-const': 'error',
        'no-var': 'error',
        'object-shorthand': 'error',
        'prefer-template': 'error',
      },
    },
    // Package TypeScript files
    {
      files: ['packages/**/*.{ts,tsx}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      plugins: ['@typescript-eslint', 'react', 'react-hooks'],
      extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'prettier',
      ],
      env: {
        browser: true,
        es2021: true,
        jest: true,
      },
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        // Similar to frontend rules but less strict
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': 'error',
        'prefer-const': 'error',
        'no-var': 'error',
      },
    },
    // JavaScript files (configs, webpack files)
    {
      files: ['**/*.js'],
      env: {
        node: true,
        browser: false,
      },
      extends: ['eslint:recommended', 'prettier'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        'prefer-const': 'error',
        'no-var': 'error',
      },
    },
  ],
};
