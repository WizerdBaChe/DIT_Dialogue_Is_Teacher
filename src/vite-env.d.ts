/// <reference types="vite/client" />

// 允許以 ?raw 匯入 .jsonl 樣本為字串（見 src/fixtures）。
declare module "*.jsonl?raw" {
  const content: string;
  export default content;
}
