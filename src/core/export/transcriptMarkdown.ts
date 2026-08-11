/**
 * 逐字稿 → Markdown (純函式)。
 *
 * 內容本身**不做跳脫**：agent 的輸出本來就是 Markdown (程式碼區塊、清單、粗體)，跳脫會把它
 * 全毀掉。代價是內容裡若有行首 `#` 或未閉合的程式碼圍籬，可能影響後續段落的呈現——這是任何
 * 「把 Markdown 串起來」的輸出都有的性質，逐字稿以保真為優先。
 */
import type { TranscriptExport, TranscriptLabels, TranscriptMessage, TranscriptTurn } from "./contracts";
import { collapseBlankLines, formatDateTime, formatTime, redactionSummaryText } from "./transcriptFormat";

/** 連續的工具摘要併成一行，避免一輪裡塞了六行「⚙️ …」把對話沖散。 */
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

function statsLine(transcript: TranscriptExport, labels: TranscriptLabels): string {
  const { stats, options } = transcript;
  const parts = [
    labels.statTurns(stats.turns),
    labels.statUserMessages(stats.userMessages),
    labels.statAssistantMessages(stats.assistantMessages),
  ];
  if (stats.thinkingBlocks > 0) parts.push(labels.statThinkingBlocks(stats.thinkingBlocks, options.includeThinking));
  if (stats.toolCalls > 0) parts.push(labels.statToolCalls(stats.toolCalls, options.includeToolSummary));
  if (stats.excludedSubagentSpans > 0) parts.push(labels.subagentsExcluded(stats.excludedSubagentSpans));
  return parts.join(" · ");
}

function renderHeader(transcript: TranscriptExport, labels: TranscriptLabels): string[] {
  const { session } = transcript;
  const lines = [
    `# ${session.title || labels.sessionTitleFallback}`,
    "",
    `_${labels.documentKind}_`,
    "",
    `- **${labels.fieldSession}**：\`${session.id}\``,
    `- **${labels.fieldSource}**：${[session.tool, session.model].filter(Boolean).join(" · ")}`,
  ];
  if (session.projectPath) lines.push(`- **${labels.fieldProject}**：\`${session.projectPath}\``);
  const started = formatDateTime(session.startedAt);
  if (started) lines.push(`- **${labels.fieldStarted}**：${started}`);
  lines.push(`- **${labels.fieldExported}**：${formatDateTime(transcript.exportedAt) ?? transcript.exportedAt}（DIT v${transcript.appVersion}）`);
  lines.push(`- **${labels.fieldContents}**：${statsLine(transcript, labels)}`);

  // 內容被改寫過就必須講出來，否則讀的人分不出 <EMAIL_1> 是遮蔽還是原文。
  if (transcript.redaction) {
    const summary = redactionSummaryText(transcript.redaction.summary, labels.sensitiveKind);
    lines.push(`- ${labels.redactionNote(summary || labels.redactionNothingFound)}`);
    if (transcript.redaction.residualSecretBlocks > 0) {
      lines.push("", `> ⚠️ ${labels.redactionResidual(transcript.redaction.residualSecretBlocks)}`);
    }
  }
  return lines;
}

function renderMessage(entry: TranscriptMessage | TranscriptMessage[], labels: TranscriptLabels): string[] {
  // 併成一行的工具摘要：用引用區塊壓低視覺重量，它是輔助說明而不是對話。
  if (Array.isArray(entry)) {
    const summaries = entry.map((message) => message.text).filter(Boolean);
    return summaries.length === 0 ? [] : ["", `> ⚙️ ${labels.roleToolActivity}：${summaries.join(" → ")}`];
  }

  const body = collapseBlankLines(entry.text);
  if (!body) return [];

  const role = entry.kind === "thinking" ? `💭 ${labels.roleThinking}`
    : entry.kind === "subagent_prompt" ? `🧩 ${labels.roleSubagentPrompt}`
    : `🤖 ${labels.roleAssistant}`;
  const badge = entry.subagent && entry.kind !== "subagent_prompt" ? ` _(${labels.subagentBadge})_` : "";
  return ["", `**${role}**${badge}`, "", body];
}

function renderTurn(turn: TranscriptTurn, labels: TranscriptLabels): string[] {
  const time = formatTime(turn.startedAt);
  const heading = turn.user ? labels.turnHeading(turn.index) : labels.openingTurnHeading;
  const lines = ["", "---", "", `## ${heading}${time ? ` · ${time}` : ""}`];

  if (turn.user) {
    const body = collapseBlankLines(turn.user.text);
    if (body) lines.push("", `**👤 ${labels.roleUser}**`, "", body);
  }
  for (const entry of groupMessages(turn.messages)) lines.push(...renderMessage(entry, labels));
  return lines;
}

export function renderTranscriptMarkdown(transcript: TranscriptExport, labels: TranscriptLabels): string {
  const lines = renderHeader(transcript, labels);
  if (transcript.turns.length === 0) lines.push("", labels.emptyTranscript);
  for (const turn of transcript.turns) lines.push(...renderTurn(turn, labels));
  return `${lines.join("\n").trimEnd()}\n`;
}
