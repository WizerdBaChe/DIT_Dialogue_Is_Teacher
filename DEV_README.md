# DIT — 開發者文件 (DEV_README)

> 給接續開發 / 維護這個專案的人看。使用者導向的說明請見 [README.md](README.md)。
> 這份文件描述「現在程式長什麼樣子、為什麼長這樣、接下來該做什麼」，會隨開發進度更新。

---

## 0. 文件地圖

| 文件 | 用途 |
|---|---|
| [`docs/README.md`](docs/README.md) | `docs/` 目錄索引——每輪設計/驗收文件按 `docs/rounds/rN-主題/` 分類，新增一輪時先看這份決定放哪裡 |
| `docs/RPD_DIT_v0.1.md` | 最初的需求與決策文件（D-1～D-5），改動核心方向前先回去看這份 |
| `docs/architecture.md` | 架構與資料流的權威說明（本文件的架構章節是它的精簡版） |
| `docs/PROGRESS.md` | 逐里程碑的開發紀錄，新進度往上加 |
| `docs/BACKLOG.md` | 已決定但還沒做的事項，待辦來源 |
| `docs/ACCEPTANCE.md` | 實機驗收清單，改完功能對照這份手測 |
| `docs/misc/REVIEW_2026-06-25.md` | 系統工程自我檢查（後端/前端 checklist），下次大改動建議重跑一輪 |
| **本文件** | 開發者的單一入口：環境、架構、慣例、目前進度、下一步 |

---

## 1. 開發環境

```bash
npm install
npm run dev        # http://localhost:5173，首次自動載入內建範例
npm run typecheck  # tsc --noEmit
npm run build       # tsc + vite build（CI / 上版前必跑）
npm run preview     # 預覽 build 產物
```

技術棧：**Vite + React 18 + TypeScript + Zustand**。純前端、零後端，所有解析在瀏覽器內完成。唯一外部依賴是可選的本機 Ollama（`http://localhost:11434`）。

開發期除錯：`loadFromText` 會把處理結果掛到 `window.__DIT = { doc, viewItems }`（僅 `import.meta.env.DEV`，production build 不含），改 pipeline 時可以直接在 console 戳資料。

---

## 2. 架構：資料怎麼流

整條管線單向、可追蹤，單一入口是 `buildSessionDocument()`（`src/core/pipeline.ts`）：

```
原始 .jsonl 文字
  │  SourceAdapter.parse()              src/core/adapters/*
  ▼
RawEvent[] + meta + warnings            來源無關的中介事件
  │  normalize()                        src/core/normalize/normalizer.ts
  ▼
SessionDocument (Span Tree)             節點 + 巢狀關係，每個 span 保留 raw 原始事件
  │  denoise()                          src/core/denoise/denoiser.ts
  ▼
+ tags + groups                         milestone/error/retry/decision、edit-loop 群組
  │  distill()                          src/core/distill/distiller.ts
  ▼
+ skeleton (DistilledSkeleton)          spine/rib 分類，view-agnostic，給魚骨視圖用
  │  validateSessionDocument()          src/core/validate/spanTreeSchema.ts
  ▼
warnings（自檢問題併入回報）
  │  buildViewModel()                   src/core/view/viewModel.ts
  ▼
ViewItem[]                              可渲染卡片清單；tool_result 巢狀、群組折疊
  │
  ▼
Zustand store (src/store/sessionStore.ts) → React 元件樹 (src/components/*)
```

任一步驟的非致命問題都收進 `warnings`，UI 以提示橫幅呈現——**新增任何解析/正規化邏輯時，遇到非預期輸入請 push 進 warnings 而不是 throw**，throw 只留給真正無法繼續的情況（`PipelineError`）。

### 模組與職責（低耦合）

| 層 | 路徑 | 職責 | 可以依賴 |
|---|---|---|---|
| 契約 | `src/types/spanTree.ts` | Span Tree canonical schema | 無 |
| 來源 | `src/core/adapters/` | 各來源 → `RawEvent[]`（介面 + 註冊表 + CC 解析器） | 契約 |
| 正規化 | `src/core/normalize/` | `RawEvent[]` → Span Tree | 契約、adapter 型別 |
| 降噪 | `src/core/denoise/` | 確定性標籤與分組 | 契約 |
| 蒸餾 | `src/core/distill/` | spine/rib 分類 → DistilledSkeleton | 契約 |
| 自檢 | `src/core/validate/` | invariant 檢查 | 契約 |
| 講解 | `src/core/llm/` | `LLMProvider` 介面 + none/ollama/cloud | 契約 |
| 編排 | `src/core/pipeline.ts` | 組合上述為單一入口 | 上述各核心模組 |
| 視圖模型 | `src/core/view/` | Span Tree → 可渲染清單 / 魚骨站點 | 契約 |
| 狀態 | `src/store/` | Zustand：載入/Provider/重播/講解 | pipeline、view、llm |
| UI | `src/components/` | 純呈現，只與 store 互動 | store、契約 |

**鐵律**：UI 不認得 pipeline / provider 細節；下游模組不認得任何特定來源格式。違反這條代表耦合正在洩漏，回頭看是不是該加一層介面。

### 擴充點

- **新增來源**：實作 `SourceAdapter`（`parse(raw): RawEvent[]`），在 `src/core/adapters/index.ts` 註冊。其餘層不動。
- **新增講解 Provider**：實作 `LLMProvider`（`annotate(span, ctx): Promise<Annotation>`），在 `src/core/llm/index.ts` 的 `getProvider` 註冊。`sendsDataOut` 旗標要設對，它驅動 UI 的隱私責任說明。
- **新增降噪規則**：在 `denoiser.ts` 內加純函式規則，輸出 `tags`/`groups`，不要直接改 UI 渲染邏輯。
- **多 session（D-5，已預留未實作）**：型別層已有 `SessionLibrary` 預留；store 目前只持單一 `doc`，未來要改持陣列時，型別契約不需要動。

### 內部介面（核心契約，改動前三思）

```ts
interface SourceAdapter { id: string; parse(raw: string): RawEvent[]; }

interface LLMProvider {
  id: "none" | "ollama" | "cloud";
  sendsDataOut: boolean;
  annotate(span: Span, ctx: AnnotateContext): Promise<Annotation>;
}
```

Span Tree schema 草案在 `docs/RPD_DIT_v0.1.md` 附錄，實際型別定義以 `src/types/spanTree.ts` 為準（兩者不一致時，程式碼贏，但記得回去更新文件）。

---

## 3. 確定性降噪規則（`src/core/denoise/denoiser.ts`）

這是目前產品「不靠 LLM 也有用」的核心，改動時務必對照 `docs/ACCEPTANCE.md` §3 手測：

1. **milestone**：使用者訊息 = 任務分界；最後一個成功結果（標到父操作卡片）= 完成。
2. **error**：錯誤結果標 `error`，並上拋到父 `tool_use` 卡片以徽章呈現，整張卡邊框轉紅（`.error` class）。
3. **retry**：錯誤後再次呼叫「同一工具」標 `retry`。
4. **decision**：**只看思考層**（不含一般回覆文字）出現決策語彙（決定/改用/instead…）才標 `decision`——這條曾經因為「回覆文字也算」而過度觸發，修正紀錄見 `docs/PROGRESS.md` M1「過程中的修正」。
5. **edit-loop 群組**：對同一檔案連續多次編輯折疊成一個群組；thinking/回覆/結果視為透明，**只有不同工具或新使用者訊息才打斷**群組（同樣是修過的行為，別退回成「任何文字都打斷」）。

加新規則時優先寫純函式 + 對照樣本 session 跑一次，目前還沒有自動化測試保護這層，**手測容易漏掉前面這些已修正過的邊界情況**。

---

## 4. LLM 講解層（`src/core/llm/`）

- 抽象介面 `LLMProvider.annotate(span, ctx)`，逐節點切 chunk（`prompt.ts` 組裝「前一步摘要 + 當前節點」的最小必要上下文，刻意不塞整個 session 進去，給小模型用）。
- 三個實作：`none`（預設、零外傳）／`ollama`（真實 fetch `http://localhost:11434`）／`cloud`（**目前是樁，`annotate` 還沒有真的打出去**）。
- `sendsDataOut` 驅動 Header/Disclaimer 的責任說明文案，新增 provider 時這個欄位設錯會直接誤導使用者，務必檢查。
- `annotateAll`（`sessionStore.ts`）刻意**循序**處理而非並發，這是為了對本地小模型友善、避免一次壓垮 Ollama；不要為了「速度」改成 `Promise.all`，除非先確認本機顯卡/模型能扛。

### Ollama 配接細節（容易踩雷的地方）

- 連線狀態靠 `checkOllama()` 探 `/api/tags`，狀態機是 `offline / no-model / model-missing / ready`，對應 `OllamaPanel.tsx` 的引導文案。改狀態機要同步改面板文案，否則會回到「使用者卡在 404 看不懂」的舊痛點（見 `docs/PROGRESS.md` M3 第一輪回饋）。
- 預設 timeout 60s（可調 30/60/120s）——曾經 30s 對大模型冷載入太緊，別輕易調回。
- `keepAlive`（預設 10m）/ `numPredict`（預設 512）是緩解「連續講解每次都冷載入 VRAM」的調參，改預設值前先想清楚對中小顯卡使用者的影響。
- `think: false` 只對 qwen3/r1/gpt-oss 等支援 thinking 的模型有意義，**預設關閉**，因為 gemma 等模型送這個參數會直接報錯——別把它改成預設開啟。

### Cloud Provider（尚未實作，下一個要接的東西）

- UI 骨架已完成：`CloudPanel.tsx` + `store.cloudConfig`（`baseUrl` / `model` / `apiKey`，目前 key 只存在記憶體）。
- 待做：`cloudProvider.annotate` 接 OpenAI 相容的 `/chat/completions`（規劃對象例如 Mistral 免費 API；2026-06-26 已拍板「先只做 UI 骨架」，所以目前卡在這裡是預期狀態，不是漏做）。
- 接的時候記得：(a) API key 的儲存方式要重新評估，目前的「只存記憶體」是因為還沒真的送出去；(b) 雲端階段要補斷路器/重試策略（見 §6 已知缺口）。

---

## 5. 視圖層

兩個檢視模式吃同一份 `SessionDocument`，差別只在解析度：

- **認知模式（預設）**：`src/core/view/fishbone.ts` 把 `doc.skeleton`（distill 階段產生）轉成主線站點 + 支線，`FishboneView.tsx` 渲染。Drill-down 點擊會重用 `SpanCard`/`GroupCard` 顯示完整內容——**不要為魚骨另外做一套卡片**，那會造成兩份內容容易不同步。
- **高密度模式**：`MainView.tsx` 走逐步卡片時間軸，是 M1 最早做出來、目前最穩定的視圖。

蒸餾規則（spine/rib 怎麼分類）在 `src/core/distill/distiller.ts`，標記為 **preset v1，格式待定稿**（見 `docs/BACKLOG.md`）——目前的分類規則是合理預設，不是最終定案，調整魚骨呈現邏輯時優先看這裡而不是去改 view 層硬塞規則。

---

## 6. 已知限制 / 技術債

> 這份清單跟 `docs/BACKLOG.md` 同步，但這裡按「對開發影響大小」排序，方便接手的人判斷優先序。

| 項目 | 現況 | 影響 |
|---|---|---|
| **無自動化測試** | pipeline（adapter→denoise→distill）目前全靠手測對照 `ACCEPTANCE.md` | 改降噪規則風險最高的一塊；建議下一步先補 pipeline 快照測試 |
| **Cloud Provider 為樁** | UI 已就緒，`annotate` 未串接 | 講解層目前只有本地 Ollama 真的能用 |
| **subagent 跨檔未串接** | 目前只處理單檔內的 `isSidechain`，`subagents/*.jsonl` 未讀取 | 多 agent 任務的完整軌跡會缺一塊 |
| **全局摘要未做** | 降噪目前是逐條規則，沒有跨節點濃縮 | 超長 session 的「大局觀」仍要靠使用者自己拼 |
| **無響應式/行動裝置版面** | 桌面優先，RPD 範圍內的刻意取捨 | 不算 bug，但別誤判成要修 |
| **大檔無虛擬化** | >8MB 僅有軟警告，無硬截斷、無分頁載入 | 超大 session 效能未知 |
| **npm audit（dev-only）** | esbuild/vite 中度漏洞，僅影響本機 dev server，不影響 production 產物 | 根治需升 vite@8（破壞性），暫不升 |
| **單節點講解無逐字進度** | 進度條目前是「節點層級」(done/total)，非單節點內 token 速率 | 要做需改 Ollama streaming，已記 backlog |

詳細的系統工程自我檢查（含已修掉的 3 個韌性缺口：Ollama 逾時、檔案讀取錯誤、輸入過大警告）見 `docs/misc/REVIEW_2026-06-25.md`。

---

## 7. 接續開發：建議順序

依 `docs/BACKLOG.md` 與 RPD 優先序整理，**不是硬性規定，但反映目前的風險/報酬判斷**：

1. **pipeline 單元測試**（adapter→denoise→distill 快照）——目前風險最高的無保護區，越晚補成本越高。
2. **Cloud Provider 真實串接**——UI 骨架早就好了，是目前「講解層」唯一卡住的缺口。
3. **魚骨蒸餾規則 preset v1 → v2 定稿**——等實際用過幾個真實 session 後，回頭調整 spine/rib 分類粒度。
4. **大檔虛擬化 / 漸進載入**——等真的遇到效能問題（或想支援長任務）再做，目前是已知但非急迫。
5. **subagent 跨檔串接**——等有明確的多 agent 使用情境再做。
6. **行動裝置版面**——按 RPD 範圍，目前刻意延後，非當前優先。

每完成一個項目：更新 `docs/PROGRESS.md`（加一個新的里程碑區塊，格式照既有的寫）、對照 `docs/ACCEPTANCE.md` 補對應驗收項、視情況更新本文件的 §6 已知限制表。

---

## 8. 開發時的行為準則（從 RPD 繼承，照著做）

- **可擴充**：來源 adapter、LLM Provider、視圖、降噪規則皆為可插拔模組，新增不動核心。
- **低耦合**：以明確介面隔離各層；資料以 Span Tree 契約傳遞，模組間不直接相依實作。
- **可自檢**：解析/正規化要有 schema 驗證與容錯（未知型別不崩、損壞行跳過並記錄到 warnings）。
- **可維護**：TypeScript 強型別、模組單一職責、關鍵決策就近註解（不要只寫在文件裡，程式碼裡也要留一句）。
- **資料流可追蹤**：每個 Span 保留 `raw` 原始事件可回溯；Provider 標註來源；確保「畫面元素來自哪一條原始事件」全程可定位。

改動架構性的東西（新增一層、改契約、換掉某個核心模組）之前，先回去看 `docs/RPD_DIT_v0.1.md` 的決策鎖定（D-1～D-5）有沒有衝突；如果要推翻某個決策，在 RPD 補一筆新的版本紀錄，不要默默改掉。

---

## 9. 打包與發布

DIT 沒有後端、沒有安裝檔、沒有 CI/CD；repo 已設定 git remote（GitHub，見 README 或 `git remote -v`），但「發布」實務上仍是「產出 `dist/`，打包成 zip 交給 GitHub Release 或某個地方托管」，不依賴任何 CI。

### 9.1 建置

```bash
npm run build
```

實際依序跑 `tsc && vite build && vite build --config vite.snapshot.config.ts`，任一步失敗就會非零結束，適合當 release 前的最後關卡。產出 `dist/`（`.gitignore` 排除，不進版控）：

| 檔案 | 用途 | 能不能單獨拿走 |
|---|---|---|
| `dist/index.html` + `dist/assets/*` + `dist/session.worker-*.js` | DIT 本體（App 模式），`<script type="module">` + Worker | **不能單獨拿 index.html**：ES module script 在 `file://`（null origin）會被瀏覽器擋掉，必須整個 `dist/` 目錄一起、透過 HTTP(S) 來源提供服務，見 9.3 |
| `dist/snapshot.html` | 匯出功能的**範本**（`ExportControls.tsx` 執行期用 `fetch("./snapshot.html")` 抓它，注入使用者當下的 session 資料後供下載）；本身也是 EX-03 build target，是 IIFE、非 module，`file://` 雙擊可直接開 | 必須跟 `dist/index.html` 放在**同一個目錄、同一個相對路徑**下，拿掉它會讓應用內「匯出 HTML」按鈕失敗（`t.export.templateMissing`） |

`npm run build` 用 `emptyOutDir: false` 讓第二個 `vite build`（snapshot target）不清掉第一個的產物——**兩個 build 缺一不可，不能只跑其中一個當作完整發布**。

### 9.2 給一般使用者：雙擊即用的發布包

`dist/index.html` 是 ES module，`file://` 開不了（見上表），單獨丟一包 `dist/` 給不懂技術的使用者等於「打不開」。解法是打包時額外塞三個檔案，讓使用者不需要自己架 server：

- `scripts/start-dit.bat` — 使用者雙擊的入口，開一個主控台視窗、呼叫下面的 ps1、在伺服器起來後自動開瀏覽器。
- `scripts/start-dit.ps1` — 純 `System.Net.HttpListener` 寫的本機靜態檔案伺服器，**沒有任何外部依賴**（不需要 Node/Python），只綁定 `127.0.0.1`（不需要系統管理員權限、不會被防火牆規則擋、不會對外網開放）；埠號預設 `4787`，被佔用會自動往上找空的。
- `scripts/START-HERE.txt` — 給終端使用者看的中英文說明（含「為什麼不能直接雙擊 index.html」與 macOS/Linux 的替代做法）。

一鍵重新產生發布包（會自動跑 build + test，任一步失敗就中止，不會打包出壞的 release）：

```bash
scripts\package-release.bat
```

流程：讀 `package.json` 的 `version` → `npm run build` → `npm run test` → 把 `dist/*` 複製進暫存資料夾，連同上面三個啟動腳本、以及 `LICENSE`（複製一份成 `LICENSE.txt`）→ 用 PowerShell 的 `Compress-Archive` 壓成 `releases/dit-dialogue-is-teacher-v<version>.zip`（`releases/` 已在 `.gitignore`，不進版控，只上傳成 GitHub Release 附件）→ 清掉暫存資料夾。

這個腳本改一次、以後每個版本都能重跑；改動啟動邏輯只需要動 `start-dit.ps1`，`package-release.bat` 不用跟著改。

### 9.3 部署 App 模式（給別人長期用）

`dist/` 是純靜態檔案，任何靜態檔案託管都能用，沒有例外情況：

```bash
# 本機驗證（發布前一定要跑一次，看到的就是使用者會看到的）
npm run preview -- --host 127.0.0.1 --port 4173

# 或最簡單的靜態伺服器（不需要 npm 環境的機器上也能跑）
npx serve dist
```

正式託管任選其一（皆為純靜態 host，不需要任何 server-side 邏輯）：GitHub Pages、Netlify、Vercel（static）、Cloudflare Pages、或自己的 nginx/Caddy 指到 `dist/` 目錄。**不要**把 `dist/index.html` 從資料夾裡抽出來單獨丟到某處——會漏掉 `assets/`、worker、以及 `snapshot.html` 範本。

### 9.4 分享單一 session（不必部署，給看的人用）

使用者在介面內按「匯出 → HTML」，下載的就是一個帶著資料、可雙擊開啟的獨立檔案（`snapshotMode`，載入/重置/匯出等控制項會自動隱藏）——**這是給終端使用者的功能，不是給你發版用的**，兩者不要混淆：你發布的是「能載入任意 session 的 DIT 本體」；使用者匯出的是「已經處理好、內容固定的一份快照」。

### 9.5 版本號

`package.json` 目前是 `"private": true`，不會被發佈到 npm registry，`version` 欄位純粹是給人看的里程碑標記，也是 `scripts/package-release.bat` 決定 zip 檔名與 `gh release` tag 的依據。沒有 CI 依賴這個號碼，所以要不要 bump、bump 到多少，純看你想不想在 `git log`/`git tag`/GitHub Release 上留一個對應的標記；建議語意：新來源/新講解模式等使用者能感知的功能 → bump minor（`0.x.0`）；發布包裝方式改變（例如新增雙擊啟動器）、純內部重構/文件 → bump patch（`0.0.x`）或不用動，視你想不想在 Release 頁上區分。

### 9.6 跨平台的複製指令（`src/core/runtime/webRuntimeController.ts`）

Ollama／OpenCode 面板顯示的一鍵複製指令已依作業系統分流：`detectRuntimeOS()` 讀 `navigator.platform`／`navigator.userAgent` 判斷 Windows 與否（無 `navigator` 的環境，如測試，預設 posix），`getRuntimeStartCommand(service, os?)` 依判斷結果回傳 PowerShell（`$env:OLLAMA_ORIGINS="*"; ollama serve`、`opencode.cmd serve ...`）或 posix shell（`OLLAMA_ORIGINS="*" ollama serve`、`opencode serve ...`，無 `.cmd`）版本；`WebRuntimeController.startCommand()` 與兩個面板元件都改呼叫這個函式，不再各自 import 一份寫死的常數。

新增服務或改指令內容時，只需要動 `WEB_RUNTIME_START_COMMANDS_BY_OS` 這個矩陣；OS 判斷邏輯與指令內容已分離，不會再重演「單一常數只有一種 OS 語法」的問題。
