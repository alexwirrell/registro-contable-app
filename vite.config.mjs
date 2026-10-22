// vite.config.js
import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // El punto de entrada para tu proceso principal de Electron.
        entry: 'electron/main.cjs',
      },
      preload: {
        // El punto de entrada para tu script de precarga.
        input: path.join(__dirname, 'electron/preload.cjs'),
      },
      // Permite que el código del renderizador use módulos de Node.js.
      renderer: {},
    }),

  ],
})