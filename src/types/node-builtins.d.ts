/**
 * 這個專案沒有 `@types/node`——它是瀏覽器應用，產品程式碼一行 Node API 都不碰，所以那份
 * 型別不該進 dependencies。`vite.config.ts` 用得到 `node:url` 卻不受影響，是因為 tsconfig 的
 * `include` 只有 `src`，它根本沒被檢查。
 *
 * 但**測試**住在 `src` 底下，會被 `tsc` 檢查。目前有兩個測試需要同一個 Node 內建：
 * `src/styles/narrowMapEntry.test.ts` 要直接從磁碟讀樣式表（Vitest 對 CSS 的 `?raw` 回傳空
 * 字串，見該檔註解），`src/instructionFiles.test.ts` 要讀 repo 根目錄的 `AGENTS.md` 與
 * `CLAUDE.md`。為了那一個函式裝一整包型別不划算，所以在這裡把用到的那一支寫出來。
 *
 * 規則：這個檔只宣告**測試真的呼叫到**的東西。它不是 `@types/node` 的替代品，長大了就代表
 * 該裝真的那一份了。
 */
declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}
