import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Vite 的 HTML 轉譯層固定把進入點腳本標成 type="module" crossorigin 並置於 <head>，與 rollup
 * output.format 無關；singlefile 內聯時只換內容、不動屬性 (見 vite-plugin-singlefile
 * replaceScript())。內容已是 IIFE，型別換成一般 script 即可滿足 EX-INV-3「不得依賴
 * <script type=module>」；但一般 inline script 沒有 defer 語意 (defer 只對有 src 的
 * script 生效)，會在 <head> 解析當下立刻執行，早於 <body> 後段的 payload <script> 存在——
 * 因此改包一層 DOMContentLoaded，保留「等 HTML 解析完再跑」的原始時序。
 */
function stripModuleScriptType(): Plugin {
  return {
    name: "dit-strip-module-script-type",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "asset" && chunk.fileName.endsWith(".html") && typeof chunk.source === "string") {
          chunk.source = chunk.source.replace(
            /<script type="module" crossorigin>([\s\S]*?)<\/script>/,
            (_match, code: string) => `<script>document.addEventListener("DOMContentLoaded",function(){${code}});</script>`,
          );
        }
      }
    },
  };
}

// 快照 build target (EX-03)：獨立內聯單檔，可直接以 file:// 開啟。
// outDir 與主 build 共用 dist/，emptyOutDir: false 以免清掉主 build 的產物。
export default defineConfig({
  plugins: [react(), viteSingleFile(), stripModuleScriptType()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  assetsInclude: ["**/*.jsonl"],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL("./snapshot.html", import.meta.url)),
      output: {
        // IIFE，而非 ES module：file:// 的 null origin 會擋掉 <script type="module"> 的 CORS 抓取 (EX-INV-3)。
        format: "iife",
      },
    },
  },
});
