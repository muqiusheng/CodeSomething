import {defineConfig, type Plugin} from 'vite';
import tailwindcss from '@tailwindcss/vite';

const appEntry: Plugin = {
  name: 'codesomething-app-entry',
  configureServer(server) {
    server.middlewares.use(routeApp);
  },
  configurePreviewServer(server) {
    server.middlewares.use(routeApp);
  },
};

function routeApp(req: import('node:http').IncomingMessage, _res: import('node:http').ServerResponse, next: () => void) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (/^(GET|HEAD)$/.test(req.method || '') &&
      /^\/(learn|path|projects|school|reviews|portfolio|profile|bookmarks|settings|login|register|change-password|admin)(\/|$)/.test(url.pathname)) {
    req.url = '/app.html' + url.search;
  }
  next();
}

export default defineConfig({
  plugins: [appEntry, tailwindcss()],
  build: {rollupOptions: {input: {landing: 'index.html', app: 'app.html'}}},
  server: {
    host: '127.0.0.1', port: 5178, strictPort: true,
    proxy: {'/api': {target: process.env.CS_BACKEND_URL || 'http://127.0.0.1:5188'}},
  },
});
