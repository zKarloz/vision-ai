import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Una sola entrada del producto; Vite empaqueta el Worker ONNX separado. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  worker: { format: 'es' },
  test: { environment: 'node' },
});
