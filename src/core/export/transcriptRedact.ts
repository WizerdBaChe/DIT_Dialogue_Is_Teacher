/**
 * 對整份逐字稿套用本機遮蔽。
 *
 * 這是唯一一個非純函式的匯出模組（偵測器介面是 async），但仍不讀 store、不碰 DOM——
 * 輸入輸出都是資料。原逐字稿不被修改，回傳的是新的一份。
 *
 * 遮蔽範圍是「會被人讀到的文字」：session 標題、專案路徑、每輪提問與每則訊息。
 * session.id 不遮——它是隨機識別碼而不是個資，而且是逐字稿回指節點視圖的錨點。
 */
import { TextRedactor } from "@/core/privacy/redact";
import { exportRedactionPolicy } from "@/core/privacy/policies";
import type { TranscriptExport, TranscriptTurn } from "./contracts";

export interface RedactTranscriptOptions {
  /** 使用者自訂的專案敏感詞（公司名、內部代號…）。 */
  customTerms?: string[];
}

export async function redactTranscript(
  transcript: TranscriptExport,
  options: RedactTranscriptOptions = {},
): Promise<TranscriptExport> {
  const redactor = new TextRedactor({ customTerms: options.customTerms });

  const session = {
    ...transcript.session,
    title: await redactor.redact(transcript.session.title),
    projectPath: transcript.session.projectPath ? await redactor.redact(transcript.session.projectPath) : null,
  };

  const turns: TranscriptTurn[] = [];
  for (const turn of transcript.turns) {
    const user = turn.user ? { ...turn.user, text: await redactor.redact(turn.user.text) } : null;
    const messages = [];
    for (const message of turn.messages) {
      messages.push({ ...message, text: await redactor.redact(message.text) });
    }
    turns.push({ ...turn, user, messages });
  }

  const report = redactor.report;
  return {
    ...transcript,
    session,
    turns,
    redaction: {
      policyId: exportRedactionPolicy.id,
      summary: report.summary,
      residualSecretBlocks: report.residualSecretBlocks,
    },
  };
}
