import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Day boundaries depend on the time zone: pin it like the container does.
    env: { TZ: 'Europe/Rome' },
  },
});
