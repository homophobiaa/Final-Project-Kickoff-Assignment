import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const engine = 'http://localhost:5080'

// In development Vite serves the UI and forwards API + SignalR traffic to the .NET server.
// `npm run build` writes straight into the server's wwwroot so `dotnet run` serves everything.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': engine,
      '/hub': { target: engine, ws: true },
    },
  },
  build: {
    outDir: '../src/Safelight.Server/wwwroot',
    emptyOutDir: true,
    // A local tool loaded once from localhost; one bundle is simpler than splitting.
    chunkSizeWarningLimit: 700,
  },
})
