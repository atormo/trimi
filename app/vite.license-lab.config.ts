import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate build entry: the production Trimi build does not include this experiment.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/license-lab',
    rollupOptions: { input: 'license-lab.html' },
  },
});
