import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Relative base so the same build works at a project-pages subpath
// (dranug1995.github.io/MLAI-CRM/) and at a custom domain root later.
// Routing is hash-based (see App.tsx) so a static host needs no rewrites.
export default defineConfig({
  base: "./",
  server: {
    host: "::",
    port: process.env.PORT ? Number(process.env.PORT) : 8080,
    strictPort: !!process.env.PORT,
  },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
