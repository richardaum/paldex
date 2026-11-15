// Dev server com HMR para o frontend estático em public/.
// O Vite é a única porta do frontend: http://localhost:5173. O Flask (5000) é só API, via proxy /api.
// Uso: `python server.py` + `npm run dev`.
import { defineConfig } from "vite";

// Os scripts são clássicos (<script src>), sem HMR de módulo:
// CSS recebe HMR de verdade; mudanças em JS/HTML recarregam a página.
const reloadOnScriptChange = {
  name: "paldex-full-reload",
  handleHotUpdate({ file, server }) {
    if (/\.(js|html)$/.test(file)) {
      server.ws.send({ type: "full-reload" });
      return [];
    }
  },
};

export default defineConfig({
  root: "public",
  publicDir: false,
  plugins: [reloadOnScriptChange],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});
