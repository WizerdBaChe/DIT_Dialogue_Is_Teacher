# 編輯式工作區調整 (Editorial Workspace)

輪次：2026-09-editorial-workspace。狀態：施工完成後待視覺驗收 (visual acceptance)，不以綠燈建置代替作者判定。

## 邊界與決策 (Boundary and decision charter)

使用者授權自行決定 UI/UX 變化，保留既有風格。沿用暖紙色、襯線字、暗紅與細線；首頁讓主要閱讀動作先出現，載入來源成為獨立區塊，導讀採三欄／窄版直列。閱讀頁顯示常駐標題與選取位置，限制超寬文字行長。來源探索、診斷分級、快照唯讀、阻斷面與虛擬化契約不變。

採速寫 (Sketch) 規模，擴充現有 React 元件與 CSS；現有 Zustand、TanStack Virtual 已承接狀態與長列表，沒有新增套件。環境為 Windows、Vite、本地瀏覽器與單檔 HTML 快照。新介面只消費現有狀態，不增加持久化、網路傳輸或不可信內容的 HTML 注入。分支從原先的 compact-chain 工作分支建立，保留其既有內容。

## Work cards

- EW-01: Recompose OverviewView into lead/action, source panel and responsive guide columns. Preserve diagnostics disclosure, source selection order and snapshot restrictions.
- EW-02: Add a persistent reader heading using the existing position selector. Expose the selected sidebar step with aria-current. Preserve virtual rows and replay behavior.
- EW-03: Extend the existing CSS tokens with scoped editorial layouts, bounded reading width and visible keyboard focus. Validate Chinese/English, desktop/mobile and existing automated checks.

## 介面、失敗與回復 (Interfaces, failures and rollback)

涉及 OverviewView.tsx、MainView.tsx、Sidebar.tsx、styles/index.css。沿用 useT、startReading、SessionLoadActions 與 selectCurrentPosition。沒有文件時沿用空狀態；無選取位置顯示破折號；快照不渲染載入區。回復時撤回本輪四個介面檔案變更，無資料遷移。

## 驗證 (Verification)

執行 npm.cmd test、npm.cmd run typecheck、npm.cmd run build、npm.cmd run check:rounds、git diff --check。人工卡見同輪 UAT；最終測試結果由交付訊息記錄，作者尚未驗收不得標示完成結案。
