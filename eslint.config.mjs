// ESLint 10 uses flat config; this file replaces the legacy .eslintrc.json.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'reports/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'demo-app/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/expect-expect': [
        'error',
        { assertFunctionNames: ['expectSchema', 'expectApiError', 'expectNoA11yViolations'] },
      ],
    },
  },
  {
    // Server and CLI scripts legitimately write to stdout.
    files: ['demo-app/**/*.ts', 'scripts/**/*.ts', 'utils/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
