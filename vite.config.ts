import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// 低耦合：以路徑別名 @ 指向 src，避免深層相對路徑造成模組相依脆弱。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // .jsonl 樣本以 ?raw 字串方式匯入（見 src/fixtures）。
  assetsInclude: ["**/*.jsonl"],
});
