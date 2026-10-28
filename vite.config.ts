import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub project Pages uses /seat-ai-observer/; override for a user-site/custom domain.
export default defineConfig({
  base: process.env.SITE_BASE_PATH || "/seat-ai-observer/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
