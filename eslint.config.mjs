import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.open-next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.wrangler/**',
    // Vitest
    'coverage/**',
  ]),
  // Vitest globals 인식 설정
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/__tests__/**/*.{ts,tsx}',
      'vitest.config.ts',
      'vitest.setup.ts',
    ],
    languageOptions: {
      globals: {
        // Vitest globals (vitest.config.ts에서 globals: true로 설정되어 있음)
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        vitest: 'readonly',
      },
    },
  },
]);

export default eslintConfig;
