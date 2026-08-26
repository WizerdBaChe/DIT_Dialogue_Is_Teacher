# RCA R11.2 — 前提1「Codex 全部無法載入」：Worker 邊界實測

- **日期**：2026-08-26　·　**分支**：`feat/r11.2-uat-repairs` @ `3ba0ff6`
- **前置**：[`REVIEW_R11.2_STATE_AND_DESIGN_2026-08-20.md`](REVIEW_R11.2_STATE_AND_DESIGN_2026-08-20.md) §2
- **本文結論會推翻該報告 §2.4 的主假設**，其餘結論不受影響
- **未修改任何 `src/` 檔案**

---

## 0　先講結論

審查 §2.4 提的最合理單一假設是：建置產物寫死 `/assets/session.worker-*.js`，
只要不是從網站根目錄提供服務（`file://` 或子路徑）就會 404，而 404 的 Worker
在 Chrome 正是「onerror、message 為空」。

**這個假設在作者的實際用法下不成立。** 作者的流程是
`npm run build` → `npm run preview`，而 `vite preview` 就是從根目錄提供服務。
實測該請求回 **HTTP 200**，Worker **正常開機**，而且真實 Codex 檔案**解析完成**。

失敗不在 Worker 開機，也不在 Codex 解析。**審查對「層級」的定位仍然正確
（邊界沒有觀察者），但對「單一成因」的猜測是錯的。**

---

## 1　實測環境

| 項目 | 值 |
|---|---|
| 建置 | `npm.cmd run build` → exit 0（`tsc` + 主 build + snapshot build 三段全過） |
| 服務 | `npm run preview`，`http://localhost:4173`，從根目錄提供 |
| 瀏覽器 | Chromium（Browser pane） |
| 語料 | `~/.codex/sessions/**/rollout-*.jsonl`，**358 份**（與審查所用同一批） |
| 方法 | 在頁面情境中以 app 相同方式建構 Worker，送出 app 相同形狀的 `{type:"load", requestId, files:[{path, blob}]}` |

樣本以暫存方式放進 `dist/__diag__/`（`dist/` 已被 gitignore），測畢刪除；工作樹未受污染。

---

## 2　實測結果

### 2.1 Worker 資產與開機

```
GET /assets/session.worker-KykFupHx.js  ->  200, content-type: text/javascript
new Worker(url, { type: "module" })     ->  開機成功，2500 ms 內無 onerror
```

### 2.2 真實 Codex 資料（單檔，等同 `loadIndexEntry` 的實際行為）

| 樣本 | 位元組 | 判決 | fallbacks |
|---|---|---|---|
| `rollout-…18fb-7cf2…` | 442,202 | **COMPLETE** | 0 |
| `rollout-…18fc-7860…` | 228,301 | **COMPLETE** | 0 |
| `rollout-…18fd-7391…` | 190,068 | **COMPLETE** | 0 |

回傳 `{ doc, diagnostics }`，進度事件走完 `reading → parsing → …`。

### 2.3 兩側校準（證明錯誤通道本身是活的、且可區分）

| 輸入 | 預期 | 實得 |
|---|---|---|
| 三個不相干 session 一次送入 | 應判為多重 session | `MULTIPLE_SESSIONS`, detail `3` |
| Claude Code 的 `agent-*.jsonl`（子代理檔，非主逐字稿） | 應判為缺主逐字稿 | `NO_MAIN_TRANSCRIPT` |

**兩個已知錯誤輸入都得到具名診斷，沒有一個變成空訊息的 `onerror`。**
這證明 worker 內部的 `try/catch → post({type:"error"})` 通道正常運作，
而作者看到的 `Session worker failed.` 只可能來自 `sessionLoader.ts:65` 的
`onerror` 分支（`event.message` 為空時的後備字串）。

---

## 3　被排除的成因

| # | 假設 | 排除依據 |
|---|---|---|
| 1 | Worker 資產 404（`file://` / 子路徑）— **審查主假設** | `npm run preview` 從根提供服務，實測 200 |
| 2 | Worker 開機失敗 | 實測開機成功 |
| 3 | Codex 解析失敗 | 3 份真實檔全數 COMPLETE，0 fallback |
| 4 | 巢狀 chunk 404 導致空 onerror | 建置後的 worker **0 個靜態 import**，自足單檔 |
| 5 | 一次送太多檔（記憶體） | `loadIndexEntry` 只取 `entry.path` + `subagentPaths`；Codex 無子代理 → 單檔，即 §2.2 |
| 6 | 作者 preview 的是舊 dist | R11.2 動到 `src/` 的 commit 全在 **08-17**，磁碟上的 dist 建於 **08-18 15:50**，且重建後內容雜湊完全相同 |

---

## 4　仍然開著的候選（依可能性排序）

**A. 瀏覽器不支援 module worker。**
`sessionStore.ts:746` 的註解本身就把這一項列為已知成因之一
（「建構 Worker 失敗：CSP、file://、瀏覽器不支援 module worker」）。
`new Worker(url, { type: "module" })` 在不支援的瀏覽器會直接失敗，
症狀正是空訊息。**但這會讓 Claude Code 的 session 一起失敗** ——
所以審查 §2.4 的第 1 步仍是唯一的判別器，且仍未執行。

**B. FSA 取得的 `File` 與 `fetch` 取得的 `Blob` 有本測沒複製到的差異。**
本測的 blob 來自 `fetch`；實際 app 的來自 `FileSystemFileHandle.getFile()`。
兩者都可結構化複製，但磁碟後備的 File 有本測未涵蓋的失敗面。

**C. 當時是環境性/一次性的。** 無法排除，但也不能假設。

---

## 5　下一步（把問題收斂到一次回報）

原審查要三步，經本次實測後**只剩兩個問題**，都不需要開發者介入：

1. **你當時用哪個瀏覽器開 `localhost:4173`？**（Chrome / Edge / Firefox / 其他）
2. **同一次 preview、同一個瀏覽器，載一份 Claude Code 的 session 會不會也失敗？**
   （`~/.claude/projects/…` 底下任一資料夾）

- 兩者都失敗 → 候選 A 成立，與 Codex 無關，是 Worker 建構環境。
- 只有 Codex 失敗 → 候選 B，屆時需要 DevTools Console 整段，另立 RCA。

---

## 6　無論結果如何都該做的（F-01 / F-02）

審查 §2.5 已經寫了，本次實測讓它的價值更明確：**這次查證之所以要跑這麼多步，
正是因為錯誤通道把所有線索都丟掉了。**

- `worker.onerror` 目前丟棄 `event.filename` / `lineno` / `error`，只留一句無主英文。
  加一個具名 `WORKER_BOOT_FAILED` 並保留 `filename`/`lineno`，下一次同類回報可以**一次定案**。
- 接上 `loadFromFiles` 當降級路徑：Worker 起不來時退回同步解析（大檔會卡 UI，
  但「慢」遠勝過「全部讀不到」），並出一條 `warn` 說明為何變慢。

---

## 7　可反駁性 (refutability)

- **成立條件**：Chromium 系瀏覽器、`vite preview` 從根提供服務、上述三份樣本。
- **會被推翻的證據**：同樣流程下有任一份真實 Codex 檔在 worker 內拿到空訊息 `onerror`；
  或作者的失敗可在 Chromium + `npm run preview` 重現。
- **證據層級**：直接實測（不是推論），但**樣本 3 份不是 358 份** —— 本測證明的是
  「Codex 解析不是全面壞掉」，不是「每一份都好」。
