import {defineConfig} from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1', port: 5178, strictPort: true,
    proxy: {'/api': {target: process.env.CS_BACKEND_URL || 'http://127.0.0.1:5188'}},
  },
});
