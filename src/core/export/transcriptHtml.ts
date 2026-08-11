/**
 * 逐字稿 → 自足單檔 HTML (純函式)。
 *
 * 與既有的 HTML 快照 (snapshotTemplate.ts) 是兩種不同的東西，不要混淆：
 * - 快照內聯整個主應用，可還原成完整節點視圖，需要 production build 才拿得到模板。
 * - 這裡產出的是「只有左側資訊欄 + 對話檢視區」的閱讀頁：沒有功能列、沒有 map、沒有任何
 *   設定，也**完全不含 JavaScript**——目錄用錨點連結就夠了。因此不需要模板、不需要 build，
 *   dev 模式下也能匯出。
 *
 * 安全性：所有來自 session 的文字一律經 `escapeHtml`。頁面本身無腳本，CSP 直接禁掉 script。
 */
import type { TranscriptExport, TranscriptLabels, TranscriptMessage, TranscriptTurn } from "./contracts";
import { collapseBlankLines, formatDateTime, formatTime, redactionSummaryText } from "./transcriptFormat";

export interface TranscriptHtmlOptions {
  /** `<html lang>`：跟著介面語言走 (zh-TW / en)。 */
  lang: string;
}

const OUTLINE_LABEL_MAX = 64;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * 依 ``` 圍籬把內文切成一般段落與程式碼段。
 *
 * 這不是 Markdown 渲染器，也不打算變成一個——只處理圍籬，好讓程式碼用等寬字顯示。
 * 其餘一律以 `white-space: pre-wrap` 原樣呈現：逐字稿的重點是保真，不是排版重製。
 * 未閉合的圍籬視為延伸到結尾，不丟內容。
 */
function splitFences(text: string): Array<{ code: boolean; lang: string; text: string }> {
  const segments: Array<{ code: boolean; lang: string; text: string }> = [];
  const fence = /^```([^\n`]*)\n?([\s\S]*?)(?:^```[ \t]*$|$)/m;
  let rest = text;

  while (rest) {
    const start = rest.search(/^```/m);
    if (start === -1) break;
    const before = rest.slice(0, start);
    if (before.trim()) segments.push({ code: false, lang: "", text: before.replace(/\n+$/, "") });

    const match = fence.exec(rest.slice(start));
    if (!match) break;
    segments.push({ code: true, lang: match[1].trim(), text: match[2].replace(/\n+$/, "") });
    rest = rest.slice(start + match[0].length).replace(/^\n+/, "");
  }
  if (rest.trim()) segments.push({ code: false, lang: "", text: rest });
  return segments.length > 0 ? segments : [{ code: false, lang: "", text }];
}

function renderBody(text: string): string {
  return splitFences(collapseBlankLines(text))
    .map((segment) => (segment.code
      ? `<pre class="tx-code"${segment.lang ? ` data-lang="${escapeHtml(segment.lang)}"` : ""}><code>${escapeHtml(segment.text)}</code></pre>`
      : `<p class="tx-text">${escapeHtml(segment.text)}</p>`))
    .join("\n");
}

/** 連續工具摘要併成一列，與 Markdown 渲染器的處理一致。 */
function groupMessages(messages: TranscriptMessage[]): Array<TranscriptMessage | TranscriptMessage[]> {
  const out: Array<TranscriptMessage | TranscriptMessage[]> = [];
  for (const message of messages) {
    if (message.kind !== "tool_summary") {
      out.push(message);
      continue;
    }
    const tail = out[out.length - 1];
    if (Array.isArray(tail)) tail.push(message);
    else out.push([message]);
  }
  return out;
}

function outlineLabel(turn: TranscriptTurn, labels: TranscriptLabels): string {
  const source = turn.user?.text ?? turn.messages[0]?.text ?? "";
  const line = source.replace(/\s+/g, " ").trim();
  if (!line) return labels.openingTurnHeading;
  return line.length > OUTLINE_LABEL_MAX ? `${line.slice(0, OUTLINE_LABEL_MAX)}…` : line;
}

function renderMessage(entry: TranscriptMessage | TranscriptMessage[], labels: TranscriptLabels): string {
  if (Array.isArray(entry)) {
    const summaries = entry.map((message) => message.text).filter(Boolean);
    if (summaries.length === 0) return "";
    const items = summaries.map((summary) => `<li>${escapeHtml(summary)}</li>`).join("");
    return `<div class="tx-tools"><span class="tx-tools-label">${escapeHtml(labels.roleToolActivity)}</span><ul>${items}</ul></div>`;
  }

  const body = renderBody(entry.text);
  if (!body) return "";
  const role = entry.kind === "thinking" ? labels.roleThinking
    : entry.kind === "subagent_prompt" ? labels.roleSubagentPrompt
    : labels.roleAssistant;
  const badge = entry.subagent && entry.kind !== "subagent_prompt"
    ? `<span class="tx-badge">${escapeHtml(labels.subagentBadge)}</span>`
    : "";
  return [
    `<article class="tx-msg tx-msg-${entry.kind}">`,
    `<p class="tx-role">${escapeHtml(role)}${badge}</p>`,
    `<div class="tx-body">${body}</div>`,
    "</article>",
  ].join("\n");
}

function renderTurn(turn: TranscriptTurn, labels: TranscriptLabels): string {
  const time = formatTime(turn.startedAt);
  const heading = turn.user ? labels.turnHeading(turn.index) : labels.openingTurnHeading;
  const parts = [
    `<section class="tx-turn" id="turn-${turn.index}">`,
    `<h2 class="tx-turn-head">${escapeHtml(heading)}${time ? `<span class="tx-turn-time">${escapeHtml(time)}</span>` : ""}</h2>`,
  ];
  if (turn.user) {
    const body = renderBody(turn.user.text);
    if (body) {
      parts.push(
        '<article class="tx-msg tx-msg-user">',
        `<p class="tx-role">${escapeHtml(labels.roleUser)}</p>`,
        `<div class="tx-body">${body}</div>`,
        "</article>",
      );
    }
  }
  for (const entry of groupMessages(turn.messages)) parts.push(renderMessage(entry, labels));
  parts.push("</section>");
  return parts.filter(Boolean).join("\n");
}

function renderMeta(transcript: TranscriptExport, labels: TranscriptLabels): string {
  const { session } = transcript;
  const rows: Array<[string, string]> = [[labels.fieldSession, session.id]];
  const source = [session.tool, session.model].filter(Boolean).join(" · ");
  if (source) rows.push([labels.fieldSource, source]);
  if (session.projectPath) rows.push([labels.fieldProject, session.projectPath]);
  const started = formatDateTime(session.startedAt);
  if (started) rows.push([labels.fieldStarted, started]);

  return rows
    .map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("\n");
}

function renderStats(transcript: TranscriptExport, labels: TranscriptLabels): string {
  const { stats, options } = transcript;
  const items: string[] = [
    labels.statTurns(stats.turns),
    labels.statUserMessages(stats.userMessages),
    labels.statAssistantMessages(stats.assistantMessages),
  ];
  if (stats.thinkingBlocks > 0) items.push(labels.statThinkingBlocks(stats.thinkingBlocks, options.includeThinking));
  if (stats.toolCalls > 0) items.push(labels.statToolCalls(stats.toolCalls, options.includeToolSummary));
  if (stats.excludedSubagentSpans > 0) items.push(labels.subagentsExcluded(stats.excludedSubagentSpans));
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

/** 遮蔽紀錄放在資訊欄，跟內容統計並列——它是這份檔案的性質，不是某一輪的註腳。 */
function renderRedaction(transcript: TranscriptExport, labels: TranscriptLabels): string {
  const { redaction } = transcript;
  if (!redaction) return "";
  const summary = redactionSummaryText(redaction.summary, labels.sensitiveKind);
  const note = `<p class="tx-redaction-note">${escapeHtml(labels.redactionNote(summary || labels.redactionNothingFound))}</p>`;
  const residual = redaction.residualSecretBlocks > 0
    ? `<p class="tx-redaction-warn">${escapeHtml(labels.redactionResidual(redaction.residualSecretBlocks))}</p>`
    : "";
  return `<div class="tx-redaction">${note}${residual}</div>`;
}

/**
 * 設計語彙沿用主應用的 editorial serif (ADR-015)：暖白紙面、ink 文字、hairline 細線、
 * 單一暗紅點綴、無陰影。此處為獨立副本而非匯入 index.css——閱讀頁必須單檔自足，
 * 且只需要主樣式表的一小部分。
 */
const STYLE = `
:root{
  --paper:#f6f3ec; --card:#fffdf8; --sunken:#efeadf;
  --ink:#1c1a17; --muted:#4f4a41; --faint:#857e70;
  --rule:#d9d3c6; --rule-strong:#c3bcab;
  --accent:#7c2128; --accent-tint:rgba(124,33,40,.08); --ochre:#8a6a2f;
  --serif:Georgia,Cambria,"Times New Roman","Songti TC","Noto Serif CJK TC","Source Han Serif TC",serif;
  --sans:Inter,system-ui,-apple-system,"Segoe UI","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei",sans-serif;
  --mono:ui-monospace,SFMono-Regular,Consolas,"Noto Sans Mono",monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--serif);font-size:15px;line-height:1.75;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.tx-shell{display:grid;grid-template-columns:clamp(240px,24vw,320px) minmax(0,1fr);min-height:100vh}

/* ---- 左側資訊欄 ---- */
.tx-panel{position:sticky;top:0;align-self:start;max-height:100vh;overflow-y:auto;background:var(--sunken);border-right:1px solid var(--rule-strong);padding:28px 22px 32px;display:flex;flex-direction:column;gap:22px}
.tx-eyebrow{font-family:var(--sans);font-size:10.5px;text-transform:uppercase;letter-spacing:.14em;color:var(--faint);font-weight:600}
.tx-title{font-size:19px;line-height:1.3;font-weight:600;letter-spacing:.01em;margin-top:6px;overflow-wrap:anywhere}
.tx-meta{display:flex;flex-direction:column;gap:9px;border-top:1px solid var(--rule);padding-top:16px}
.tx-meta dt{font-family:var(--sans);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--faint);font-weight:600}
.tx-meta dd{font-size:13px;color:var(--muted);overflow-wrap:anywhere;line-height:1.5}
.tx-stats{list-style:none;border-top:1px solid var(--rule);padding-top:16px;display:flex;flex-wrap:wrap;gap:4px 12px}
.tx-stats li{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.tx-redaction{border-top:1px solid var(--rule);padding-top:14px;display:flex;flex-direction:column;gap:6px}
.tx-redaction-note{font-size:12px;color:var(--muted);line-height:1.55}
.tx-redaction-warn{font-size:12px;line-height:1.55;color:var(--accent);border-left:2px solid var(--accent);padding-left:9px;background:var(--accent-tint)}
.tx-outline{border-top:1px solid var(--rule);padding-top:16px;min-height:0}
.tx-outline ol{list-style:none;margin-top:10px;display:flex;flex-direction:column}
.tx-outline a{display:grid;grid-template-columns:1.9em 1fr;gap:6px;padding:6px 8px 6px 4px;margin-left:-4px;color:var(--muted);text-decoration:none;border-radius:2px;font-size:13px;line-height:1.45}
.tx-outline a:hover{background:var(--accent-tint);color:var(--accent)}
.tx-outline-index{font-family:var(--sans);font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;padding-top:2px}
.tx-outline-text{overflow-wrap:anywhere}
.tx-foot{margin-top:auto;border-top:1px solid var(--rule);padding-top:14px;font-size:11.5px;color:var(--faint);line-height:1.6}

/* ---- 對話檢視區 ---- */
.tx-reader{padding:44px clamp(20px,5vw,64px) 96px;min-width:0}
.tx-turn{max-width:74ch;margin:0 auto 12px;padding-top:26px}
.tx-turn+.tx-turn{border-top:1px solid var(--rule);margin-top:26px}
.tx-turn-head{font-family:var(--sans);font-size:10.5px;text-transform:uppercase;letter-spacing:.14em;color:var(--faint);font-weight:600;display:flex;align-items:baseline;gap:10px}
.tx-turn-time{font-variant-numeric:tabular-nums;letter-spacing:.06em;color:var(--rule-strong)}
.tx-msg{margin-top:20px}
.tx-role{font-family:var(--sans);font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;font-weight:600;color:var(--faint);margin-bottom:7px;display:flex;align-items:center;gap:8px}
.tx-badge{font-size:9.5px;letter-spacing:.1em;color:var(--ochre);border:1px solid var(--rule-strong);border-radius:2px;padding:1px 5px;text-transform:uppercase}
.tx-body{display:flex;flex-direction:column;gap:12px}
.tx-text{white-space:pre-wrap;overflow-wrap:anywhere}

/* 使用者提問：紙卡 + 左側暗紅規線，是每一輪的起點 */
.tx-msg-user{background:var(--card);border:1px solid var(--rule);border-left:2px solid var(--accent);padding:16px 18px}
.tx-msg-user .tx-role{color:var(--accent)}
/* 思考：降一階對比並改用無襯線，與「說出口的話」在視覺上分開 */
.tx-msg-thinking{border-left:1px solid var(--rule-strong);padding-left:16px}
.tx-msg-thinking .tx-body{font-family:var(--sans);font-size:13.5px;color:var(--muted);line-height:1.7}
.tx-msg-subagent_prompt{border-left:2px solid var(--ochre);padding-left:16px}
.tx-msg-subagent_prompt .tx-role{color:var(--ochre)}

/* 工具活動：輔助說明，壓到最低視覺重量 */
.tx-tools{margin-top:16px;border-top:1px dashed var(--rule);padding-top:10px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
.tx-tools-label{font-family:var(--sans);font-size:9.5px;text-transform:uppercase;letter-spacing:.12em;color:var(--faint);font-weight:600}
.tx-tools ul{list-style:none;display:flex;flex-wrap:wrap;gap:4px 8px;min-width:0}
.tx-tools li{font-family:var(--mono);font-size:11.5px;color:var(--muted);overflow-wrap:anywhere}
.tx-tools li+li::before{content:"→";margin-right:8px;color:var(--rule-strong)}

.tx-code{background:var(--sunken);border:1px solid var(--rule);border-radius:2px;padding:12px 14px;overflow-x:auto;font-family:var(--mono);font-size:12.5px;line-height:1.65}
.tx-code code{white-space:pre}
.tx-empty{max-width:74ch;margin:0 auto;color:var(--muted)}

@media (max-width:760px){
  .tx-shell{grid-template-columns:minmax(0,1fr)}
  .tx-panel{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--rule-strong)}
  .tx-reader{padding:28px 20px 72px}
}
@media print{
  .tx-shell{display:block}
  .tx-panel{position:static;max-height:none;border:0;border-bottom:1px solid var(--rule-strong)}
  .tx-outline{display:none}
  .tx-reader{padding:24px 0}
  .tx-turn{break-inside:auto}
  .tx-msg{break-inside:avoid}
}
`;

export function renderTranscriptHtml(
  transcript: TranscriptExport,
  labels: TranscriptLabels,
  options: TranscriptHtmlOptions,
): string {
  const title = transcript.session.title || labels.sessionTitleFallback;
  const outline = transcript.turns
    .map((turn) => `<li><a href="#turn-${turn.index}"><span class="tx-outline-index">${turn.index}</span>`
      + `<span class="tx-outline-text">${escapeHtml(outlineLabel(turn, labels))}</span></a></li>`)
    .join("\n");
  const body = transcript.turns.length === 0
    ? `<p class="tx-empty">${escapeHtml(labels.emptyTranscript)}</p>`
    : transcript.turns.map((turn) => renderTurn(turn, labels)).join("\n");
  const exportedAt = formatDateTime(transcript.exportedAt) ?? transcript.exportedAt;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(options.lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="tx-shell">
<aside class="tx-panel">
<div>
<p class="tx-eyebrow">${escapeHtml(labels.documentKind)}</p>
<h1 class="tx-title">${escapeHtml(title)}</h1>
</div>
<dl class="tx-meta">
${renderMeta(transcript, labels)}
</dl>
<ul class="tx-stats">${renderStats(transcript, labels)}</ul>
${renderRedaction(transcript, labels)}
${outline ? `<nav class="tx-outline"><p class="tx-eyebrow">${escapeHtml(labels.outlineHeading)}</p><ol>\n${outline}\n</ol></nav>` : ""}
<p class="tx-foot">DIT v${escapeHtml(transcript.appVersion)}<br>${escapeHtml(labels.fieldExported)} ${escapeHtml(exportedAt)}</p>
</aside>
<main class="tx-reader">
${body}
</main>
</div>
</body>
</html>
`;
}
