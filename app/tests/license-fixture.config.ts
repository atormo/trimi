import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Explicit, local-only test server. The normal Vite config never imports this file.
// Exercises the real App, hook, and API response handling without contacting Polar.
const TEST_KEY = 'TRIMI-TEST-1234-5678-90AB-CDEF-1234-5678';
const RECORDING_KEYS = new Set(['TRIMI-8F3A-72C9-BE41-6D05', 'TRIMI-4C7E-91B2-A8D6-3F05']);
const activeKeys = new Set<string>();
let failedUnlink = false;
let failedValidation = false;

export default defineConfig({
  plugins: [react(), {
    name: 'local-license-fixture',
    enforce: 'pre',
    transformIndexHtml(html) {
      return html.replace(/<title>.*?<\/title>/, '<title>Trimi — Grabación con licencia ficticia</title>');
    },
    transform(code, id) {
      if (id.endsWith('/src/lib/license.ts')) {
        return code.replace('https://api.polar.sh/v1/customer-portal/license-keys', '/__test-license');
      }
    },
    configureServer(server) {
      server.middlewares.use('/__test-license', (req, res) => {
        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', () => {
          let body: { key?: string };
          try { body = JSON.parse(raw); } catch { res.writeHead(400).end(); return; }
          // Accept formatting introduced by copying a recording key from formatted text.
          body.key = body.key?.trim().toUpperCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u200B-\u200D\uFEFF]/g, '');
          setTimeout(() => {
            res.setHeader('Content-Type', 'application/json');
            if (!body.key || (body.key !== TEST_KEY && !RECORDING_KEYS.has(body.key))) { res.writeHead(404).end('{}'); return; }
            if (req.url === '/activate') {
              activeKeys.add(body.key);
              res.end(JSON.stringify({ id: 'test-activation-id', license_key: { status: 'granted' } }));
            } else if (req.url === '/validate') {
              if (body.key === TEST_KEY && !failedValidation) { failedValidation = true; res.writeHead(503).end('{}'); return; }
              res.end(JSON.stringify({ status: activeKeys.has(body.key) ? 'granted' : 'revoked' }));
            } else if (req.url === '/deactivate') {
              if (body.key === TEST_KEY && !failedUnlink) { failedUnlink = true; res.writeHead(503).end('{}'); return; }
              activeKeys.delete(body.key);
              res.writeHead(204).end();
            } else res.writeHead(404).end('{}');
          }, 350);
        });
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
