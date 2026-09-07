import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config kept minimal on purpose — Phase 5 (WebRTC/LiveKit) may need
// additional config (e.g. worker handling), added when that phase starts.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
