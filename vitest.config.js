import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'backend',
          globals: true,
          environment: 'node',
          include: ['backend/**/*.test.js', 'tests/**/*.test.js']
        }
      },
      {
        test: {
          name: 'frontend',
          globals: true,
          environment: 'jsdom',
          include: ['frontend/**/*.test.{js,jsx}'],
          setupFiles: ['./frontend/src/setupTests.js']
        }
      }
    ]
  }
});
