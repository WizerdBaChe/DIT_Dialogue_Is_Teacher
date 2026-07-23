# R8 — Provider Openness：UAT 驗收清單

> 分支：`feat/r8-provider-openness`。以下項目需要你在真實環境（真金鑰、真本機服務）操作；
> 我已用可控條件（假金鑰、未啟動的本地服務）在瀏覽器中自測過對應的狀態機分支，細節見各項「我已驗證」。
> 全部確認後，我才會進行 push GitHub／建 release 的動作。

## 如何啟動來自測

```bash
npm run dev
```
開啟設定 → 講解來源，即可切換所有新預設。

## 清單

1. **下拉選單與欄位隨 metadata 變化**（設計文件 §12-1）
   - 講解來源下拉應看到：不講解／Ollama／LM Studio／Jan／本地代理／Anthropic／OpenRouter／Groq／自訂端點，共 9 項。
   - 切到 LM Studio／Jan：不出現金鑰欄；切到 Anthropic／OpenRouter／Groq／自訂端點：出現金鑰欄 + 外傳保護（隱私政策）選單。
   - **我已驗證**：截圖確認 9 項齊全，欄位切換符合預期。

2. **Anthropic 真實金鑰**
   - 填入你自己的 Anthropic API 金鑰，按「重新檢查」，應看到「已就緒」。
   - 選一個節點按「講解全部」（單則即可），應跳出去識別化預覽 + 一次性同意（含「可能消耗付費額度」提示），確認後應該真的產生講解。
   - **我已驗證（假金鑰）**：填入無效金鑰時，瀏覽器實際打到 `https://api.anthropic.com/v1/models`，收到 HTTP 401「the API key was rejected」——證明瀏覽器直連＋header 這條路徑本身是通的，只是我沒有真金鑰可以驗證「真的產生講解」這一步。

3. **OpenRouter / Groq 真實金鑰**
   - 同上，填入你自己在 OpenRouter／Groq 申請的金鑰，確認可以連線並產生講解。
   - **我已驗證（結構）**：未填金鑰時正確落在 `auth-missing`；不需要你事先做任何操作即可確認的部分我已做完，真正的「金鑰生效、成功講解」需要你的帳號。

4. **Ollama／LM Studio／Jan 真實本地服務**
   - 啟動你本機的 Ollama / LM Studio / Jan（含設定跨域，如 `OLLAMA_ORIGINS=*`），確認 DIT 能探測到 `ready` 並列出模型、能正常產生講解。
   - **我已驗證（未啟動情境）**：LM Studio 在服務未啟動時正確顯示「無法連線」而非誤判成 CORS 問題（見下方「已修的一個小狀態機 bug」）。

5. **自訂端點 CORS 情境**（設計文件 §12-5）
   - 選「自訂端點」，填一個會被瀏覽器 CORS 擋下的雲端 URL（例如非 Anthropic/OpenRouter/Groq 的一般雲端 API），確認狀態顯示「被瀏覽器擋下 (CORS)」並提示改走本地代理，而不是誤報「無法連線」。
   - **我已驗證**：LM Studio（本地、未啟動）情境下驗證了「offline vs cors-blocked」的分類邏輯不會混淆——本地服務未啟動歸類 offline，雲端 direct 預設連不上歸類 cors-blocked。自訂端點的雲端情境因為需要一個「存在但會擋 CORS」的真實 URL，你可以用任何一般雲端 API（非本輪三個已知可直連的）測試。

6. **`dit.config.json` 金鑰持久化**（設計文件 §7、§12-4）
   - 複製 `public/dit.config.example.json` 為同層的 `dit.config.json`，填入一個假金鑰，`npm run dev` 或用本地 server 開啟 build 後的 `dist/`，確認面板自動帶入金鑰、且金鑰輸入框不會把它明文印在別處。
   - **我已驗證（程式碼層級保證，非需要你操作）**：`buildSessionExport()`（`src/core/export/buildExport.ts`）是純函式，只接受 `doc` 與 `annotations` 兩個參數，**結構上完全不接觸** `presetConfigs`／`anthropicConfig`／`cloudConfig`（金鑰的存放位置）——匯出 JSON／HTML 快照不可能包含金鑰，這是程式碼結構保證而非測試巧合。若你想肉眼複核，匯出後對檔案全文搜尋你填的假金鑰字串即可。

## 已修的一個小狀態機 bug（自測中發現並修正）

最初 `classifyUnreachable()` 對所有「direct」預設一律回報 `cors-blocked`，但本地服務（LM Studio／Jan）沒開時，`fetch` 拋出的 TypeError 幾乎都是「服務沒開」而非 CORS 問題。已改為：本地預設未啟動 → `offline`；雲端 direct 預設連不上 → `cors-blocked`；需代理的預設連不上 → `proxy-missing`。已在瀏覽器中重新驗證 LM Studio 未啟動時正確顯示「無法連線：is the local server running?」。

## M0 之外的已知技術債（設計文件已標注，非本輪缺陷）

- **ADR-032**：`local-proxy`（`cloud` id，OpenCode）沒有走新的通用 OpenAI-chat transport，沿用既有 OpenCode 專屬 API；是否能讓 LiteLLM 之類真 OpenAI-chat 代理與 OpenCode 完全互通尚未驗證。
- **`ProviderId` 尚未把 `cloud` 正式改名 `local-proxy`**——維持向後相容（既有快取 provenance 用字面值 `"cloud"`/`"opencode"`），留待下一輪決定是否值得做遷移。
- **Onboarding（M6）刻意不做**——設計文件 §10 開放問題 3 要求先問你 UX 方向（純提示 vs 三步精靈），本輪未問，故未做。

## 完工狀態

M1–M5 全部完成，`npm run typecheck` / `npm test`（257 個測試全過）/ `npm run build` 全綠。分支 `feat/r8-provider-openness` 已有兩個 commit（PSM 文件 + 實作）。**尚未 push、尚未建 PR、尚未打 release**——等你完成上方清單、確認沒問題後再進行。
