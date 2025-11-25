import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist', '.open-next'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov', 'html'],
      include: [
        // API Routes
        'app/api/bets/**/*.ts',
        'app/api/health/**/*.ts',
        'app/api/rounds/**/*.ts',
        'app/api/cron/**/*.ts',
        // Business Logic
        'lib/bets/**/*.ts',
        'lib/rounds/**/*.ts',
        'lib/config/**/*.ts',
        'lib/cron/**/*.ts',
      ],
      exclude: [
        'node_modules',
        '.next',
        'dist',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/types.ts',
        'db/schema/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
});
