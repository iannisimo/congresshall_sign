import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

/** Build id written by the Vite build; "dev" when the web app isn't built. */
export function readVersion(webDir: string): string {
  try {
    const { version } = JSON.parse(readFileSync(join(webDir, 'version.json'), 'utf8')) as { version?: unknown };
    return typeof version === 'string' && version ? version : 'dev';
  } catch {
    return 'dev';
  }
}

/**
 * Serves the built web app. Hashed assets are cached forever; everything else (index.html, the
 * service worker, the manifest) must be revalidated so a new version is picked up right away.
 */
export function webRoutes(webDir: string) {
  const app = new Hono();
  const indexPath = join(webDir, 'index.html');

  if (!existsSync(indexPath)) {
    app.get('*', (c) =>
      c.text('The web app is not built. Run `npm run build`, or use the Vite dev server (npm run dev).', 503),
    );
    return app;
  }

  app.use(
    '/assets/*',
    serveStatic({ root: webDir, onFound: (_path, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }),
  );
  app.use('*', serveStatic({ root: webDir, onFound: (_path, c) => c.header('Cache-Control', 'no-cache') }));
  // Client-side routes (/admin/...) all load the same page. Read each time, so a rebuild without a
  // restart never serves a page pointing at assets that are gone.
  app.get('*', (c) => {
    c.header('Cache-Control', 'no-cache');
    return c.html(readFileSync(indexPath, 'utf8'));
  });
  return app;
}
