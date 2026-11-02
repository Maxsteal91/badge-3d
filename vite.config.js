import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tre build:
//   --mode standalone  dist/standalone/badge.js (+ assets/): React incluso, per <script type="module">.
//                      Gli asset sono risolti relativi allo script (import.meta.url), quindi la cartella
//                      funziona da CDN o copiata in qualunque percorso del sito.
//   --mode lib         dist/lib/index.js: componente React per bundler, dipendenze esterne (peer),
//                      GLB e font inlinati come data URL (nessun file da servire a parte).
//   --mode demo        dist/demo/: playground per GitHub Pages.
// `vite` (dev) serve il playground di index.html.
const PEERS = [/^react($|\/)/, /^react-dom($|\/)/, /^three($|\/)/, /^@react-three\//]

export default defineConfig(({ mode }) => {
  const plugins = [react()]

  if (mode === 'lib') {
    return {
      plugins,
      build: {
        outDir: 'dist/lib',
        emptyOutDir: true,
        lib: { entry: 'src/index.js', formats: ['es'], fileName: () => 'index.js' },
        rollupOptions: { external: (id) => PEERS.some((re) => re.test(id)) },
      },
    }
  }

  if (mode === 'standalone') {
    return {
      plugins,
      base: './',
      build: {
        outDir: 'dist/standalone',
        emptyOutDir: true,
        assetsInlineLimit: 0,
        modulePreload: false,
        chunkSizeWarningLimit: 4000, // React + three + Rapier (WASM) in un unico file
        rollupOptions: {
          input: 'src/standalone.jsx',
          preserveEntrySignatures: 'exports-only',
          output: {
            entryFileNames: 'badge.js',
            assetFileNames: 'assets/[name][extname]',
            codeSplitting: false,
          },
        },
      },
    }
  }

  return {
    plugins,
    base: mode === 'demo' ? (process.env.DEMO_BASE ?? '/badge-3d/') : '/',
    build: { outDir: 'dist/demo', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
  }
})
