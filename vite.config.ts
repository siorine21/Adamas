import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 等のサブパス配信に備え、base は環境変数で切替可能にする。
// 既定はルート配信（ローカル/一般的な静的ホスティング向け）。
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
});
