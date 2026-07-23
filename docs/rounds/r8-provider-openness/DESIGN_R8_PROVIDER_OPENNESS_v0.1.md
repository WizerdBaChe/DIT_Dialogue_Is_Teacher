# DIT — R8 設計文件｜講解 Provider 開放化（PIM 語意契約 v0.1）

> 日期：2026-07-24
> 定位：**PIM 級語意契約 + 選型定案**，不是 sole-source PSM。供下個實作 session 接手，
> 依此產出 work-card 級 PSM 後再施工。凡標「M0 待驗」者為經驗性未知，實作前必先實測，不得發明。
> 上游合約：[PSM_DIT_v1.0.md](../../PSM_DIT_v1.0.md)（Span Tree schema、ADR 制度、隱私閘道），本文件不推翻，只擴充講解層。
> 前身 as-built：Cloud 分析固定經本機 OpenCode 代理（ADR-019）——本文件將其**降級**為「本地代理」預設之一，見 §7 遷移。

---

## 1. CIM 回顧（為何做，用商業語言）

- **痛點**：DIT 要對所有人可用、且無痛體驗全功能。現行「雲端講解」寫死在冷門的 OpenCode CLI 上，
  一般使用者難以上手；地端只暴露少數預設模型。
- **邊界（NOT do）**：不自建後端、不代管金鑰、不做帳號系統；DIT 仍是**純瀏覽器、本地優先、單一使用者**的靜態工具。
- **首位真實使用者**：作者本人與拿到 release zip 的一般使用者（Windows/macOS/Linux，經本地 server 開啟）。

## 2. Phase 1 研究結論（決定設計空間的硬事實，2026-07-24 查證）

DIT 是**純瀏覽器、無後端**，雲端呼叫受 CORS 規範。實測各家瀏覽器直連能力：

| Provider | 瀏覽器直連 | 免費 | 處置 |
|---|---|---|---|
| OpenAI | ✗ CORS 擋 | 否 | 只能經本地代理 |
| Google Gemini（OpenAI 相容）| ✗ CORS 問題 | 有額度 | 只能經本地代理 |
| Groq / OpenRouter | ⚠ 未證實 | 有免費 | 預設當「需代理」，**M0 待驗**是否可直連 |
| Anthropic (Claude) | ✓ 需 `anthropic-dangerous-direct-browser-access: true` header | 否 | 唯一雲端零安裝直連；BYOK 安全 |
| 本地 Ollama / LM Studio / Jan | ✓ 使用者自開 CORS origins | 免費 | 本地預設 |

**推論**：「填 OpenAI 格式網址就直連」對多數雲端行不通。要涵蓋 OpenAI/Groq 這類，**必須保留一條本地代理路徑**。
「零安裝 + 免費」的雲端不存在（Anthropic 零安裝但付費；免費得靠本地或本地代理）——設計誠實呈現，不承諾魔法。

## 3. 語意契約（Glossary — 一詞一義，下游 code identifier 逐字沿用）

| 名詞 | 定義 |
|---|---|
| **Endpoint Provider** | 取代舊 `ollama`/`cloud` 的**單一可插拔 provider**，對任一 OpenAI 相容（或 Anthropic messages）端點發話。 |
| **Preset** | 一組具名端點設定 + metadata；UI 一切表現由 metadata 決定。出廠預設集見 §5。 |
| **Local Proxy** | 跑在 localhost、代 DIT 轉呼被 CORS 擋之雲端的伺服器（opencode / LiteLLM）。金鑰留在代理端。 |
| **BYOK** | Bring Your Own Key：使用者自帶 API 金鑰，直連可直連的雲端（Anthropic）或填入代理。 |
| **Config File** | `dit.config.json`，放 app 同層、執行期 `fetch` 讀取的本地設定檔（金鑰持久化）。git-ignored、不進 dist、不進匯出。 |
| **Privacy Envelope** | 既有去識別化封包（`sanitizedText`）；所有 `sendsDataOut` 預設一律經過。 |

### Preset metadata 契約（schema，權威定義待實作落於 `src/core/llm/presets.ts`）

```ts
interface ProviderPreset {
  id: string;                 // 穩定鍵，如 "ollama" | "lmstudio" | "anthropic-byok" | "local-proxy" | "custom"
  label: string;              // i18n 顯示名
  kind: "local" | "cloud" | "proxy";
  baseUrl: string;            // 預設端點；custom 由使用者填
  transport: "openai-chat" | "anthropic-messages";
  needsKey: boolean;          // true → UI 顯示金鑰欄 / 讀 Config File
  extraHeaders?: Record<string, string>; // 如 Anthropic 的 dangerous-direct header
  sendsDataOut: boolean;      // true → 強制走 Privacy Envelope + balanced/strict 政策
  cost: "free" | "metered" | "subscription"; // 非 free → 首次呼叫前跳一次消耗確認
  browserReach: "direct" | "needs-proxy";    // needs-proxy → 顯示代理引導
  modelsProbe: "ollama-tags" | "openai-models" | "static"; // 可用模型偵測策略
  setupHint?: string;         // i18n 安裝/開 CORS 指引鍵
}
```

## 4. 不變式（Invariants，任何實作必須成立）

- **INV-R8-1**：`sendsDataOut === true` 的每一次呼叫，一律先過 Privacy Envelope 與所選政策（balanced/strict）；
  `sendsDataOut === false`（本地）才送 raw span。政策選單對所有外傳預設可見。
- **INV-R8-2**：BYOK 金鑰**絕不**出現在匯出的 JSON／靜態 HTML 快照、`reportFallback`／診斷輸出、或任何 log。
- **INV-R8-3**：`dit.config.json` 列入 `.gitignore`、不進 `dist/`、不進 release 打包的 app bundle（僅附範本 `dit.config.example.json`）。
- **INV-R8-4**：`cost !== "free"` 的預設，於當前 scope 首次呼叫前必須取得一次明確使用者同意（消耗付費額度/訂閱確認）。
- **INV-R8-5**：CORS 被擋是**獨立狀態** `cors-blocked`，不得併入 `offline`；且給出該預設專屬的補救指引。
- **INV-R8-6**：UI 可視元件全由 preset metadata 推導——金鑰欄 iff `needsKey`；隱私責任說明 iff `sendsDataOut`；代理引導 iff `browserReach === "needs-proxy"`。
- **INV-R8-7**：任何 preset 不得在原始碼硬編任何金鑰。
- **INV-R8-8**：可用模型清單依 preset 的 `modelsProbe` 取得（本地 `/api/tags`、雲端 `GET /v1/models`、或靜態表）。

## 5. 出廠預設集（best-known 值；⚠ 標記者 M0 待驗）

| id | kind | baseUrl | transport | needsKey | sendsDataOut | cost | browserReach | modelsProbe |
|---|---|---|---|---|---|---|---|---|
| `ollama` | local | `http://localhost:11434/v1` | openai-chat | 否 | 否 | free | direct | ollama-tags |
| `lmstudio` | local | `http://localhost:1234/v1` | openai-chat | 否 | 否 | free | direct | openai-models |
| `jan` | local | `http://127.0.0.1:1337/v1` | openai-chat | 否 | 否 | free | direct | openai-models |
| `anthropic-byok` | cloud | `https://api.anthropic.com` | anthropic-messages | 是 | 是 | metered | direct（加 dangerous header）⚠ | static |
| `local-proxy` | proxy | `http://127.0.0.1:4096` | openai-chat | （代理端）| 是 | metered | direct（對 DIT 而言連 localhost）| openai-models |
| `custom` | cloud | （使用者填）| openai-chat | 依填 | 是 | metered | needs-proxy（保守預設）| openai-models |

- `local-proxy` 收納 opencode／LiteLLM／甚至以 LM Studio 當 gateway；涵蓋 OpenAI/Groq/OpenRouter 等被 CORS 擋者。
- ⚠ **M0 待驗**：(a) Anthropic 加 header 後瀏覽器是否確實直連成功；(b) OpenRouter/Groq 是否其實可直連（若可，各升為獨立 `direct` 預設，免代理）。

## 6. 狀態機（EndpointStatus，擴充自現行 Ollama/OpenCode 探測）

```
checking → ready            // 端點可達且指定模型存在
        → offline           // 連不上（未啟動/逾時）
        → cors-blocked      // 連得到但被瀏覽器 CORS 擋（INV-R8-5）
        → auth-missing      // needsKey 但未提供金鑰
        → model-missing     // 已連線，指定模型未安裝/不可用
        → no-model          // 已連線，完全無可用模型
        → proxy-missing     // proxy 類但 localhost 代理未起
```
每個非 ready 態對應一則 metadata 驅動的補救指引（安裝指令 / 開 CORS / 填金鑰 / 換模型 / 起代理）。

## 7. 金鑰與 Config File 設計（三層，安全與方便並存）

release 經本地 HTTP server 伺服（`scripts/start-dit.ps1`），故執行期 `fetch('./dit.config.json')` 可行。

1. **Config File（持久，推薦常用者）**：使用者編輯 `dit.config.json`（同層），app 開啟時讀取帶入。範例：
   ```json
   { "activePreset": "anthropic-byok",
     "keys": { "anthropic-byok": "sk-ant-...", "local-proxy": "..." },
     "custom": { "baseUrl": "", "model": "" } }
   ```
2. **當次貼上（記憶體，預設 fallback）**：無設定檔時於面板貼，關頁即失。
3. **localStorage**：**不設為預設**（同機他人 DevTools 可讀）；可留「記住金鑰」開關給自願承擔者。

**降級**：若使用者以 `file://` 直開（非正常路徑），fetch 設定檔會被 CORS 擋 → 自動降為第 2 層並提示改用 server 啟動。

## 8. 選型定案（ADR，2026-07-24 使用者拍板；沿用 PSM §4 ADR 制度，續編）

| ADR | 決策 | 理由 |
|---|---|---|
| **026** | Provider 架構合併為單一 **Endpoint Provider + Preset 集**，取代 `none/ollama/cloud` 三選一 | 使用者要「自己挑、走 OpenAI 格式」；低耦合、可插拔（PSM Phase 2 準則） |
| **027** | **保留本地代理預設**（opencode 降級為其一，加 LiteLLM）涵蓋被 CORS 擋的雲端 | OpenAI/Groq 無法瀏覽器直連，代理是唯一通路（§2） |
| **028** | 授權改 **MIT**（慈善開源） | no-redistribution 擋不住點子外流、對個人不可執行、且打臉「人人可用」；donate 與作者自行商業化 MIT 皆允許，護城河在執行力非授權 |
| **029** | 金鑰以執行期 **`dit.config.json`** 持久化 + 記憶體 fallback；預設不落 localStorage | 兼顧安全與方便；金鑰不進 UI/匯出/log（INV-R8-2/3） |
| **030** | 所有 `sendsDataOut` 預設一律過 Privacy Envelope | 開放任意雲端後，去識別化不能只綁 opencode（INV-R8-1） |

**pending（M0 實作 session 需驗證後拍板）**：Anthropic 瀏覽器直連可行性、OpenRouter/Groq 是否免代理、`ProviderId` 型別是否更名（`cloud` 已誤導）。

## 9. 資安內建（Security by design）

- **資產**：使用者 API 金鑰、被講解的私有 code/log。**入口**：Config File、面板輸入欄、各端點回應。**最糟濫用**：金鑰外洩、私有碼隨匯出外流。
- 對策已編碼於 INV-R8-2/3/7 與 §7；Privacy Envelope（INV-R8-1）處理 code 外傳去識別化。
- **依賴納管**：新增 LiteLLM 僅為「使用者可選的外部代理」，不進 DIT 依賴樹；DIT 端不新增 npm 套件即可完成（純 fetch）。

## 10. 開放問題（下個 session 開場先解）

1. M0 三項經驗性驗證（§5 ⚠）。
2. `ProviderId` 更名與型別遷移範圍（牽動 store/spanTree/測試）——ADR-030+ 決。
3. 首次啟動引導（onboarding）要做到多完整：純提示 vs 三步精靈。UX 語意，**實作前必問使用者**。
4. Ollama 推薦庫補強程度（附大小/VRAM 提示）——低優先，非重做。

## 11. 里程碑提案（非 sole-source，供實作 session 轉 PSM）

- **M0**：§5 三項 CORS 直連實測 + 定 ADR pending 項。
- **M1**：Endpoint Provider + Preset registry + metadata 驅動面板（合併 Ollama/Cloud 兩面板）。
- **M2**：Config File 讀取 + 三層金鑰 + INV-R8-2/3 匯出/log 洩漏稽核。
- **M3**：狀態機補 `cors-blocked`/`auth-missing`/`proxy-missing` + 各補救指引。
- **M4**：cost 首呼同意（INV-R8-4）+ Privacy Envelope 套用全外傳預設（INV-R8-1）。
- **M5**：LICENSE 換 MIT + README/DEV_README 對齊 + `dit.config.example.json`。
- **M6**：onboarding（前置 UX 語意問答後才做）。

## 12. 接手驗收清單（M1 手動驗收，非作者可盲測）

1. 設定對話框 provider 下拉出現預設集（Ollama/LM Studio/Jan/Anthropic/本地代理/自訂）→ 選任一，面板欄位隨 metadata 變（本地無金鑰欄；Anthropic 出金鑰欄 + 隱私說明）。
2. 選 Ollama、未開 CORS → 狀態顯示可辨識指引（非泛用 offline）。
3. 選 Anthropic、未填金鑰 → 狀態 `auth-missing`、出填金鑰引導；填錯 → 可讀錯誤非白屏。
4. 匯出一份 JSON 與靜態 HTML → 全文檢索確認**無任何金鑰字串**。
5. 切到自訂、填一個會被 CORS 擋的雲端 URL → 狀態顯示 `cors-blocked` 並指向本地代理，而非誤報 offline。
