/** 右側內容區：空狀態 / 錯誤 / 卡片清單 + 底部資料流提示。 */
import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { SpanCard } from "./SpanCard";
import { GroupCard } from "./GroupCard";

export function MainView(): ReactNode {
  const t = useT();
  const doc = useSessionStore((s) => s.doc);
  const viewItems = useSessionStore((s) => s.viewItems);
  const error = useSessionStore((s) => s.error);
  const warnings = useSessionStore((s) => s.warnings);

  if (!doc) {
    return (
      <main className="main-content">
        {error && <div className="error-banner">{error}</div>}
        <div className="empty-state">
          <h2>{t.main.emptyTitle}</h2>
          <p>
            {t.main.emptyBodyPrefix}
            <code>{t.main.emptyPath}</code>
            {t.main.emptyBodySuffix}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content">
      {error && <div className="error-banner">{error}</div>}
      {warnings.length > 0 && <div className="error-banner warn">{t.main.warnings(warnings)}</div>}

      {viewItems.map((item) =>
        item.type === "group" ? (
          <GroupCard key={item.id} itemId={item.id} group={item.group} nodes={item.nodes} />
        ) : (
          <SpanCard key={item.id} itemId={item.id} node={item.node} />
        ),
      )}

      <div className="info-box">
        <strong>{t.main.infoTitle}</strong>
        <p>{t.main.infoBody}</p>
        <div className="flow">{t.main.flow}</div>
      </div>
    </main>
  );
}
