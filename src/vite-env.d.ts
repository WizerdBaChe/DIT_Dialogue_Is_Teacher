/// <reference types="vite/client" />

// 允許以 ?raw 匯入 .jsonl 樣本為字串（見 src/fixtures）。
declare module "*.jsonl?raw" {
  const content: string;
  export default content;
}

// 允許測試以 ?raw 匯入元件原始碼做結構斷言（見 OverviewView.test.ts）。
declare module "*.tsx?raw" {
  const content: string;
  export default content;
}
