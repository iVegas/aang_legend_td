import { defineConfig } from 'vite';

// Bundles the verification server, together with the shared simulation, into one file.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'server.js' } },
  },
  ssr: { noExternal: true },
});
