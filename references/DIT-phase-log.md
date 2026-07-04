# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 1 – 構想評估與需求定稿
- Status: completed
- Date: 2026-06-25
- Detail: docs/RPD_DIT_v0.1.md

## Goals
- 評估「把 AI agent 執行軌跡轉成可學習節點」的可行性並定稿需求。

## Decisions
- 可行性高：Claude Code 已有結構化 .jsonl transcript，輸入端幾乎免費。
- 採 Span Tree 為核心資料契約；視圖與資料解耦（上層可多視圖）。
- D-1 MVP 直上 Vite+React+TS（不做原生單頁過渡）。
- D-2 Lobby 嵌入由使用者後處理。
- D-3 隱私「方便優先 + 使用者知情選擇」，需責任說明。
- D-4 講解 Provider 本地 Ollama 優先、雲端可插拔。
- D-5 多 session/技能庫擱置但架構預留。

## Changes
- docs/RPD_DIT_v0.1.md: RPD v0.2（決策鎖定 + 工程準則）。
- docs/demo/concept_demo.html: 雙欄概念展示頁（純溝通）。

## Open Questions / TODO
- 後續以 Vite+React 實作；魚骨視圖待規劃。

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 2 – MVP 骨架（高密度模式 + 後端蒸餾 + 清亮換膚）
- Status: completed
- Date: 2026-06-25
- Detail: docs/architecture.md

## Goals
- 把 .jsonl 解析、降噪、結構化呈現為可互動的高密度卡片時間軸，並建立後端整理與清亮 UI。

## Decisions
- 分層管線：Adapter → Normalizer → Denoiser → Distiller → Validate → ViewModel；UI 只碰 Zustand store（低耦合）。
- 降噪走確定性規則（milestone/error/retry/decision、edit-loop 群組），不靠 LLM。
- 後端新增 DistilledSkeleton（spine/rib，preset v1，view-agnostic）供未來魚骨共用。
- 配色從 dark 改清亮 light（使用者明確要求，嫌 dark 像 SaaS）；tokens 集中於 :root 便於日後換膚。
- LLMProvider 介面：none(預設零外傳)/ollama(本地真實 fetch)/cloud(樁)。

## Changes
- src/types/spanTree.ts: Span Tree + DistilledSkeleton 型別。
- src/core/{adapters,normalize,denoise,distill,validate,view,llm}/, pipeline.ts: 核心管線。
- src/store/sessionStore.ts: 狀態（載入/Provider/重播/講解）。
- src/components/*, src/styles/index.css: 高密度 UI 與清亮主題。
- src/fixtures/sampleSession.jsonl: 內建範例（修 Todo bug）。

## Open Questions / TODO
- 認知/魚骨前端（吃 skeleton）尚未做 → Phase 3。

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 3 – 認知模式（魚骨）+ 系統檢查
- Status: completed（已交付，待使用者實機驗收）
- Date: 2026-06-25
- Detail: docs/REVIEW_2026-06-25.md

## Goals
- 實作橫向魚骨「認知學習模式」，吃後端 skeleton；對照 backend/frontend 檢查清單做系統檢查。

## Decisions
- 魚骨吃 doc.skeleton；主線(spine) 橫向 + 支線(rib) 掛載；節點/支線點擊 drill-down 重用既有 SpanCard/GroupCard。
- 雙模式可切換（cognitive/dense），預設 cognitive。
- phase-log 採兩層：精簡索引 + Detail 連既有 docs，不重複內容（本次 checkpoint 即採此法）。
- 檢查中修掉 3 個韌性缺口：Ollama 逾時(AbortController)、檔案讀取 onerror、輸入過大軟警告。

## Changes
- src/core/view/fishbone.ts, src/components/FishboneView.tsx: 魚骨視圖。
- src/store/sessionStore.ts, src/components/Header.tsx, src/App.tsx: viewMode 切換。
- src/core/llm/ollama.ts, src/components/Header.tsx, src/core/pipeline.ts: 韌性修正。
- docs/REVIEW_2026-06-25.md, docs/ACCEPTANCE.md, docs/BACKLOG.md, docs/PROGRESS.md: 檢查報告/驗收單/待辦/進度。

## Open Questions / TODO
- 目前所屬 phase：Phase 3 已完成交付，**正處於等待使用者實機驗收的邊界**；驗收結果決定下一步。
- Phase 4 候選（見 docs/BACKLOG.md）：接本地 Ollama 實測講解品質、響應式/行動版、大檔虛擬化、自動化測試、雲端 Provider 實作、魚骨上方「觀念 rib」需講解層產生。
