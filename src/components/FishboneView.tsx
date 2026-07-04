/**
 * 認知學習模式：魚骨橫向蒸餾視圖。
 * 主線 (spine) 橫向延伸；支線 (rib) 掛在節點下；有講解時於節點上方顯示「可帶走的觀念」。
 * 點任一節點/支線 → 下方詳情面板展開該節點的完整卡片 (重用 SpanCard/GroupCard) = drill-down。
 */
import { useMemo, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { buildFishbone, type FishboneStation } from "@/core/view/fishbone";
import type { ViewItem } from "@/core/view/viewModel";
import { SKELETON_NODE_META, SKELETON_RIB_META } from "./labels";
import { SpanCard } from "./SpanCard";
import { GroupCard } from "./GroupCard";

function DetailCard({ item }: { item: ViewItem }): ReactNode {
  return item.type === "group" ? (
    <GroupCard itemId={item.id} group={item.group} nodes={item.nodes} />
  ) : (
    <SpanCard itemId={item.id} node={item.node} />
  );
}

function Station({
  station,
  activeId,
  playingId,
  lesson,
  onSelect,
}: {
  station: FishboneStation;
  activeId: string | null;
  playingId: string | null;
  lesson?: string;
  onSelect: (id: string) => void;
}): ReactNode {
  const meta = SKELETON_NODE_META[station.kind];
  const isActive = activeId === station.viewItemId;
  const isPlaying = playingId === station.viewItemId;

  return (
    <div className="fb-station" role="listitem">
      <div className="fb-concept">
        {lesson && (
          <div className="fb-lesson" title={lesson}>
            💡 {lesson}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`fb-node ${meta.cls} ${isPlaying ? "playing" : isActive ? "active" : ""}`}
        onClick={() => onSelect(station.viewItemId)}
        aria-pressed={isActive}
        aria-label={`${meta.label}：${station.label}`}
      >
        <span className="fb-pill">
          <span className="fb-icon" aria-hidden="true">
            {meta.icon}
          </span>
          <span className="fb-kind">{meta.label}</span>
        </span>
        <span className="fb-label">{station.label}</span>
      </button>

      <div className="fb-ribs">
        {station.ribs.map((rib, i) => {
          const rm = SKELETON_RIB_META[rib.kind];
          return (
            <button
              key={`${rib.viewItemId}-${i}`}
              type="button"
              className={`fb-rib ${rm.cls} ${activeId === rib.viewItemId ? "active" : ""}`}
              onClick={() => onSelect(rib.viewItemId)}
              aria-label={`${rm.label}：${rib.label}`}
            >
              <span aria-hidden="true">{rm.icon}</span>
              <span className="fb-rib-label">{rib.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FishboneView(): ReactNode {
  const doc = useSessionStore((s) => s.doc);
  const viewItems = useSessionStore((s) => s.viewItems);
  const activeId = useSessionStore((s) => s.activeId);
  const playingId = useSessionStore((s) => s.playingId);
  const setActive = useSessionStore((s) => s.setActive);
  const clearSelection = useSessionStore((s) => s.clearSelection);
  const annotations = useSessionStore((s) => s.annotations);

  const stations = useMemo(() => (doc ? buildFishbone(doc, viewItems) : []), [doc, viewItems]);
  const activeItem = useMemo(() => viewItems.find((v) => v.id === activeId), [viewItems, activeId]);

  if (!doc) return null;

  if (!doc.skeleton || stations.length === 0) {
    return (
      <main className="main-content">
        <div className="empty-state">
          <h2>此 session 無法蒸餾出主線</h2>
          <p>可能是事件太少或型別不足。切到「高密度」模式仍可逐步檢視全部內容。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content cognitive">
      <div className="cog-intro">
        <h2 className="cog-title">主線：把 {doc.spans.length} 步蒸餾成 {stations.length} 個關鍵節點</h2>
        <div className="cog-legend">
          <span>🎯 目標</span>
          <span>✦ 決策</span>
          <span>🏁 結果</span>
          <span className="sep">｜支線：</span>
          <span>🔍 取證</span>
          <span>⚠ 錯誤</span>
          <span>↻ 重試</span>
          <span>✎ 反覆修改</span>
        </div>
      </div>

      <div className="fishbone" role="region" aria-label="任務主線魚骨圖（可橫向捲動）">
        <div className="fb-track" role="list">
          <div className="fb-spine" aria-hidden="true" />
          {stations.map((st) => (
            <Station
              key={st.viewItemId}
              station={st}
              activeId={activeId}
              playingId={playingId}
              lesson={annotations[st.viewItemId]?.generalLesson}
              onSelect={setActive}
            />
          ))}
        </div>
      </div>

      <div className="cog-detail">
        <div className="cog-detail-head">
          <span>節點詳情（點上方節點或支線展開）</span>
          {activeItem && (
            <button type="button" className="cog-reset" onClick={clearSelection}>
              清除選取
            </button>
          )}
        </div>
        {activeItem ? (
          <DetailCard item={activeItem} />
        ) : (
          <div className="empty-state" style={{ height: "auto", padding: "30px 0" }}>
            <p>點上方任一節點，這裡會展開它「原本發生的內容」（已整理成卡片）。</p>
          </div>
        )}
      </div>
    </main>
  );
}
