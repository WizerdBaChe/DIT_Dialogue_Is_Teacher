# DIT R5 引導式工作台與 Session 地圖 — 唯一施工合約 v1.0

日期：2026-07-19

狀態：**UX 決策已批准；可依施工卡實作；產品程式尚未依本合約修改**

唯一性：本文件是 R5 剩餘 UI 修正的唯一規範性施工依據。實作者只需讀本文件、目前程式碼與票據，不得從被取代文件拼接需求。

取代：`PSM_R5_VISUAL_WORKSPACE_REMEDIATION_v0.1.md`、`PSM_R5_GUIDED_WORKSPACE_REMEDIATION_v0.2.md`、`CONCEPT_R5_GAMEFUL_NAVIGATION_v0.1.md` 的所有規範性內容。三份舊文件只保留設計來源與決策歷史。

不取代：已落地的串流匯入、Worker 取消、清單虛擬化、Privacy Gateway、講解快取與 R4 parent linkage；本文件將其回歸條件完整重述於 §11。

## 0. 使用這份合約的方法

1. 施工順序固定為 GN-01 → GN-10；每張卡是一個可展示、可測試、可單獨提交的垂直切片。
2. 每張卡開始前只讀本文件對應卡、其 Objects 與直接相依程式碼；不得回頭從舊 UX 文件挑選不同互動。
3. 每張卡完成後先跑該卡 Acceptance，再提交該卡指定 Commit；測試失敗不得進下一卡。
4. 規格未涵蓋但會改變預設、點擊、鍵盤、焦點、資料語意或視覺層級時，停止施工並新增決策；不得自行補一個「合理」行為。
5. 技術性且可逆、又不改變本文件語意的細節由實作者決定；在交付說明記錄理由，不另開 UX 討論。
6. 回退以卡片 commit 的反向順序進行；不得回退已通過且與本 UX 無關的 R5 streaming／virtualization。

語意驗證狀態：本輪已完成來源對照、追溯矩陣、語意落差與全文自洽檢查。因目前協作規則不允許自行派出另一位作者外驗證者，尚無「作者以外」的獨立審查證據；使用者審閱本合約是實作前最後語意閘門。此限制不應被誤寫成已獨立驗證。

## 1. 第一性原理與範圍（CIM）

### 1.1 不可約痛點

使用者進入長 Session 後，不應再自行猜測「這是什麼、先做什麼、目前在哪裡、全局怎麼走」；DIT 必須同時提供起點、局部位置、全局形狀與可靠跳轉，讓注意力留在學習內容。

### 1.2 第一個真實使用者與不做的代價

第一個使用者是完成 AI coding agent 任務後，回頭複盤自己 Session 的開發者／學習者。如果不修正，DIT 即使完成降噪與效能改善，仍只是一份較乾淨但缺乏方向的長紀錄，沒有兌現「從實作中學會怎麼做」。

### 1.3 業務規則

- **BR-1 起點**：首次進入與每次 Session 替換後，先交代用途、Session 概況與正確順序，不直接傾倒內容。
- **BR-2 方位**：能容納雙欄時，結構導航必須持續在左側，顯示目前位置並支援精確跳轉。
- **BR-3 全局**：使用者能隨時從 Reader 看見 Session 的微縮形狀，並開啟大型地圖探索重要地標與分岔。
- **BR-4 內容優先**：Reader 是唯一完整節點詳情；導航、地圖與子代理摘要不得複製整份詳情。
- **BR-5 選配後置**：講解、Provider 與設定不阻擋基本複盤，平時不占主要內容。
- **BR-6 大量資料**：50 MiB／數萬項目仍保持有界渲染、可取消載入與可見錯誤。
- **BR-7 誠實語意**：目前只有位置索引，不得稱為「學習完成度」。
- **BR-8 本機邊界**：導航與地圖不得新增外傳、祕密處理或持久化路徑。

### 1.4 必要核心

`總覽起點 + 左側結構 + Reader + 子代理摘要 + Reader 小地圖 + 大型 Session 地圖 + 既有設定匣`

### 1.5 明確不做

- 不新增 XP、徽章、連續登入、排行榜、假完成度或戰爭迷霧。
- 不新增書籤、筆記、跨 Session 學習進度、地圖 waypoint 保存或自訂快捷鍵編輯器。
- 不新增 Activity Bar、第二側欄、可拖曳浮動窗、任意版面配置或遊戲 HUD 美術。
- 不導入 React Flow、D3、`react-zoom-pan-pinch`、tour／coach-mark 或新的 UI 套件。
- 不把子代理完整內容、節點參數／結果或所有 ribs 放進微縮圖。
- 不改資料管線、Span Tree、DistilledSkeleton、講解 Provider、Privacy Gateway 或快取 fingerprint。

## 2. 已批准的產品方向

正確使用順序：

`載入／內建範例 → 總覽 → 沿左側結構閱讀或重播 → 展開 why → 視需要開 Session 地圖或子代理 → 回 Reader`

角色分工：

| 介面物件 | 唯一職責 | 不得承擔 |
|---|---|---|
| 總覽 | 說明用途、Session 摘要、三步流程與開始 CTA | 長卡片閱讀、設定全集 |
| 結構側欄 | 目前位置、文字層級、重要節點、精確跳轉、GN-09 精簡圖例 | 全部 metadata、完整內容 |
| Reader | 完整節點、群組、why、結果與重播定位 | 全局地圖或重複子代理摘要 |
| 子代理視角 | 分支摘要與入口 | 完整分支詳情 |
| 微縮導航 | 全局輪廓、地標、目前位置、開啟地圖 | 密集精確點擊、文字詳情 |
| Session 地圖 | 語意縮放、地標探索、選取摘要與跳轉 | 長期取代左側文字導航 |
| 設定匣 | Session 載入、講解、Provider、語言與導航偏好 | 阻擋性錯誤與 Privacy Review |

## 3. 平台無關語意（PIM）

### 3.1 詞彙

- **主要視角（Primary View）**：中央內容的三種互斥狀態：總覽、Reader、子代理。
- **總覽（Overview）**：每個 Session 的導向頁，也是永久可重返的使用指南。
- **Session 來源（Session Origin）**：目前文件由內建範例或使用者輸入而來；只影響總覽文案，不改資料內容。
- **結構側欄（Structure Sidebar）**：目前 Session 的虛擬化文字導航。
- **目前位置（Current Position）**：`activeId／playingId` 對應的 `ViewItem` 索引與總數；不代表完成或理解。
- **微縮導航（Minimap）**：Reader 右下的非文字全局輪廓與目前位置入口。
- **Session 地圖（Session Map）**：覆蓋主要工作區的大型魚骨導航介面。
- **地圖地標（Map Landmark）**：可對應到一個真實 `ViewItem.id` 的主線、決策、結果、錯誤或子代理入口。
- **地圖叢集（Map Cluster）**：為了有界顯示而聚合的連續節點集合；不是可直接閱讀或跳轉的真實節點。
- **語意縮放（Semantic Zoom）**：依全局、區段、細節層級改變資訊種類，而非只把同一張圖放大。

### 3.2 不變條件

- **INV-1**：`PrimaryView` 只允許 `overview | reader | subagents`；Structure 與 Session Map 不得重新成為 tab。
- **INV-2**：App 啟動內建範例、使用者載入成功、重設範例後，主要視角皆為 Overview。
- **INV-3**：Overview、Structure、Session Map 或子代理的手動導航都先停止重播；只有播放計時器能在 `playing` 中自行前進。
- **INV-4**：上一項、下一項、重播與任何真實節點跳轉都切回 Reader，並同步 `activeId／playingId`。
- **INV-5**：寬度 ≥720 px 時 Structure Sidebar 預設開啟，可收合；寬度 <720 px 時改為左側 modal drawer，主內容保持全寬。
- **INV-6**：側欄只顯示 Session 短標題、目前位置、收合控制、虛擬樹，以及 GN-09 使用單一 DOM 文字列恢復的精簡圖例；完整 metadata 與說明型圖例仍留在 Overview。
- **INV-7**：Minimap 只在 Reader 且寬度 ≥720 px、功能啟用時顯示；其他視角、窄螢幕或停用時顯示同位置的可見「地圖」按鈕。
- **INV-8**：Minimap 整體是一個開圖控制，不提供密集小點跳轉；精確跳轉在 Session Map 或 Structure 完成。
- **INV-9**：Session Map 開啟時以目前位置為焦點；真實地標才可跳轉，Map Cluster 只能改變焦點／縮放層級。
- **INV-10**：Session Map 跳轉後必須關閉地圖、停止重播、進 Reader、定位並聚焦同一 `ViewItem.id`。
- **INV-11**：單鍵 `M` 不是獨占入口；可停用，在可編輯欄位、事件已處理、含修飾鍵、無文件或其他阻擋性 modal 開啟時不得觸發。
- **INV-12**：Structure drawer 與 Session Map 使用 modal 語意；開啟後焦點進入、Tab 不離開、Escape 關閉、關閉後焦點回到觸發位置或跳轉後 Reader 目標。
- **INV-13**：Map Cluster 必須持有來源 ID 集合與數量，UI 明示為聚合，不得偽裝成單一代理步驟。
- **INV-14**：Sidebar、Reader、子代理與地圖細節清單都保持有界掛載；地圖關閉時不得保留不可見的大量 SVG／清單 DOM。
- **INV-15**：設定匣、語言、Provider、講解、載入／取消、Privacy Review 與快取語意維持現況。
- **INV-16**：UI 文案只使用「位置」；除非日後另立契約實作持久化學習狀態，禁止出現「完成進度」。
- **INV-17**：地圖與結構只渲染 React 文字節點／SVG 屬性；不得使用 `dangerouslySetInnerHTML` 呈現 Session 輸入。
- **INV-18**：載入失敗或取消不得替換上一份有效文件；失敗必須可見。

### 3.3 主要視角狀態機

`PrimaryView = overview | reader | subagents`

| 事件 | 新視角 | 位置 | 播放 | 覆蓋層 |
|---|---|---|---|---|
| 內建範例初載完成 | overview | 第一個可讀項目 | idle | 全關 |
| 使用者 Session 載入完成 | overview | 第一個可讀項目 | idle | 全關 |
| 重設範例 | overview | 第一個可讀項目 | idle | 全關 |
| 開始／繼續閱讀 | reader | 保留 | paused | 全關 |
| 點 Overview tab | overview | 保留 | paused | map 關閉 |
| 點 Subagents tab | subagents | 保留 | paused | map 關閉 |
| Structure／Subagent 真實項目 | reader | 改為目標 | paused | drawer／map 關閉 |
| 上一項／下一項 | reader | 前一／下一 | paused | map 關閉 |
| 開始重播 | reader | 從目前或第一項 | playing | map 關閉 |
| 開啟 Session Map | 原視角不變 | 保留 | paused | map 開啟 |
| Map Cluster | 原視角不變 | 保留 | paused | map 保持開啟、改焦點 |
| Map Landmark 跳轉 | reader | 改為目標 | paused | map 關閉 |

### 3.4 結構表面狀態機

| viewport | 預設 | 使用者控制 | resize 規則 |
|---|---|---|---|
| ≥720 px | sidebar open | 收合／展開，頁面生命週期內保留 | 從窄轉寬時先關 drawer，再套用 desktop collapse 狀態 |
| <720 px | drawer closed | Header「結構＋位置」開啟；Escape／關閉／選取關閉 | 從寬轉窄時 sidebar 不占版面；不自動開 drawer |

### 3.5 Session Map 狀態機

`MapState = closed | open(global) | open(section) | open(detail)`

- `openMap()`：pause → 以目前位置為 focus → global；沒有 skeleton 時仍開啟可讀空狀態與回 Reader 按鈕。
- global cluster：進 section，focus 設為該 cluster 中距目前位置最近的 station。
- section station／rib cluster：進 detail，focus 設為對應 station。
- real landmark：更新 preview selection；不立即離開地圖。
- `jumpToMapSelection()`：只有 real landmark 可執行；呼叫既有 `setActive(id)` 語意後關閉地圖。
- close／Escape／`M`：關閉地圖，保留原 Primary View 與位置。

## 4. 精確畫面合約

### 4.1 ≥720 px

```text
┌ DIT ─ [總覽] [閱讀] [子代理] ─ [‹] [重播] [›] ─ [設定] ┐
├──────────────────┬──────────────────────────────────────────────┤
│ SESSION 結構 [«] │ 主要視角                                     │
│ 位置 2,632/29,452│                                              │
│ ● 里程碑          │ Overview／Reader／Subagents                  │
│   ○ 使用者意圖    │                                  ┌────────┐ │
│   ◇ 思考          │                                  │小地圖  │ │
│   ▸ 操作          │                                  │你在這裡│ │
│   ...虛擬化...    │                                  └────────┘ │
└──────────────────┴──────────────────────────────────────────────┘
```

- Sidebar：`clamp(240px, 22vw, 320px)`；收合後為不占內容寬度的窄觸發 rail。
- 740 px 仍屬 desktop contract，Sidebar 預設開啟；Minimap 為 144×96 px。
- ≥900 px Minimap 為 176×112 px。
- Minimap 位於 Reader scroll viewport 的右下角；內容補足右／下 scroll padding，最後一張卡不得被遮住。
- Overview／Subagents 或 Minimap 停用時，右下同位置只顯示 ≥44×44 px「地圖」浮動按鈕。

### 4.2 <720 px

```text
┌ DIT ─ [結構 2,632/29,452] ─ [‹][重播][›] ─ [設定] ┐
│ [總覽] [閱讀] [子代理]                            │
├────────────────────────────────────────────────────┤
│ 主要視角                                           │
│                                      [地圖]         │
└────────────────────────────────────────────────────┘
```

- Sidebar 不占版面；「結構＋位置」開啟左側 `<dialog>` drawer，寬 `min(88vw, 320px)`、高 100dvh。
- Minimap 不顯示，只保留 44×44 px 地圖按鈕。
- Session Map 改為滿版 `<dialog>`；不得要求精細雙指或小目標操作。
- 文件根層不得水平溢出；地圖內部可有自己的 scroll container。

### 4.3 Overview 首屏

順序固定：badge → 標題 → 一句用途 → Session 摘要 → 三步 → CTA。不得把 Provider、完整圖例或資料流說明放在 CTA 前。

```text
[內建示範 Session／已載入 Session]

從這裡開始
DIT 把代理執行紀錄整理成可學習的步驟。先確認任務，再沿左側結構逐步閱讀。

1 確認 Session
  <title> · <source> · <view item count> · <warning count>
2 沿主線閱讀
  左側顯示目前位置；可逐項跳轉或按重播。
3 延伸理解
  展開 why；需要全局或分支時再開地圖或子代理。

[開始示範／開始閱讀／繼續閱讀]
[載入 .jsonl] [載入 Session 資料夾]
```

- `SessionOrigin=sample`：badge「內建示範 Session」，主 CTA「開始示範」。
- `SessionOrigin=user` 且目前位置為第一項：badge「已載入 Session」，主 CTA「開始閱讀」。
- `SessionOrigin=user` 且目前位置非第一項：主 CTA「繼續閱讀」。
- warnings 與錯誤保持可見；Overview 只摘要 warning 數量，既有完整 warning banner 在 Reader 保留。

### 4.4 Session Map

- Desktop dialog：`min(88vw, 1440px)` × `min(84dvh, 900px)`。
- 720–899 px：92vw × 88dvh。
- <720 px：100vw × 100dvh。
- Header：可見標題、目前位置、全局／區段／細節三個語意縮放按鈕、關閉。
- 中央：SVG 地圖，背景不接受文字選取；目前位置用暗紅實心環＋「你在這裡」文字／等價 aria label。
- 側／下方：與目前 projection 同步的虛擬化文字地標清單。
- Footer：選取摘要、`跳到這一步`；選到 cluster 時改顯示 `查看這個區段`，不得跳到代表節點。
- Dialog 開啟時 focus 在 `tabIndex=-1` 的可見標題；Escape 關閉；關閉按鈕永遠可見。
- 不以 backdrop click 作必要關閉方式；是否支援點 backdrop 關閉不影響語意，但不得造成誤跳。

## 5. 文案與 i18n 契約

`src/i18n/locales.ts` 仍以 zh-TW shape 約束 EN；新增 key 必須同卡完成，不能先硬編中文。

| key | zh-TW | EN |
|---|---|---|
| `workspace.tabs.overview` | 總覽 | Overview |
| `workspace.tabs.reader` | 閱讀 | Reader |
| `workspace.tabs.subagents` | 子代理 | Subagents |
| `overview.startTitle` | 從這裡開始 | Start here |
| `overview.sampleBadge` | 內建示範 Session | Built-in sample session |
| `overview.loadedBadge` | 已載入 Session | Loaded session |
| `overview.startSample` | 開始示範 | Start sample |
| `overview.startReading` | 開始閱讀 | Start reading |
| `overview.continueReading` | 繼續閱讀 | Continue reading |
| `overview.loadFile` | 載入 .jsonl | Load .jsonl |
| `overview.loadFolder` | 載入 Session 資料夾 | Load session folder |
| `structure.position(current,total)` | 位置 current / total | Position current / total |
| `structure.openDrawer` | 結構 | Structure |
| `map.open` | 地圖 | Map |
| `map.title` | Session 地圖 | Session map |
| `map.youAreHere` | 你在這裡 | You are here |
| `map.levels.global` | 全局 | Overview |
| `map.levels.section` | 區段 | Section |
| `map.levels.detail` | 細節 | Detail |
| `map.jump` | 跳到這一步 | Go to this step |
| `map.openCluster` | 查看這個區段 | Explore this section |
| `map.empty` | 此 Session 沒有可建立地圖的骨架。 | This session has no mappable skeleton. |
| `settings.showMinimap` | 顯示微縮導航 | Show minimap |
| `settings.enableMapShortcut` | 啟用 M 地圖快捷鍵 | Enable M map shortcut |

其餘三步說明必須依 §4.3 的資訊順序提供等價中英文；不得以英文 key 或空字串降級。

## 6. 平台實作模型（PSM）

### 6.1 環境與選型

- Runtime：現有 Vite 5、React 18、TypeScript 5、Zustand 4、`@tanstack/react-virtual` 3。
- 渲染：沿用現有 SVG 與 TanStack virtualizer；不新增 production／dev dependency。
- Modal：使用原生 HTML `<dialog>.showModal()`，由瀏覽器提供 top-layer、背景 inert 與基礎 focus containment；React 負責開關同步、初始焦點與焦點回復。
- Responsive：優先沿用 `@container dit-app`，以等價 `@media` 作 fallback；窄版條件固定 `<720 px`，不得再讓 CSS `max-width:720px` 與產品語意互相矛盾。
- Visual：沿用 editorial serif、warm paper、oxblood accent、hairline、無陰影、無 emoji；地圖不是遊戲 HUD 換膚。

拒絕選項：

| 選項 | 不採原因 |
|---|---|
| React Flow 12 | 會要求現有魚骨遷入 node／edge／viewport 模型，對單一導航功能整合面過大 |
| `react-zoom-pan-pinch` | 第一版只需固定語意層級與 scroll/pan，尚不值得新增約 664 KB 解壓依賴 |
| D3 Zoom | 只處理 transform，焦點、語意、虛擬化仍需自建；現階段收益不足 |
| Tour 套件 | 一次性提示不能解決永久方向與可重返指南 |
| 自製 focus trap | 原生 dialog 已提供較可靠的基礎，不增加另一個易錯狀態機 |

### 6.2 核心型別

```ts
export const PRIMARY_VIEWS = ["overview", "reader", "subagents"] as const;
export type PrimaryView = (typeof PRIMARY_VIEWS)[number];
export type SessionOrigin = "sample" | "user";
export type MapZoomLevel = "global" | "section" | "detail";

export interface MapLandmark {
  type: "landmark";
  id: string;
  viewItemId: string;
  stationIndex: number;
  kind: SkeletonNodeKind | SkeletonRibKind | "subagent";
  label: string;
  parentStationId: string | null;
  ribCount: number;
  ribKindCounts: Record<string, number>;
}

export interface MapCluster {
  type: "cluster";
  id: string;
  sourceViewItemIds: string[];
  firstStationIndex: number;
  lastStationIndex: number;
  count: number;
  kindCounts: Record<string, number>;
  label: string;
}

export interface SessionMapProjection {
  level: MapZoomLevel;
  focusStationIndex: number;
  targets: Array<MapLandmark | MapCluster>;
  totalStations: number;
  totalRibs: number;
}
```

規則：

- `MapLandmark.viewItemId` 必須存在於目前 `viewItems`。
- `MapCluster.sourceViewItemIds` 只含真實 ID；cluster id 使用 `cluster:<level>:<first>:<last>`，不得冒充 span/group ID。
- `targets` 依原始 Session 順序排列；UI 不得把 landmarks／clusters 分組後改變相對順序。
- station landmark 聚合自己的 rib counts；未被 skeleton 引用的 subagent group 依 `ViewItem` index 掛到不晚於它的最近 station，沒有前站才掛第一站。
- projection 是顯示模型，不回寫 `SessionDocument` 或 `DistilledSkeleton`。
- `buildFishbone()` 可被重命名／包裝為 map model builder，但其既有 ID resolve 與 station/rib 關係不得改變。

### 6.3 Zustand 狀態與 action

新增／更名：

```ts
primaryView: PrimaryView;             // replaces workspaceView
sessionOrigin: SessionOrigin;
structureCollapsed: boolean;          // desktop, default false
structureDrawerOpen: boolean;         // narrow transient, default false
mapOpen: boolean;                     // transient, default false
mapZoomLevel: MapZoomLevel;            // default global when opening
mapFocusId: string | null;
minimapEnabled: boolean;               // default true, in-memory only
mapShortcutEnabled: boolean;           // default true, in-memory only

setPrimaryView(view): void;            // manual navigation; pauses, closes map
startReading(): void;                  // reader, paused, preserves position
openStructureDrawer(): void;
closeStructureDrawer(): void;
toggleStructureCollapsed(): void;
openMap(): void;                       // pauses; focus=current; global
closeMap(): void;
setMapZoom(level, focusId?): void;
setMapFocus(id): void;
jumpToMapItem(id): void;               // validates real id; setActive; closes overlays
setMinimapEnabled(enabled): void;
setMapShortcutEnabled(enabled): void;
```

轉移責任：

- `publishPipelineResult(result, origin)` 一次設定 `sessionOrigin`、`primaryView:"overview"`、第一個 `activeId`、清除 map/drawer overlay。
- `loadFromText／loadFromFiles／loadFromBlobs` 的使用者入口傳 `origin:"user"`；App 初載與 `resetToSample` 傳 `origin:"sample"`。
- Session 替換與 reset 不重設 locale、`structureCollapsed`、`minimapEnabled`、`mapShortcutEnabled`；它們是本頁使用偏好。
- `setPrimaryView`、`openMap`、`setActive` 都走同一 pause 語意；不得由元件直接 `setState` 繞過。
- `privacyReview` 由 null 轉為非 null 前，先關閉 Session Map 與 Structure drawer；阻擋性審查不得和導航 modal 疊層。
- `gotoIndex` 保留給 replay／prev／next，可在 playing 狀態前進；它仍強制 Reader。
- `jumpToMapItem` 先確認 ID 存在於 `viewItems`；不存在時不改位置，關閉地圖與否保持原狀，並發布可讀診斷。

### 6.4 元件邊界

| 元件／檔案 | 責任 |
|---|---|
| `App.tsx` | 以 sample origin 初載；掛載全域狀態、Workspace 與 SessionMapDialog |
| `SessionLoadActions.tsx`（新） | 共用 file／folder inputs；Overview 與 Header 設定匣不複製載入邏輯 |
| `OverviewView.tsx`（新） | §4.3 導向、摘要、三步與 CTA |
| `WorkspaceTabs.tsx` | 三個 Primary View tabs 與 APG 鍵盤行為 |
| `Workspace.tsx` | desktop sidebar＋單一 active panel；窄 drawer trigger 的 layout host |
| `Sidebar.tsx` | `variant="desktop" \| "drawer"`；短標題、位置、對應的 collapse/close chrome 與共用虛擬樹；不再渲染完整 metadata／legend |
| `StructureDrawer.tsx`（新） | 使用同一 Sidebar tree row renderer 的 native dialog；不得複製不同選取邏輯 |
| `MainView.tsx` | Reader 虛擬清單、可見範圍、ReaderMinimap host |
| `ReaderMinimap.tsx`（新） | 有界縮圖、目前位置／Reader 可見範圍、整體開圖按鈕 |
| `MapLauncher.tsx`（新） | 非 Reader／窄版／minimap disabled 時的右下可見地圖按鈕 |
| `SessionMapDialog.tsx`（新） | native dialog、縮放控制、selection summary、文字地標清單、跳轉 |
| `SessionMapGraphic.tsx`（新） | SVG projection；pointer 選取／cluster refocus；`aria-hidden`，文字清單提供等價操作 |
| `core/view/sessionMap.ts`（新） | map model、projection、cluster、cap 與 ID validation 純函式 |
| `core/view/mapShortcut.ts`（新） | `M` guard 純函式；不讀 DOM 全域狀態之外的產品資料 |
| `Header.tsx` | 三 tabs、replay、settings、窄版 Structure＋position；設定匣新增導航 group |
| `StructurePanel.tsx` | GN-02 刪除；Structure 不再是主 panel |
| `FishboneView.tsx` | GN-04 被 SessionMap 元件取代後刪除；不得留下未使用的第二套魚骨 UI |

共用原則：Sidebar desktop/drawer 必須共用 row renderer 或同一 `Sidebar` component props；Minimap／MapGraphic 必須共用 `SessionMapProjection`，不能各自另算節點。

### 6.5 語意縮放與有界演算法

常數集中於 `sessionMap.ts`：

```ts
MAX_GLOBAL_TARGETS = 80;
MAX_SECTION_TARGETS = 200;
DETAIL_STATION_RADIUS = 10;
MAX_MOUNTED_DETAIL_RIBS = 120;
```

- **global**：stations ≤80 時全為 real landmarks；超過時保留 active station 為 real landmark，其餘按原始順序切成最多 79 個連續 cluster。若 active 不在 stations，全部切成最多 80 clusters。
- **section**：以 focus station 為中心，邊界為前一／後一個 objective、milestone 或 outcome；station／cluster targets 最多 199，超過時保留 focus，其他仍以連續 cluster 聚合。每個 station glyph 以非互動 count 顯示 ribs；只有 focus station 額外產生一個可操作 rib cluster，因此全部 targets ≤200。
- **detail**：顯示 focus 前後各 10 stations；focus station 的全部 ribs 進 TanStack virtual list，但 mounted rows ≤120。其他 station 只顯示 rib count，不掛全部 rib controls。
- cluster 的 `count`、第一／最後 index、kindCounts 與來源 ID 都由純函式決定；相同輸入必須產生相同輸出。
- Minimap 使用 global projection；SVG 可將同類非互動 glyph 合併為 path，但目前位置與 viewport indicator 必須獨立可見。

### 6.6 快捷鍵守門

`shouldHandleMapShortcut(event, state)` 只有全部成立才回傳 true：

1. `event.key.toLowerCase() === "m"`；
2. `mapShortcutEnabled && doc !== null`；
3. `!event.defaultPrevented && !event.repeat`；
4. 無 Ctrl／Alt／Meta；Shift 可接受但不得產生不同功能；
5. target 不是 `input, textarea, select, [contenteditable=true]`，也不在上述祖先內；
6. Privacy Review、Structure drawer 或其他非 Map modal 未開啟；
7. 若 Map 已開，M 關閉；否則開啟並 pause。

### 6.7 錯誤、降級與回退

- 無 skeleton：Map dialog 顯示 `map.empty`、目前 Session 摘要與回 Reader；Minimap 退化為地圖按鈕。
- activeId 無法映射 station：Map 以第一個 station 為 focus，但 Overview／Reader 位置不變，顯示非阻擋診斷。
- map selection ID 已失效：拒絕跳轉並顯示 inline error；不得靜默跳第一項。
- native dialog `showModal()` 失敗：顯示全寬 inline map fallback 與關閉按鈕；不得空白或吞錯。
- Resize 到 desktop 時若 drawer 開啟，先關 drawer並回復觸發焦點；Resize 到 narrow 不自動打開。
- Minimap render 失敗：隱藏縮圖、保留 MapLauncher；Reader 不受影響。
- 選取真實地標時，摘要顯示 kind、label 與既有 annotation `generalLesson`（若存在）；Minimap／global glyph 不直接掛載 lesson 文字。
- 任一 GN 卡需回退時，先反向回退依賴卡；資料管線、virtualizer 與 Privacy contract 不得一併移除。

### 6.8 安全與資料邊界

- 資產：本機 transcript、程式碼片段、annotations、Provider endpoint／model 設定。
- 不受信入口：file/folder 內容、Session title／summary／labels、鍵盤與 pointer events、loopback Provider 回覆。
- 最壞實際濫用：惡意 Session label 嘗試注入 HTML／script；超大資料使地圖掛載過量；單鍵快捷鍵在輸入時誤觸；modal 疊層遮住 Privacy Review。
- 控制：React escaped text／SVG attributes、禁止 `dangerouslySetInnerHTML`、projection caps、shortcut guard、Privacy Review 高於 map 且阻擋 `M`、無新網路或 persistence。
- 診斷不得記錄原始 Session 文字；只允許 error code、失效 ID、target counts、level 與耗時。

## 7. 語意驗證

### 7.1 追溯矩陣

| CIM 規則 | PIM 元素 | PSM／施工卡 | 驗收 |
|---|---|---|---|
| BR-1 起點 | Overview、Session Origin、INV-2 | GN-01 | 啟動／載入／reset 皆見 Overview |
| BR-2 方位 | Structure Sidebar、Current Position、INV-5/6 | GN-02/03 | 740 左側；390 drawer |
| BR-3 全局 | Minimap、Session Map、INV-7–13 | GN-04/05/06 | 地圖開啟、聚合、跳轉同步 |
| BR-4 內容優先 | Primary View、INV-1/4/8 | GN-01/04/06 | Reader 唯一完整詳情 |
| BR-5 選配後置 | INV-15 | GN-01/08 | 設定收合且基本閱讀可用 |
| BR-6 大量資料 | Semantic Zoom、INV-14/18 | GN-05/07 | DOM caps、50 MiB、取消保留 |
| BR-7 誠實語意 | Current Position、INV-16 | GN-01/02/08 | UI grep 無誤用完成進度 |
| BR-8 本機邊界 | INV-17/18 | GN-04/07/08 | 無新 request／storage；privacy tests 綠 |

反向檢查：PIM 十個詞彙與 INV-1–18 均至少追溯到 BR-1–8；沒有 orphan。Map Cluster／Semantic Zoom 追溯 BR-3/6，Session Origin 追溯 BR-1，Primary View 追溯 BR-1/4。

### 7.2 語意落差登記

| PIM 語意 | 平台落差 | 橋接 | 扭曲 |
|---|---|---|---|
| 持續左側結構 | 390 px 無法維持雙欄可讀寬度 | <720 使用左側 modal drawer＋Header 位置摘要 | 否 |
| 數萬節點全局形狀 | 單張 SVG／DOM 無法逐點呈現 | deterministic cluster＋semantic zoom＋virtual list | 否；cluster 明示非真實節點 |
| 單鍵 M | Web 單字元快捷鍵易誤觸 | 可停用＋editable/modal guard＋可見按鈕 | 否 |
| modal focus | React div 沒有 top-layer／inert | native dialog＋明確 initial/return focus | 否 |
| Reader viewport 顯示於 Minimap | virtualizer 只掛載可見 rows | MainView 傳 virtual range，Minimap 映射到 global projection | 否 |
| 目前進度 | 沒有已學習持久狀態 | 僅顯示位置 current/total | 否；避免錯誤承諾 |

驗證結果：設計可進 PSM；唯一未取得的證據是不同作者的獨立文件 sign-off，已於 §0 明示，不影響使用者先審閱本合約。

## 8. 施工卡

### GN-01 — 使用者進入任何 Session 都先得到可操作的 Overview
- Severity/Confidence: blocker / high；DIT RPD、現有 store 轉移與使用者截圖問題已逐項核對。
- Objects: 新增 `src/components/OverviewView.tsx`, `src/components/SessionLoadActions.tsx`; 修改 `src/App.tsx`, `src/components/Header.tsx`, `src/components/Workspace.tsx`, `src/components/WorkspaceTabs.tsx`, `src/core/view/workspace.ts`, `src/core/view/workspace.test.ts`, `src/store/sessionStore.ts`, `src/store/sessionStore.test.ts`, `src/i18n/locales.ts`, `src/styles/index.css`。
- Why: 目前初載與載入成功直接設 `workspaceView:"reader"`，使使用者先看到無脈絡卡片；主要視角又混入 Structure／Fishbone。
- Change: 以 expand-contract 方式先加入 `PrimaryView`／`SessionOrigin` 與新 actions，遷移全部 call sites 後刪除 `WorkspaceView/workspaceView`；PRIMARY_VIEWS 固定 Overview/Reader/Subagents；App sample、使用者三種 load 與 reset 分別傳正確 origin；新增 §4.3 Overview；抽出共用 file/folder actions；手動 tab 轉移 pause，start/replay/prev/next 回 Reader；同卡補齊 zh-TW/EN 與 pure/store tests。
- Blast radius: 改變啟動、載入、重設與 tab 順序；不得改 file filtering、folder merge、load progress、取消保留舊文件、annotation restore、Provider／locale 狀態。Fishbone UI 暫不刪除但不再作 tab，等待 GN-04 接管。
- Rollback: 在 GN-02 前可單獨 revert 本卡 commit，恢復舊 workspace enum；若已有依賴卡，按 GN-08→GN-02 反向回退。Streaming／virtualization 仍保留。
- Acceptance: `npm.cmd test -- src/core/view/workspace.test.ts src/store/sessionStore.test.ts` exit 0；測試明示 sample/user load/reset→overview、start/prev/next/play→reader、manual tab→paused、activeId 保留；`rg -n "workspaceView|WorkspaceView" src` 無輸出；`rg -n 'fishbone|structure' src/core/view/workspace.ts` 無輸出；`npm.cmd run typecheck` exit 0。人工：390/740/1280 初載首屏依 §4.3，CTA 可完成 sample/file/folder 路徑。
- Commit: `feat(workspace): add guided session overview`

### GN-02 — ≥720 px 的 Structure 持續在左側並可收合
- Severity/Confidence: blocker / high；符合使用者明確糾正與原始雙欄 RPD，現有 Sidebar virtualizer 可直接保留。
- Objects: 修改 `src/components/Workspace.tsx`, `src/components/Sidebar.tsx`, `src/components/Header.tsx`, `src/store/sessionStore.ts`, `src/store/sessionStore.test.ts`, `src/i18n/locales.ts`, `src/styles/index.css`; 刪除 `src/components/StructurePanel.tsx`。
- Why: Structure-as-tab 破壞位置感；現有 Sidebar 又把 metadata／圖例塞在導航前，浪費垂直空間。
- Change: Workspace 改為 Sidebar＋active primary panel；Sidebar static 區只留短標題、`Position current/total`、collapse；保留同一 virtualizer、ID→index 與 tree row；新增 `structureCollapsed` 和 rail 展開控制；位置使用 `playingId ?? activeId` 對應 index，找不到顯示 `— / total`；≥720 width 為 `clamp(240px,22vw,320px)`；切 Overview/Subagents 不卸載位置語意，但一次仍只掛一個 primary panel。
- Blast radius: 桌面／740 版面與可用寬度改變；不得改 tree item ordering、dot symbols、setActive→Reader、deep virtual scroll 或 MainView scroll behavior。
- Rollback: 在 GN-03 前 revert 本卡；之後需先 revert GN-03。刪除的 StructurePanel 可由 git 恢復，不影響資料。
- Acceptance: `npm.cmd test -- src/store/sessionStore.test.ts` exit 0，含 collapse 不改 active/playback、position index 正確；`rg -n "StructurePanel" src` 無輸出；`npm.cmd run typecheck` exit 0；人工 740×1113、1280×720、2048×966：sidebar 預設開、三 primary views 均保留、collapse 後主區擴張且有 rail、深層選取同步 Reader。
- Commit: `feat(workspace): restore persistent structure sidebar`

### GN-03 — <720 px 以可及的左側 Structure drawer 保留精確導航
- Severity/Confidence: blocker / high；390 px 無法雙欄已由實機截圖確認，native dialog 行為依 WAI-ARIA/APG 橋接。
- Objects: 新增 `src/components/StructureDrawer.tsx`; 修改 `src/components/Header.tsx`, `src/components/Workspace.tsx`, `src/components/Sidebar.tsx`, `src/store/sessionStore.ts`, `src/store/sessionStore.test.ts`, `src/i18n/locales.ts`, `src/styles/index.css`。
- Why: 窄版需要完整主內容寬度，但不能讓 Structure 消失或變成另一個主分頁。
- Change: 新增 `structureDrawerOpen` actions；Header 僅在 <720 顯示 Structure＋position；以 native dialog 樣式成左 drawer，內容重用 Sidebar/tree row，不複製選取狀態；open focus title、Escape／close 回 trigger；選項 setActive 後關 drawer並由 Reader 聚焦；`matchMedia('(min-width: 720px)')` 轉寬時關 drawer；container/media fallback 同步改為 `<720`。
- Blast radius: Header 窄版、modal top-layer、焦點與 resize；不得遮蔽 SessionLoadStatus／PrivacyReview 的阻擋決策，PrivacyReview 存在時 Structure trigger disabled 或先關 drawer。
- Rollback: revert 本卡即可回到 GN-02 desktop-only 狀態；390 將退化為無 Structure drawer，但 Reader／資料不受影響。
- Acceptance: `npm.cmd test -- src/store/sessionStore.test.ts` exit 0，含 open/close/select/resize state；`npm.cmd run typecheck` exit 0；`npm.cmd run build` exit 0。人工 390×844：主區全寬、按鈕顯示位置、drawer 從左開、Tab 不逸出、Escape 回 trigger、選深層項後 drawer 關且 Reader 定位；720 px 精確落在 desktop contract。
- Commit: `feat(workspace): add accessible structure drawer`

### GN-04 — 使用者可開啟大型 Session Map、預覽真實地標並跳回 Reader
- Severity/Confidence: blocker / high；VS Code Minimap、Xbox map alternative navigation 與現有 fishbone ID bridge 已核對。
- Objects: 新增 `src/core/view/sessionMap.ts`, `src/core/view/sessionMap.test.ts`, `src/components/SessionMapDialog.tsx`, `src/components/SessionMapGraphic.tsx`, `src/components/MapLauncher.tsx`; 修改 `src/App.tsx`, `src/store/sessionStore.ts`, `src/store/sessionStore.test.ts`, `src/i18n/locales.ts`, `src/styles/index.css`; 遷移後刪除 `src/components/FishboneView.tsx`，視需要保留或內聯 `src/core/view/fishbone.ts` 的既有 station builder。
- Why: Fishbone 作主要 tab 仍要求使用者離開 Reader；它更適合成為全局導航 overlay。
- Change: 建立 §6.2 model 與 global projection；新增 map store actions；App 全域掛載 native dialog；MapLauncher 在非 Reader／窄版／minimap-disabled 時可見；dialog 依 §4.4 顯示全局地標、文字等價清單、selection summary；real landmark 需明確 Jump 才 setActive+close，cluster 只 refocus；無 skeleton／invalid ID／showModal failure 有可見降級；SVG 不用 innerHTML。
- Blast radius: 移除舊 Fishbone tab/UI、增加全域 modal 與 map state；不得改 DistilledSkeleton、buildViewModel、annotation generalLesson 或既有 station/rib→ViewItem resolve。
- Rollback: 在 GN-05/06 前 revert 可恢復未暴露的舊 FishboneView；之後需先 revert GN-06、GN-05。資料契約不需 migration。
- Acceptance: `npm.cmd test -- src/core/view/sessionMap.test.ts src/store/sessionStore.test.ts` exit 0；測試涵蓋 real ID、cluster 非跳轉、invalid ID 不改 active、open pause、jump→reader+closed；`rg -n "FishboneView" src` 無輸出；`npm.cmd run typecheck` exit 0；`npm.cmd run build` exit 0。人工：三 viewport 可開／關地圖、initial focus、Escape／return focus、real landmark preview＋jump、cluster 不誤跳、無 skeleton 有空狀態。
- Commit: `feat(map): add accessible session map overlay`

### GN-05 — Session Map 以 deterministic semantic zoom 呈現數萬項目
- Severity/Confidence: blocker / medium-high；演算法為離散且可單元驗證，實際可讀性仍需 UAT。
- Objects: 修改 `src/core/view/sessionMap.ts`, `src/core/view/sessionMap.test.ts`, `src/components/SessionMapDialog.tsx`, `src/components/SessionMapGraphic.tsx`, `src/i18n/locales.ts`, `src/styles/index.css`。
- Why: 等比例縮小數萬節點只會形成雜訊並重新引入大量 DOM；cluster 必須可追溯且不能冒充真實節點。
- Change: 實作 §6.5 global/section/detail projection 與集中 caps；global cluster→section、section target→detail；detail ribs 使用 TanStack virtualizer；文字地標清單與 SVG 同 projection；cluster 顯示 count／範圍，不提供 Jump；縮放按鈕使用 aria-pressed，focus/selection 在 projection 更新後仍有效或回 focus station。
- Blast radius: 地圖節點數、label、zoom/focus、detail scroll；不得改原始 station/rib order、kind、label、viewItemId 或 Reader selection。
- Rollback: revert 本卡退回 GN-04 global-only map；Map overlay與 jump 仍可用。若 GN-07 已依 caps 驗收，先 revert GN-07 的 map-specific調整。
- Acceptance: `npm.cmd test -- src/core/view/sessionMap.test.ts` exit 0；fixtures 必含 0、1、80、81、10,000 stations、active missing、>120 ribs；斷言 global targets≤80、section≤200、detail mounted contract≤120、source IDs 完整且順序 deterministic、cluster 永不具 `viewItemId`；`npm.cmd run typecheck` exit 0。人工：全局→區段→細節順序可理解，cluster 明顯不是代理步驟，當前節點在每層可辨識。
- Commit: `feat(map): add semantic zoom and landmark clusters`

### GN-06 — Reader 以微縮導航與安全 M 快捷鍵提供即時全局方位
- Severity/Confidence: should-fix / high；VS Code minimap 互動與 WCAG 單鍵／target size規範已查核。
- Objects: 新增 `src/components/ReaderMinimap.tsx`, `src/core/view/mapShortcut.ts`, `src/core/view/mapShortcut.test.ts`; 修改 `src/components/MainView.tsx`, `src/components/MapLauncher.tsx`, `src/components/Header.tsx`, `src/store/sessionStore.ts`, `src/store/sessionStore.test.ts`, `src/i18n/locales.ts`, `src/styles/index.css`。
- Why: 大地圖若只有隱藏命令仍缺少即時方位；微縮圖需常駐但不能成為密集誤觸導航。
- Change: MainView 將 virtualizer visible start/end 傳給 Minimap；Minimap 使用 global projection，顯示主線、地標、active／playing 與 Reader viewport indicator，整體 click/Enter 只 openMap；≥900 176×112、720–899 144×96、<720 不顯示；設定匣新增 Navigation group 與 showMinimap／enableM；實作 §6.6 pure guard與 document key listener；其他視角／disabled 顯示 MapLauncher；scroll padding避免遮卡。
- Blast radius: Reader overlay、document keydown、settings tray與 scroll padding；不得阻擋 typing、browser快捷鍵、Privacy Review、Structure drawer或 replay；Minimap失敗不得影響 Reader。
- Rollback: revert 本卡保留 GN-04/05 大地圖與可見 MapLauncher；使用者仍可開圖，只失去縮圖與 M。
- Acceptance: `npm.cmd test -- src/core/view/mapShortcut.test.ts src/store/sessionStore.test.ts` exit 0，涵蓋 m/M、repeat、modifier、editable ancestor、disabled、no-doc、modal guard、toggle；`npm.cmd run typecheck` exit 0；`npm.cmd run build` exit 0。人工：Reader scroll／replay 時你在這裡與 viewport 更新；點小圖只開圖；390 只有 44×44 Map；輸入 Provider/model 時按 M 無作用；設定可停用且可見按鈕仍在。
- Commit: `feat(map): add reader minimap and safe shortcut`

### GN-07 — 50 MiB Session 的工作台與地圖維持有界渲染且無既有效能回歸
- Severity/Confidence: blocker / medium-high；既有 50 MiB benchmark 與 DOM 數字可作同機基線，最終數值必須以真實 run 更新。
- Objects: 修改 `scripts/render-r5-benchmark.mjs`, `docs/rounds/r5-guided-navigation/R5_BENCHMARK_2026-07-19.md`（新增本次實跑 section，不覆寫舊證據）；視量測結果最小修改 `src/core/view/sessionMap.ts`, `src/components/ReaderMinimap.tsx`, `src/components/SessionMapDialog.tsx`, `src/styles/index.css`；不得順手重構其他模組。
- Why: 同時掛載 Sidebar、Reader、Minimap 或 Map modal 可能重新增加 DOM／首開延遲，綠色 unit tests不能證明畫面效能。
- Change: 擴充 benchmark schema記錄 closed Reader、global/section/detail map 的 total elements、mounted tree/reader/map/list targets、open latency、overflow與selection drift；用現有 deterministic fixture跑 production preview；若超標，優先降低 projection／overscan或合併非互動 SVG path，不改 PIM 語意；保留舊 benchmark section作對照。
- Blast radius: 只允許有界渲染與 CSS 調整；不得變更 labels、cluster membership、jump target、load pipeline、worker或annotation。
- Rollback: benchmark文件新增 section可由 commit revert；效能修正如需回退，仍需滿足 INV-14，否則不得宣告 R5完成。
- Acceptance: 同一機器 production run：50 MiB load不 crash、progress在 ready前可見、cancel在完成前回應且保留舊doc；Reader closed total DOM≤250；global/section/detail map open total DOM≤500；mounted tree rows≤250、reader rows≤250、global targets≤80、section≤200、detail rib rows≤120；document horizontal overflow false於390/740/1280；map open→first rendered target <200 ms；deep jump無selection drift；load duration不得比本文件記錄的同機1,389 ms基線退化超過25%，若環境不同則標 unverified而非硬判。`npm.cmd run benchmark:r5 -- <new-metrics.json>`輸出result pass；`npm.cmd test` exit 0；`npm.cmd run typecheck` exit 0；`npm.cmd run build` exit 0；`git diff --check` exit 0。
- Commit: `perf(map): bound large-session navigation rendering`

### GN-08 — 雙語手冊、架構紀錄與最終 UAT 和實際產品一致
- Severity/Confidence: blocker / high；使用者明確要求手冊、順序與文件一致性，前七卡提供可核對實體。
- Objects: 新增 `docs/USER_GUIDE.md`; 修改 `docs/architecture.md`, `docs/PSM_DIT_v1.0.md`, `docs/PROGRESS.md`, `docs/ACCEPTANCE.md`, `references/DIT-tickets.md`; 視需要更新本文件狀態與證據段，但不得改已批准語意。
- Why: 只有 App 內文案仍不足以跨 Session交接；若總 PSM、architecture、進度與票據保留Structure-as-tab，下一個實作者會再次依錯誤文件修改。
- Change: USER_GUIDE依「載入→總覽→閱讀→結構跳轉→地圖→子代理→選配講解」編排並附390/740/desktop操作差異與M規則；architecture記錄PrimaryView、persistent sidebar、map projection、dialog與caps；PSM_DIT把舊ADR-024標superseded並新增已批准決策；PROGRESS／ACCEPTANCE只記真實驗證；T-005只有使用者完成最終視覺UAT後才能done。
- Blast radius: 文件與 release status；不得把自動化綠燈寫成視覺驗收，也不得覆寫舊 benchmark/UAT歷史。
- Rollback: revert本卡只回退文件，產品功能仍在；但文件不一致時不得交付或合併。
- Acceptance: `rg -n "reader \| fishbone \| subagents \| structure|四.*工作區|Structure-as-tab|結構.*分頁" docs/architecture.md docs/PSM_DIT_v1.0.md docs/PROGRESS.md docs/USER_GUIDE.md`只能命中明確標記superseded的歷史句；`rg -n "載入.*總覽.*閱讀.*地圖.*子代理" docs/USER_GUIDE.md`至少一命中；`npm.cmd test` exit 0；`npm.cmd run typecheck` exit 0；`npm.cmd run build` exit 0；`git diff --check` exit 0。人工依§10完整UAT，使用者明確確認後才把T-005改done。
- Commit: `docs(r5): align guide and navigation evidence`

### GN-09 — 視覺 UAT 恢復圖例、魚骨語彙與可讀尺度
- Severity/Confidence: blocker / high；2026-07-19 使用者實機 UAT 明確指出重要節點、圖例、節點類型與分支語彙不足，且全域字級與地圖定位不易辨識。
- Objects: `src/components/Sidebar.tsx`, `src/components/SessionMapGraphic.tsx`, `src/components/SessionMapDialog.tsx`, `src/core/view/sessionMap.ts`, `src/core/view/sessionMap.test.ts`, `src/styles/index.css`, 雙語 copy 與本卡驗證證據；不得修改 load pipeline、worker、annotation、jump target 或快捷鍵語意。
- Why: GN-01～GN-08 的功能與效能門檻已通過，但目前視覺層級把重要節點降成雜訊、移除已接受的圖例與方塊魚骨語彙，放大地圖還有尾端空線與非置中問題，尚未達成人工驗收。
- Change: (1) Sidebar 標出 Minimap 可見的重要節點；(2) Sidebar 與 Session Map 恢復精簡圖例，明確取代 GN-02／INV-6 的「側欄無圖例」限制，但不得恢復完整 metadata；(3) Sidebar 節點符號放大為目前約兩倍且大於文字；(4) 節點／項目類型標示至少與標題同級並放大外框；(5) Header、Structure、Reader、Map、footer 以同色系些微深淺區分，類型仍須同時由文字與形狀表達；(6) Map dialog 在 viewport 置中，開啟時將目前／選定節點置中，Close 使用高辨識紅色；(7) 所有既有字級約放大 1.25 倍，選項類標示約放大 1.5 倍；(8) Map spine 只從第一個目標延伸至最後一個目標，四節點圖不得有尾端無意義線段；(9) Map 恢復依節點類型區分的方塊／幾何形狀與有界魚骨分支提示。Overview 啟動／載入／重設入口、desktop/narrow Structure、Minimap 只開 Map、Global/Section/Detail cluster 不可 Jump、真實 Jump 同步 Reader/Structure 並停止播放、安全 M guard、50 MiB 載入／取消、R4 linkage、雙語與有界渲染語意均不得改變。
- Blast radius: 僅限視覺呈現、純 layout helper、aria/copy 與相關測試；Reader closed DOM≤250、Map DOM≤500 與既有 projection caps 不得因圖例或魚骨提示失守。
- Rollback: 可單獨 revert GN-09 實作 commit，回到 GN-08 已驗證狀態；不得連帶回退 GN-01～GN-08 或修改已核准互動語意。
- Acceptance: 純 layout 測試證明四節點 spine 起訖等於第一／最後節點且整體中點置中，單節點與空集合無多餘尾線；Sidebar 重要節點與雙處精簡圖例存在；類型使用文字加幾何形狀而非只靠顏色；production 於 390、740、1280 寬檢查字級、選項層級、區域底色、dialog／目前節點置中、紅色 Close 與無水平 overflow；`npm.cmd run benchmark:r5 -- <new-metrics.json>` result pass；`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check` 全部 exit 0。視覺正確性仍由使用者依更新後人工清單確認。
- Commit: `fix(workspace): restore map hierarchy and readability`

### GN-10 — 穩定 Section 預覽並恢復低噪音符號與配色
- Severity/Confidence: blocker / high；2026-07-19 使用者實機 UAT 發現 Section 選取 3.1 會讓 2.1 從投影消失，且 GN-09 的 Sidebar 白底幾何符號過大、圖例過度占高、白底節點破壞既有色彩協調。
- Objects: `src/components/SessionMapDialog.tsx`, `src/components/SessionMapGraphic.tsx`, `src/components/Sidebar.tsx`, `src/components/StructureLegend.tsx`, `src/core/view/sessionMap.ts`, `src/core/view/sessionMap.test.ts`, `src/styles/index.css`, `docs/PROGRESS.md`, `docs/ACCEPTANCE.md`, `references/DIT-tickets.md` 與本卡證據；不得修改 load pipeline、worker、annotation、Jump target、快捷鍵或 Global／Section／Detail 既有語意。
- Why: `mapFocusId` 同時承擔 projection focus 與 preview selection；點擊真實地標會重算 Section 邊界，因此相鄰 target 被替換。Sidebar 則把原本和諧的文字 glyph 換成白底幾何圖，與使用者已接受的低噪音視覺不符。
- Change: (1) Session Map dialog 使用本地 preview selection；只有進入其他語意縮放層級時才更新 projection focus，選取不同地標不得改變當前 projection 的 target ID、順序或數量；(2) Sidebar 恢復原有 `SPAN_DOT` 純文字 glyph，透明底、無外框，調整為 20 px 並保留重要節點文字標籤；(3) Sidebar 圖例改為結構化四欄網格，每列最多四種，窄 drawer 仍完整可讀；(4) Map／Minimap 節點填色使用所在區域底色，不得再出現額外白底圖塊；紅色 current／Close 與文字＋形狀辨識維持 GN-09；(5) 不改 Jump、cluster zoom、Map 開關與 Reader／Structure 同步語意。
- Blast radius: 僅限 Map projection selection 邊界、Sidebar 圖例 DOM、符號比例與表面配色；Reader closed DOM≤250、Map DOM≤500、projection caps 與 GN-01～GN-09 已接受行為不得失守。
- Rollback: 可單獨 revert GN-10，回到 GN-09 commit；不得連帶回退此前切片或重新引入 preview selection 改寫 projection focus 的耦合。
- Acceptance: unit test 證明 Section 選取另一地標前後 target ID 與順序完全相同；production 實際點選非 current target 後 target 集合不變且只有 selected class 移動；390／740／1280 文件級水平 overflow 為 false；Sidebar glyph 為 20 px、透明底、無背景圖與外框，圖例 computed grid 為四欄；Map shape fill 等於 Map surface，文字與紅色 Close 對各自背景對比均至少 4.5:1；`npm.cmd run benchmark:r5 -- <new-metrics.json>` result pass；`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check` 全部 exit 0。視覺舒適度仍由使用者依更新後人工清單確認。
- Commit: `fix(map): stabilize section preview and visual balance`

## 9. 施工依賴與提交邊界

```text
GN-01 Overview/state
  └─ GN-02 desktop Structure
       └─ GN-03 narrow drawer
GN-01
  └─ GN-04 global map
       └─ GN-05 semantic zoom
            └─ GN-06 minimap/M
GN-03 + GN-06
  └─ GN-07 performance evidence
       └─ GN-08 docs/final UAT
            └─ GN-09 visual UAT remediation
                 └─ GN-10 selection/visual balance remediation
```

GN-02/03 與 GN-04/05 在語意上可並行，但目前同一 worktree 且會同時改 store、Header、styles；為避免衝突，本合約要求依編號順序施工。不得把十張卡壓成一個 commit，也不得把一張卡拆成只有 store 或只有 CSS 的水平 commit。

## 10. 最終人工驗收清單

1. **首次入口**：390×844、740×1113、1280×720 初載均先看到 Overview 與主 CTA，不是 Reader 卡片。
2. **自有 Session**：載入 file與folder成功後皆回 Overview；badge、counts、warnings屬於新 Session。
3. **桌面 Structure**：740/1280/2048 左側預設可見；切三視角不消失；收合／展開不丟位置。
4. **窄版 Structure**：390 Header顯示位置；drawer從左開；Tab、Escape、focus return與選取後定位正確。
5. **Reader**：上一項／下一項／重播、深層跳轉、group展開與why維持；左側與Reader同一項。
6. **Minimap**：740/desktop Reader可見、目前位置與viewport隨scroll/replay更新，不遮最後卡；390只顯示Map按鈕。
7. **M**：一般畫面開／關地圖；Provider/model/file等輸入聚焦時不觸發；停用後不觸發但按鈕仍可用。
8. **Map global**：開啟以目前位置聚焦；cluster明示聚合；real landmark只預覽不誤跳。
9. **Map zoom/jump**：global→section→detail可理解；Jump後dialog關、Reader聚焦、sidebar同步且播放停止。
10. **Map accessibility**：dialog title initial focus、Tab不逸出、Escape關閉、關閉回trigger；文字地標清單可完成所有跳轉。
11. **空／錯狀態**：無skeleton、無subagent、invalid map target、load failure皆有可讀訊息與返回路徑，不空白。
12. **大量資料**：50 MiB四寬度無crash／橫向頁面溢出／空白捲動區／selection drift；DOM與latency符合GN-07。
13. **雙語**：zh-TW／EN切換後狀態、位置、map selection不變；沒有raw key或文字截斷導致功能不可辨。
14. **既有能力**：Ollama/OpenCode/Privacy Review、annotation cache、load cancel、R4 subagent ordering/linkage全數回歸。

視覺類只有使用者完成上述真實環境驗收後才算通過；自動化與production preview不能代替。

## 11. 不得回歸的既有契約

- 單檔 `.jsonl`、多檔與 Session folder（main＋`subagents/*.jsonl`）讀入；跨檔 UUID parent linkage與穩定timestamp ordering。
- streaming reading/parsing/organizing/validating/ready進度；取消Worker後保留上一份有效document；partial result不發布。
- Sidebar與MainView各自virtualizer、stable `ViewItem.id` key、ID→index深層定位。
- 手動選取停止播放並清除舊 `playingId` 優先權；prev/next/replay仍逐項定位。
- 子代理group、局部分支、群組展開與唯一Reader完整內容。
- none/Ollama/OpenCode provider、annotation missing/failed/all、IndexedDB cache／memory fallback、locale fingerprint。
- Privacy Gateway去識別化preview、session-scoped consent、secret fail-closed；阻擋前不得建立OpenCode session。
- settings tray所有寬度預設收合；載入／錯誤／Privacy Review保持外部可見。
- zh-TW預設、EN切換、editorial serif、warm paper、單一oxblood accent、無emoji、lining digits。

## 12. 完整決策紀錄

| ID | 決策 | 狀態 | 決策者／日期 |
|---|---|---|---|
| D1 | 設定匣所有寬度預設收合 | approved | 使用者／2026-07-19 |
| D2-old | Reader/Fishbone/Subagents/Structure四互斥tab | superseded | 使用者糾正／2026-07-19 |
| D3 | tabs使用現有React＋WAI-ARIA，不加tabs library | approved | 使用者／2026-07-19 |
| D4 | ≥720 persistent Structure；<720 left drawer | approved | 使用者／2026-07-19 |
| D5 | 啟動、載入成功、reset後進Overview；永久可返回 | approved | 使用者／2026-07-19 |
| D6 | 三步Overview＋離線手冊；不加tour/coach-mark | approved | 使用者／2026-07-19 |
| G1 | Fishbone移出primary tab，改Reader Minimap＋Session Map | approved | 使用者／2026-07-19 |
| G2 | Minimap只做方位與開圖；精確跳轉在Map | approved | 使用者／2026-07-19 |
| G3 | 預設M、可停用、editable時停用、另有可見按鈕 | approved | 使用者／2026-07-19 |
| G4 | 第一版沿用現有SVG，不新增map library | approved | 使用者／2026-07-19 |
| T1 | PrimaryView與SessionOrigin成為store顯式契約 | approved-technical | Codex／2026-07-19；可逆且實作必要 |
| T2 | Structure drawer與Session Map使用native dialog | approved-technical | Codex／2026-07-19；降低自製focus trap風險 |
| T3 | `<720`窄版、720本身屬persistent desktop | approved-technical | Codex／2026-07-19；忠實實現D4 |
| T4 | 地圖採固定semantic levels＋scroll/pan，不實作任意camera | approved-technical | Codex／2026-07-19；G4最小可維護版本 |

待決策：**無**。若施工中出現新的UX語意分岔，先新增pending決策並停止相關卡；不得把推薦值寫進Change後直接實作。

## 13. 證據來源（非規範）

- DIT 自身：`RPD_DIT_v0.1.md` 的任務後複盤、左樹右內容、step-through與一分鐘骨架目標。
- [VS Code Welcome page](https://code.visualstudio.com/docs/getstarted/personalize-vscode#welcome-page)
- [VS Code Walkthroughs](https://code.visualstudio.com/api/ux-guidelines/walkthroughs)
- [VS Code Sidebars](https://code.visualstudio.com/api/ux-guidelines/sidebars)
- [VS Code Minimap](https://code.visualstudio.com/docs/editing/userinterface#_minimap)
- [Chrome DevTools Performance navigation](https://developer.chrome.com/docs/devtools/performance/reference)
- [Xbox Accessibility Guideline 112](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112)
- [W3C Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts)
- [W3C Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WAI-ARIA Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
