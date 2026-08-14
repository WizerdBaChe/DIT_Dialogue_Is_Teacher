import { useMemo, type ReactNode } from "react";
import { buildGlobalSessionMapProjection } from "@/core/view/sessionMap";
import { reportFallback } from "@/core/diagnostics";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

interface ReaderMinimapProps {
  visibleStart: number;
  visibleEnd: number;
}

const WIDTH = 176;
const HEIGHT = 112;
const TRACK_LEFT = 12;
const TRACK_WIDTH = WIDTH - TRACK_LEFT * 2;
const AXIS_Y = 56;
/** 密度分桶數：一桶約 4px，大 session 才不會退化成一片黑點。LS-05：CSS 尺寸放大 1.5x 後同步調整。 */
const BUCKETS = 57;
/** 密度條的半高（以軸為中心上下對稱）；最高 11 → 全高 22px，約佔元件高度的 20%。 */
const MIN_HALF_BAR = 2;
const MAX_HALF_BAR = 11;

export function ReaderMinimap({ visibleStart, visibleEnd }: ReaderMinimapProps): ReactNode {
  const t = useT();
  const doc = useSessionStore((state) => state.doc);
  const viewItems = useSessionStore((state) => state.viewItems);
  const activeId = useSessionStore((state) => state.activeId);
  const playingId = useSessionStore((state) => state.playingId);
  const minimapEnabled = useSessionStore((state) => state.minimapEnabled);
  const openMap = useSessionStore((state) => state.openMap);
  const selectedId = playingId ?? activeId;
  const projection = useMemo(
    () => doc ? buildGlobalSessionMapProjection(doc, viewItems, selectedId) : null,
    [doc, selectedId, viewItems],
  );

  /**
   * 地標密度，一律用「真實 viewItems 索引」分桶。
   * 舊版把地標按陣列索引等距鋪開，導致一個涵蓋數百項的聚合跟一個單一地標佔一樣寬 ——
   * 而同一張圖上的位置圓點與可見範圍框用的卻是真實索引，兩套座標互相矛盾。
   */
  const buckets = useMemo(() => {
    if (!projection || viewItems.length === 0) return null;
    const indexById = new Map(viewItems.map((item, index) => [item.id, index]));
    const counts = new Array<number>(BUCKETS).fill(0);
    for (const target of projection.targets) {
      const ids = target.type === "landmark" ? [target.viewItemId] : target.sourceViewItemIds;
      for (const id of ids) {
        const index = indexById.get(id);
        if (index === undefined) {
          reportFallback("readerMinimap/density", "target-not-in-view-model", { id, targetId: target.id });
          continue;
        }
        counts[Math.min(BUCKETS - 1, Math.floor((index / viewItems.length) * BUCKETS))] += 1;
      }
    }
    return counts;
  }, [projection, viewItems]);

  if (!minimapEnabled || !projection || projection.targets.length === 0 || !buckets) return null;
  const denominator = Math.max(1, viewItems.length - 1);
  const positionX = (index: number): number => TRACK_LEFT + (index / denominator) * TRACK_WIDTH;
  /*
   * R9.1 RC-C：紅點與密度長條必須出自**同一份投影**。
   *
   * 原本密度是從 `projection.targets` 算的、紅點卻是從 `viewItems.findIndex` 算的——兩套
   * 座標系。當投影裡根本沒有這個項目時（例如只載到子代理紀錄、骨架退化成開始與結束兩站），
   * 時間軸上仍然找得到索引，於是紅點被畫在一段沒有任何節點的線尾，宣稱了一個投影不承認的位置。
   * 改為先讓投影認領：投影放不下它，就不畫點。
   */
  const projectedIds = new Set(projection.targets.flatMap((target) => (
    target.type === "landmark" ? [target.viewItemId] : target.sourceViewItemIds
  )));
  const currentIndex = selectedId && projectedIds.has(selectedId)
    ? viewItems.findIndex((item) => item.id === selectedId)
    : -1;
  const currentX = currentIndex >= 0 ? positionX(currentIndex) : null;
  const viewportX = positionX(Math.max(0, visibleStart));
  const viewportEndX = positionX(Math.max(visibleStart, visibleEnd));
  const peak = Math.max(1, ...buckets);
  const bucketWidth = TRACK_WIDTH / BUCKETS;
  /**
   * 地標密度以軸為中心上下對稱、刻意壓低高度；可見範圍則是上下貫穿的淡色底塊。
   * 兩者都因為元件只有 176px 寬而必須有最小尺寸下限，所以靠「小刻度 vs 大底塊」區分，不能靠大小接近的形狀。
   */
  const densityPath = buckets
    .map((count, index) => {
      if (count === 0) return "";
      const halfHeight = MIN_HALF_BAR + (count / peak) * (MAX_HALF_BAR - MIN_HALF_BAR);
      const x = TRACK_LEFT + index * bucketWidth;
      const width = Math.max(1.5, bucketWidth - 1);
      return `M ${x} ${AXIS_Y - halfHeight} h ${width} v ${halfHeight * 2} h -${width} z`;
    })
    .join(" ");

  return (
    <button
      type="button"
      className="reader-minimap"
      /*
       * R9.1 RC-G：這些長條是「每一段有幾個地標」的密度，而且是以這份 session 自己的
       * 最高值正規化的——所以同一種節點在不同 session 會有不同長度。這件事程式碼註解寫得
       * 很清楚，卻從來沒有傳到使用者眼前，於是長條被讀成節點、長度被讀成分類差異。
       * 編碼要說在被讀到的地方：可見標題 + aria-label 各說一次。
       */
      aria-label={t.map.minimapDensityLabel}
      title={t.map.minimapDensityLabel}
      aria-haspopup="dialog"
      aria-controls="session-map-dialog"
      data-label={t.map.youAreHere}
      data-caption={t.map.minimapDensityCaption}
      onClick={openMap}
    >
      <svg aria-hidden="true" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        {/* 可見範圍畫在最底層、上下貫穿且無外框，才不會被誤讀成一個地標節點。 */}
        <rect
          x={viewportX}
          y={10}
          width={Math.max(4, viewportEndX - viewportX)}
          height={HEIGHT - 20}
          fill="rgba(124,33,40,.10)"
        />
        <path d={`M ${TRACK_LEFT} ${AXIS_Y} H ${WIDTH - TRACK_LEFT}`} fill="none" stroke="#c3bcab" strokeWidth={1.5} />
        <path d={densityPath} fill="#4f4a41" fillOpacity={0.75} />
        {currentX !== null && <circle cx={currentX} cy={AXIS_Y} r={5} fill="#7c2128" stroke="#eee8dd" strokeWidth={2} />}
      </svg>
    </button>
  );
}
