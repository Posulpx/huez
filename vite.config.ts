import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    open: true
  },
  build: {
    target: "es2023",
    outDir: "dist",
    sourcemap: true
  }
});
