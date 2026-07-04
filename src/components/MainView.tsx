/** 右側內容區：空狀態 / 錯誤 / 卡片清單 + 底部資料流提示。 */
import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { SpanCard } from "./SpanCard";
import { GroupCard } from "./GroupCard";

export function MainView(): ReactNode {
  const doc = useSessionStore((s) => s.doc);
  const viewItems = useSessionStore((s) => s.viewItems);
  const error = useSessionStore((s) => s.error);
  const warnings = useSessionStore((s) => s.warnings);

  if (!doc) {
    return (
      <main className="main-content">
        {error && <div className="error-banner">⚠ {error}</div>}
        <div className="empty-state">
          <h2>載入一個 Claude Code session</h2>
          <p>
            點右上「載入 .jsonl」選擇 <code>~/.claude/projects/&lt;專案&gt;/*.jsonl</code> 中的任一 session，
            DIT 會把它整理成可學習的節點。也可載入內建範例先看效果。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content">
      {error && <div className="error-banner">⚠ {error}</div>}
      {warnings.length > 0 && (
        <div className="error-banner" style={{ borderColor: "var(--accent-secondary)", color: "#92400e", background: "rgba(217,119,6,0.08)" }}>
          解析提示（{warnings.length}）：{warnings.slice(0, 3).join("；")}
          {warnings.length > 3 && " …"}
        </div>
      )}

      {viewItems.map((item) =>
        item.type === "group" ? (
          <GroupCard key={item.id} itemId={item.id} group={item.group} nodes={item.nodes} />
        ) : (
          <SpanCard key={item.id} itemId={item.id} node={item.node} />
        ),
      )}

      <div className="info-box">
        <strong>💡 這是怎麼來的</strong>
        <p>
          原始 transcript 經過解析、正規化成 Span Tree、確定性降噪分組後渲染為上方節點。可切換右上「講解來源」加上逐節點教學，或用 ▶ 重播逐步走過整段任務。
        </p>
        <div className="flow">原始 .jsonl ─→ Adapter ─→ Span Tree ─→ 降噪/分組 ─→ [講解] ─→ 視圖</div>
      </div>
    </main>
  );
}
