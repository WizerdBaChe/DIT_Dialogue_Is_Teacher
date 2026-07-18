/**
 * Denoiser：確定性降噪 / 分組 / 標籤 (不需 LLM)
 * 對應 RPD §H「確定性降噪規則」。純函式，輸入輸出皆為 Span Tree 契約。
 *
 * 規則：
 * 1. milestone — 使用者訊息標為任務分界；最後一個成功結果標為完成。
 * 2. error / retry — 錯誤結果標 error；錯誤後對同工具的再次呼叫標 retry。
 * 3. edit-loop — 對同一檔案連續多次編輯，折疊成一個群組。
 * 4. decision — 思考/回覆中出現決策語彙者，標 decision (保守啟發式)。
 */
import type { Span, SpanGroup, SessionDocument } from "@/types/spanTree";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const DECISION_RE = /(決定|改用|改成|應該改|換成|instead|let me switch|i'?ll use|we should)/i;

function filePathOf(span: Span): string | null {
  const p = span.tool?.params ?? {};
  for (const k of ["file_path", "filePath", "path", "notebook_path"]) {
    if (typeof p[k] === "string") return p[k] as string;
  }
  return null;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function addTag(span: Span, tag: Span["tags"][number]): void {
  if (!span.tags.includes(tag)) span.tags.push(tag);
}

export function denoise(doc: SessionDocument): SessionDocument {
  const spans = doc.spans;
  const groups: SpanGroup[] = doc.groups.filter((group) => group.kind === "subagent");

  // ---- 規則 1：milestone ----
  for (const s of spans) {
    if (s.type === "user_msg") addTag(s, "milestone");
  }
  const lastResult = [...spans].reverse().find((s) => s.type === "tool_result");
  if (lastResult && !lastResult.result?.isError) {
    addTag(lastResult, "milestone");
    // 結果以巢狀區塊呈現，標籤同時掛到父操作卡片才看得到。
    const parent = spans.find((p) => p.id === lastResult.parentId);
    if (parent) addTag(parent, "milestone");
  }

  // ---- 規則 2：error / retry ----
  // 錯誤結果標 error；之後再次呼叫「同一個工具」視為重試，標 retry。
  let erroredTool: string | null = null;
  for (const s of spans) {
    if (s.type === "tool_result" && s.result?.isError) {
      addTag(s, "error");
      const parent = spans.find((p) => p.id === s.parentId);
      if (parent) addTag(parent, "error"); // 讓錯誤在父操作卡片上以徽章顯示。
      erroredTool = parent?.tool?.name ?? null;
    } else if (s.type === "tool_use" && erroredTool && s.tool?.name === erroredTool) {
      addTag(s, "retry");
      erroredTool = null;
    }
  }

  // ---- 規則 4：decision (保守，僅標思考層，避免回覆文字重複觸發) ----
  for (const s of spans) {
    if (s.type === "thinking" && DECISION_RE.test(s.text)) {
      addTag(s, "decision");
    }
  }

  // ---- 規則 3：edit-loop 分組 ----
  // tool_result / thinking 不打斷連續編輯；user_msg 或不同工具/不同檔案才打斷。
  let run: Span[] = [];
  let runFile: string | null = null;
  let groupSeq = 0;

  const flush = () => {
    if (run.length >= 2 && runFile) {
      groups.push({
        id: `group-${groupSeq++}`,
        label: `反覆修改 ${fileName(runFile)}`,
        spanIds: run.map((s) => s.id),
        kind: "edit-loop",
      });
    }
    run = [];
    runFile = null;
  };

  for (const s of spans) {
    if (s.type === "tool_use" && EDIT_TOOLS.has(s.tool?.name ?? "")) {
      const f = filePathOf(s);
      if (f && f === runFile) {
        run.push(s);
      } else {
        flush();
        runFile = f;
        run = f ? [s] : [];
      }
    } else if (s.type === "tool_use" || s.type === "user_msg") {
      // 不同工具 (如 Bash) 或新的使用者訊息才打斷連續編輯。
      flush();
    }
    // 其餘 (thinking / assistant_msg / tool_result) 對連續編輯透明，不打斷。
  }
  flush();

  return { ...doc, spans, groups };
}
