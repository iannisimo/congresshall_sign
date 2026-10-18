import { execSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Build id: APP_VERSION if given (e.g. by CI), otherwise the git commit plus the build time. */
function buildVersion(): string {
  if (process.env['APP_VERSION']) return process.env['APP_VERSION'];
  const time = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `${commit}-${time}`;
  } catch {
    return time;
  }
}

/** Writes version.json next to the build so the server can tell the sign which version is current. */
function versionFile(version: string): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
    },
  };
}

export default defineConfig(({ command }) => {
  const version = command === 'build' ? buildVersion() : 'dev';
  return {
    root: 'src/web',
    build: { outDir: '../../dist/web', emptyOutDir: true },
    define: { __APP_VERSION__: JSON.stringify(version) },
    server: {
      port: 5173,
      // Keep the browser's Host header: the server checks it against Origin.
      proxy: { '/api': { target: 'http://127.0.0.1:3000' } },
    },
    plugins: [
      react(),
      tailwindcss(),
      versionFile(version),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'Centro Congressi',
          short_name: 'Sign',
          display: 'fullscreen',
          orientation: 'landscape',
          background_color: '#eef2f7',
          theme_color: '#10508c',
          icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // The uploaded venue logo; its URL changes with each upload (?v=…).
              urlPattern: ({ url }) => url.pathname === '/api/venue-logo' && url.searchParams.has('v'),
              handler: 'CacheFirst',
              options: { cacheName: 'venue-logo', expiration: { maxEntries: 4 }, cacheableResponse: { statuses: [200] } },
            },
            {
              // Carousel media: cached whole (the sign downloads them ahead), then played with range requests.
              urlPattern: ({ url }) => /^\/api\/media\/\d+$/.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'media',
                rangeRequests: true,
                expiration: { maxEntries: 60 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              // Logos never change once uploaded.
              urlPattern: ({ url }) => url.pathname.startsWith('/api/logos/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'logos',
                expiration: { maxEntries: 300, maxAgeSeconds: 180 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
  };
});
