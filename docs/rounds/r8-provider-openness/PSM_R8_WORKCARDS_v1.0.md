# R8 — Provider Openness：施工卡 PSM v1.0

> 上游：[DESIGN_R8_PROVIDER_OPENNESS_v0.1.md](./DESIGN_R8_PROVIDER_OPENNESS_v0.1.md)（PIM 語意契約，本文件不推翻，只落實為可施工卡）。
> 本文件狀態：**build-ready**。M0 已於本 session 實測完成，結果覆寫設計文件 §5/§10 部分假設，見下方「M0 結果」。
> 分支：`feat/r8-provider-openness`（自 main 切出）。

---

## M0 結果（2026-07-24 實測，覆寫設計文件假設）

以瀏覽器 fetch（非 Node）對三個雲端 API 送出帶假金鑰的請求，觀察是被 CORS 擋（fetch 拋 `TypeError: Failed to fetch`，請求從未到站）還是真的到站（回應 HTTP 狀態碼，即使是 401）：

| Provider | 有無 `anthropic-dangerous-direct-browser-access` | 結果 |
|---|---|---|
| Anthropic | 有 | **到站**，HTTP 401 invalid x-api-key → 瀏覽器直連可行，確認設計文件假設 |
| Anthropic | 無 | **CORS 擋**，fetch 拋 TypeError → 確認此 header 是必要條件 |
| OpenRouter | n/a（Bearer token） | **到站**，HTTP 401 Missing Authentication header → **瀏覽器可直連，不需代理** |
| Groq | n/a（Bearer token） | **到站**，HTTP 401 Invalid API Key → **瀏覽器可直連，不需代理** |

**結論（推翻設計文件 §5 保守假設）**：OpenRouter、Groq 兩者皆可瀏覽器直連，`browserReach` 應為 `"direct"`，**不需要**透過 `local-proxy`。予以升級為獨立 `direct` cloud 預設。

**ADR-031（本 session 新增，續編）**：OpenRouter、Groq 升級為獨立 `kind: "cloud"`、`browserReach: "direct"` 預設，比照 Anthropic BYOK 模式（needsKey、sendsDataOut、Privacy Envelope、cost 確認）。`local-proxy` 保留給仍需代理的雲端（如未來新增、CORS 政策可能變動的供應商）與自訂端點的保守預設。

**ADR-032（本 session 新增，實作偏離記錄）**：`local-proxy` 的 transport 契約標作 `openai-chat`，但既有 OpenCode 整合（`src/core/llm/cloud.ts`）走的是 OpenCode 專屬 session/message REST API，並非 OpenAI Chat Completions 相容格式；是否可用純 OpenAI-chat 呼叫 OpenCode 尚未驗證。本輪**不重寫**已可運作的 OpenCode transport，`local-proxy` 預設的具體實作沿用現有 `createOpenCodeTransport`；新增的 LiteLLM 之類「真 OpenAI-chat 代理」走通用 `genericProvider`。此為已知技術債，若之後要讓 `local-proxy` 完全型別一致，需要獨立驗證 opencode 是否有 `/v1/chat/completions` 相容層。

---

## 型別遷移：`ProviderId` → Preset 架構

現行 `ProviderId = "none" | "ollama" | "cloud"`（[spanTree.ts](../../src/types/spanTree.ts)）改為：

```ts
export type ProviderId = "none" | PresetId; // PresetId 定義於 core/llm/presets.ts
export type PresetId =
  | "ollama" | "lmstudio" | "jan"
  | "anthropic-byok" | "openrouter" | "groq"
  | "local-proxy" | "custom";
```

`Annotation.provider` 欄位（記錄講解由哪個 provider 產生，用於快取失效判斷）比照擴大為 `PresetId | "none"`。**向後相容注意**：舊快取（`provider: "cloud"`）在型別改變後視為過期 cache-miss，非資料損毀——已透過既有 `cachedForCurrentConfig` 機制以 provider+model 組合鍵判斷，不需額外遷移程式碼。

---

## 施工卡

### M1 — Endpoint Provider + Preset registry + metadata 驅動面板

**新增**
- `src/core/llm/presets.ts`：`ProviderPreset` 型別（照設計文件 §3 schema）+ `PROVIDER_PRESETS: ProviderPreset[]`（8 筆，含 ADR-031 的 openrouter/groq）。
- `src/core/llm/genericProvider.ts`：通用 OpenAI-chat-compatible provider 工廠，吃 preset + baseUrl/key/model，覆蓋 ollama/lmstudio/jan/openrouter/groq/custom 六種。
- `src/core/llm/anthropicProvider.ts`：Anthropic Messages API provider（BYOK，direct + dangerous header）。
- `src/components/EndpointPanel.tsx`：取代 `OllamaPanel.tsx` + `CloudPanel.tsx`，單一面板依 `activePreset` metadata 決定顯示欄位（INV-R8-6）。

**修改**
- `src/core/llm/index.ts`：`getProvider` 改吃 `PresetId`，依 `preset.transport` 分派到 genericProvider / anthropicProvider / 既有 opencode transport（local-proxy）。
- `src/types/spanTree.ts`：`ProviderId` 型別遷移（見上節）。
- `src/store/sessionStore.ts`：`providerId` 沿用（現在是 union 更大），新增 `activePresetConfig`（取代 `ollamaConfig`/`cloudConfig` 分離狀態）。
- `src/components/SettingsDialog.tsx`：`PROVIDERS` 陣列改由 `PROVIDER_PRESETS` 動態產生；掛載 `EndpointPanel` 取代兩個舊面板。
- `src/i18n/locales.ts`：新增 `endpoint.*` 字典（zh-TW + en 雙語，沿用現有 `ollama.*`/`cloud.*` 命名風格逐步淘汰）。

**驗收（自動）**：`npm run typecheck`、`npm test` 全綠；新增 `presets.test.ts`（8 筆 preset 皆通過 schema 型別檢查、id 唯一）。
**驗收（人工，UAT，對應設計文件 §12 第 1 項）**：設定對話框下拉出現 6+ 預設，切換時欄位隨 metadata 增減。

---

### M2 — Config File + 三層金鑰

**新增**
- `src/core/config/configFile.ts`：執行期 `fetch('./dit.config.json')`；找不到/解析失敗一律靜默降級（回傳 `null`），不拋錯打斷啟動。
- `dit.config.example.json`（repo 根目錄，進 git，附註解版說明每欄用途）。

**修改**
- `.gitignore`：加入 `dit.config.json`（INV-R8-3）。
- 打包腳本（`vite.config.ts` / release 腳本）：確認 `dit.config.json` 不進 `dist/`、不進 release zip 的 app bundle（只有 `.example.json` 進）——若現有 release 腳本用白名單複製而非黑名單，天然滿足，仍需一行驗證。
- `src/store/sessionStore.ts`：金鑰狀態改為記憶體 `Record<PresetId, string>`，啟動時嘗試 `configFile` 讀入；使用者面板貼上時只更新記憶體，不寫 `localStorage`（除非之後才做的「記住金鑰」開關，本輪不做，非 M0-M5 範圍）。

**驗收（自動）**：`configFile.test.ts`（mock fetch：成功/404/壞 JSON 三案例）。
**驗收（人工，UAT，對應 §12 第 4 項）**：填入金鑰後匯出 JSON 與靜態 HTML，全文檢索確認無金鑰字串——**此項需要真實 UI 操作 + 檔案全文檢索，我會在自測階段以假金鑰跑一次匯出並用 grep 驗證**，人工 UAT 僅需複核我提供的檢索結果。

---

### M3 — EndpointStatus 狀態機擴充

**修改**
- `genericProvider.ts` / `anthropicProvider.ts` 的探測函式：回傳擴充後的狀態 `checking | ready | offline | cors-blocked | auth-missing | model-missing | no-model | proxy-missing`。
- CORS 判斷：`fetch` 拋 `TypeError` 且非逾時 → 對 `browserReach === "direct"` 的預設一律標 `cors-blocked`（非 `offline`），因為多數情況下是 CORS 而非服務真的不可達；`needs-proxy` 的預設連不上才是單純 `proxy-missing`（INV-R8-5）。
- `EndpointPanel.tsx`：每個非 ready 狀態對應一段 metadata 驅動的補救文案（安裝指令／開 CORS／填金鑰／換模型／起代理）。

**驗收（自動）**：狀態機 reducer 的純函式單元測試（給定 fetch 結果 → 預期狀態）。
**驗收（人工，UAT，對應 §12 第 2/3/5 項）**：需要真的斷開 Ollama、真的不填金鑰、真的填一個會被擋的自訂網址——這三項我在自測階段用可控條件模擬（例如指向不存在的 port 模擬 offline/proxy-missing），但「使用者真實環境下的 Ollama 未開 CORS」這種需要使用者本機環境的情境，**列入 UAT**。

---

### M4 — Cost 同意 + Privacy Envelope 全覆蓋

**修改**
- `src/adapters/dit/privacyAdapter.ts`：函式改名去除 `OpenCode` 專屬字樣（如 `annotateWithPrivacy`），吃任意 `transport`，不只 opencode（INV-R8-1 要求所有 `sendsDataOut` 預設都走這條路）。
- `src/store/sessionStore.ts`：`annotateOne` 內對 `sendsDataOut === true` 的 preset 一律走 privacy adapter；新增 `cost !== "free"` 的一次性同意閘（比照現有 `cloudConsent` 的 scope-based 記憶模式，泛化成 `costConsent: Record<PresetId, {scope, consentId}>`）（INV-R8-4）。
- `src/core/llm/anthropicProvider.ts` / `genericProvider.ts`：`sendsDataOut` 依 preset metadata 而非寫死。

**驗收（自動）**：`privacyAdapter.test.ts` 擴充涵蓋非 opencode transport；consent gate 的 store 單元測試。
**驗收（人工，UAT）**：非 free 預設首次呼叫跳出的同意文案是否清楚——語意 UX 判斷，列入 UAT。

---

### M5 — MIT 換照 + 文件對齊

**修改**
- `LICENSE`：整份改為標準 MIT License 文字，Copyright 保留 Nathan Ba Che 2026。
- `README.md` / `DEV_README.md`：授權徽章與敘述文字從「Personal Use Only」改「MIT」；README 的 Provider 說明段落更新為新 Preset 集介紹。
- 新增 `dit.config.example.json` 的使用說明段落（README）。

**驗收**：純文件變更，我可直接自查（grep 確認無殘留 "Personal Use" 字樣、LICENSE 內容為合法 MIT 全文）。此項**不需要 UAT**（無 UX 判斷、無需人工肉眼）。

---

### M6 — Onboarding（明確排除本輪）

設計文件 §10 開放問題 3 明載「實作前必問使用者」——本輪不做，待你明確給出「純提示 / 三步精靈」的 UX 方向後另開卡。

---

## 里程碑執行順序與交付邊界

本 session 執行順序：M1 → M2 → M3 → M4 → M5，每個里程碑各自跑 `npm run typecheck && npm test` 作為完工閘門；M5 完成後跑一次 `npm run build` 全量驗證。

**degradation 宣告**：若時間/上下文預算不足以走完 M1-M5，**保底交付 M1（可切換預設 + 面板）+ M2（金鑰不外洩）**——這兩項是 INV-R8-2/3/6 的核心，其餘可留待下一輪，並在收尾時明確列出「已完成 / 未完成」。

## 收尾前置

Push 到 GitHub、建 release、打包完整檔案：**一律等你在下方 UAT 清單確認後才進行**，不自行操作。
