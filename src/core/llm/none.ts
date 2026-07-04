/** NoneProvider：不講解。純結構化，零外傳 (預設)。 */
import type { LLMProvider } from "./types";

export const noneProvider: LLMProvider = {
  id: "none",
  sendsDataOut: false,
  async annotate() {
    return null;
  },
};
