import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Check if we're building the library
const isLibBuild = process.env.BUILD_MODE === 'lib'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Library build configuration
  build: isLibBuild ? {
    lib: {
      entry: resolve(__dirname, 'src/lib.js'),
      name: 'M3UPlayer',
      fileName: (format) => `m3u-player.${format}.js`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // Don't externalize React - bundle it for drop-in experience
      // Users can use the ES module and tree-shake if they have their own React
      external: [],
      output: {
        // Provide globals for UMD build
        globals: {},
        // Ensure CSS is extracted
        assetFileNames: 'm3u-player.[ext]',
      },
    },
    // Generate sourcemaps for debugging
    sourcemap: true,
    // Don't minify for easier debugging (can be enabled for production)
    minify: 'esbuild',
  } : {
    // Standard build for demo
    outDir: 'dist-demo',
    sourcemap: true,
  },

  // Development server configuration
  server: {
    port: 5173,
    // Use 'credentialless' for COEP - more permissive than 'require-corp'
    // Still enables SharedArrayBuffer for FFmpeg.wasm multi-threading
    // but allows cross-origin resources without CORP headers (Chrome 96+)
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },

  // Preview server (for testing builds)
  preview: {
    port: 4173,
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['shaka-player'],
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },

  // Define globals
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
})
