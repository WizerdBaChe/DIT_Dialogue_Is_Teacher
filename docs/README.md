# docs/ 索引

這份索引不是新的文件內容，只是幫忙找路——實際決策紀錄仍在下面列的各檔案裡，這裡不重複、不摘要。

## 核心與活文件（隨時效期更新，永遠在 `docs/` 根目錄）

| 檔案 | 用途 |
|---|---|
| [RPD_DIT_v0.1.md](RPD_DIT_v0.1.md) | 最初的需求與決策文件（D-1～D-5），改動核心方向前先回去看這份 |
| [PSM_DIT_v1.0.md](PSM_DIT_v1.0.md) | 接手實作 AI 的單一施工入口：契約定稿、ADR 紀錄 |
| [architecture.md](architecture.md) | 架構與資料流的權威說明（as-built） |
| [PROGRESS.md](PROGRESS.md) | 逐里程碑的開發紀錄，新進度往上加 |
| [BACKLOG.md](BACKLOG.md) | 已決定但還沒做的事項，待辦來源 |
| [ACCEPTANCE.md](ACCEPTANCE.md) | 實機驗收清單，改完功能對照這份手測 |
| [USER_GUIDE.md](USER_GUIDE.md) | 使用手冊（離線查閱用，非唯一入口） |

## `rounds/` — 按開發輪次分類的設計/驗收文件

每個子資料夾對應一輪已完成（或部分完成）的工作；輪次內部彼此的順序與依賴關係，請看各輪自己的 PSM 開頭「定位」段。

| 資料夾 | 主題 | 內含文件類型 |
|---|---|---|
| [r1-test-foundation/](rounds/r1-test-foundation/) | 專案起步：git init、測試地基 | 施工開場 prompt |
| [r2-ollama-uat/](rounds/r2-ollama-uat/) | 本地 Ollama 講解品質驗收 | 兩輪 UAT 報告 |
| [r3-analysis-runtime/](rounds/r3-analysis-runtime/) | 分析執行層（Privacy Gateway、Batch controller、RuntimeController） | 子系統 PSM ×2 |
| [r5-guided-navigation/](rounds/r5-guided-navigation/) | 導引式導航：Overview/Reader/Subagents 主視角、Session Map | 概念評估、PSM ×3、量測基線 |
| [r5.5-semantic-alignment/](rounds/r5.5-semantic-alignment/) | R5 UAT 後的語意/文案補強 | PSM |
| [r6-export/](rounds/r6-export/) | JSON／靜態 HTML 快照匯出 | PSM |
| [r6.5-layout-scale/](rounds/r6.5-layout-scale/) | 版面與字級縮放整治 | PSM、量測基線 |
| [r7-multi-source-and-layout/](rounds/r7-multi-source-and-layout/) | Codex 多來源接入 + 設定對話框改版 + 六軌版面 | 基礎設計 ×2、PSM、施工開場 prompt、量測基線 ×2（Part A／Part B） |
| [r7.5-codex-noise-and-settings-card/](rounds/r7.5-codex-noise-and-settings-card/) | Codex 雜訊降噪 + 設定卡片式重排 | PSM、量測基線 |

需要知道「現在整體進度到哪一輪」，看根目錄的 [PROGRESS.md](PROGRESS.md)，不要靠猜資料夾名稱推斷。

## 其他

| 位置 | 內容 |
|---|---|
| [concepts/](concepts/) | 尚未立項的未來產品構想（目前只有一份：概念演化軌跡 CET，見內文「啟動硬條件」） |
| [misc/](misc/) | 不屬於任何單一輪次的一次性檢查報告 |
| [demo/](demo/) | 靜態展示素材（非文件） |

## 之後新增一輪時

新開一個 `rounds/rN-一句話主題/` 資料夾放該輪的 PSM／設計文件／量測基線，並在上面的表格加一列——不要把新文件丟在 `docs/` 根目錄，根目錄只留「核心與活文件」表列的那 7 份。
