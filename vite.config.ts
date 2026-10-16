import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds to a single index.html (plus the manifest and icon from /public),
// so the whole app can be uploaded to GitHub Pages in one go.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { target: "es2022", assetsInlineLimit: 100_000_000 },
});
