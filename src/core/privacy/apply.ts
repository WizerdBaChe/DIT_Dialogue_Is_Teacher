/**
 * 遮蔽套用的共用實作：重疊解析 + 依 offset 切片替換。
 *
 * 這段邏輯只能有一份。findings 是**以 offset 消費**的——切錯位置就等於遮到標籤、把憑證留在
 * 輸出裡（見 detectors.ts 對 match.indices 的說明）。gateway 的外傳流程與匯出的遮蔽流程共用
 * 這裡，任何一邊都不得自己重寫一份。
 */
import { PrivacyError, type PrivacyAction, type PrivacyFinding, type SensitiveKind } from "./contracts";

export interface AppliedFinding extends PrivacyFinding {
  action: PrivacyAction;
}

/**
 * 佔位符的編號狀態。
 *
 * 單次呼叫可以不帶 (gateway 的用法：一段文字自成一個世界)；但把一份文件拆成多段分別遮蔽時
 * 必須共用同一份狀態，否則同一個信箱在第 1 輪叫 `<EMAIL_1>`、第 5 輪又變成 `<EMAIL_1>` 但
 * 指的是別人——讀的人無從分辨。
 */
export interface RedactionState {
  counters: Map<SensitiveKind, number>;
  /** `${kind}\0${原文}` → 佔位符；同一個值在整份文件裡永遠對到同一個編號。 */
  replacements: Map<string, string>;
}

export function createRedactionState(): RedactionState {
  return { counters: new Map(), replacements: new Map() };
}

/** `applyFindings` 產生的佔位符格式，例如 `<SECRET_1>`、`<IP_ADDRESS_2>`。 */
const PLACEHOLDER_RE = /^<[A-Z]+(?:_[A-Z]+)*_\d+>$/;

/**
 * 判斷一段文字是不是我們自己塞進去的佔位符。
 *
 * 遮蔽後的事後複查需要這個：`postgres://admin:<SECRET_1>@host` 會再次命中連線字串規則，
 * 捕捉到的「密碼」正是剛才那個佔位符。不濾掉的話，幾乎每份含連線字串的檔案都會跳出
 * 「仍疑似含密鑰」——警告一旦常態誤報就等於沒有警告。
 */
export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_RE.test(value);
}

function actionPriority(action: PrivacyAction): number {
  return { block: 4, redact: 3, replace: 2, keep_review: 1 }[action];
}

/**
 * 密鑰永遠排在其他類別前面，**與政策指派的動作無關**。
 *
 * 不能只靠 action 排序：外傳政策把密鑰判成 block (優先級 4) 所以它自然贏，但匯出政策為了
 * 「不能擋住整份檔案」把密鑰降成 replace，就跟 email 這類同樣是 replace 的類別打平了。
 * 一打平就換成「範圍較長者勝」——`postgres://admin:密碼@db.internal` 裡，email 規則命中的
 * `密碼@db.internal` 比密鑰規則命中的 `密碼` 長，於是主機名被一起吃掉、還被標成信箱。
 * 密鑰是最該由密鑰規則自己處理的東西，排序上就先把它定住，別讓政策的取捨動搖它。
 */
function kindPriority(finding: AppliedFinding): number {
  return finding.kind === "secret" ? 1 : 0;
}

/**
 * 重疊的 findings 只留一個：密鑰優先，其次動作越強、範圍越大、信心越高者優先。
 * 兩個同級同動作同信心又互不包含的範圍無法自動裁決，直接拋錯要求人工處理，不猜。
 */
export function resolveOverlaps(findings: AppliedFinding[]): AppliedFinding[] {
  const sorted = [...findings].sort((a, b) =>
    kindPriority(b) - kindPriority(a)
    || actionPriority(b.action) - actionPriority(a.action)
    || (b.end - b.start) - (a.end - a.start)
    || b.confidence - a.confidence
    || a.start - b.start,
  );
  const accepted: AppliedFinding[] = [];
  for (const finding of sorted) {
    const overlap = accepted.find((item) => finding.start < item.end && finding.end > item.start);
    if (!overlap) {
      accepted.push(finding);
      continue;
    }
    const contained = finding.start >= overlap.start && finding.end <= overlap.end;
    // 級別不同代表勝負早已由 kindPriority 定案，不是「無法裁決」，不該拋錯。
    const sameRank = kindPriority(finding) === kindPriority(overlap);
    if (!contained && sameRank && finding.action === overlap.action && finding.confidence === overlap.confidence) {
      throw new PrivacyError("PRIVACY_AMBIGUOUS_OVERLAP", "Sensitive ranges overlap and require manual review.");
    }
  }
  return accepted.sort((a, b) => a.start - b.start);
}

export interface AppliedText {
  text: string;
  summary: Partial<Record<SensitiveKind, number>>;
}

/**
 * 分兩趟：
 * 1. 依**閱讀順序**配佔位符編號，`<EMAIL_1>` 才會是文件裡第一個出現的信箱。若省掉這趟、
 *    直接在替換迴圈裡配號，編號會跟著替換方向倒著跑（讀到的是 `<EMAIL_2> 與 <EMAIL_1>`）。
 * 2. 由**後往前**替換，前面的 offset 才不會被前一次替換的長度變化推移。
 *
 * `keep_review` 只記入統計、不動文字。
 */
export function applyFindings(
  input: string,
  findings: AppliedFinding[],
  state: RedactionState = createRedactionState(),
): AppliedText {
  const summary: Partial<Record<SensitiveKind, number>> = {};
  const inReadingOrder = [...findings].sort((a, b) => a.start - b.start);
  const mappingKey = (finding: AppliedFinding) => `${finding.kind}\0${input.slice(finding.start, finding.end)}`;

  for (const finding of inReadingOrder) {
    summary[finding.kind] = (summary[finding.kind] ?? 0) + 1;
    if (finding.action !== "replace") continue;
    const key = mappingKey(finding);
    if (state.replacements.has(key)) continue;
    const index = (state.counters.get(finding.kind) ?? 0) + 1;
    state.counters.set(finding.kind, index);
    state.replacements.set(key, `<${finding.kind.toUpperCase()}_${index}>`);
  }

  let text = input;
  for (let i = inReadingOrder.length - 1; i >= 0; i -= 1) {
    const finding = inReadingOrder[i];
    if (finding.action === "keep_review") continue;
    const replacement = finding.action === "replace" ? state.replacements.get(mappingKey(finding)) ?? "" : "";
    text = `${text.slice(0, finding.start)}${replacement}${text.slice(finding.end)}`;
  }
  return { text, summary };
}
