import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.jsx'),
      name: 'UniversalPlayer',
      fileName: (format) => `universal-player.${format}.js`,
    },
    rollupOptions: {
      // Prevents bundling React into the file if you want to use Laravel's version
      // Or keep it bundled for a "drop-in" experience
      external: [],
    },
  },
  server: {
    // Required for ffmpeg.wasm multi-threading
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
})
