/**
 * CloudProvider：雲端講解 (樁實作 — D-4)。
 * 介面已就緒；日後可接 Claude API 或免費雲端 API (如 NVIDIA)。
 * 涉及資料外傳 (sendsDataOut=true)，UI 須顯示責任說明。
 */
import type { LLMProvider } from "./types";

export const cloudProvider: LLMProvider = {
  id: "cloud",
  sendsDataOut: true,
  async annotate() {
    throw new Error("雲端講解尚未設定。請於設定中提供 API 端點與金鑰後再使用 (目前為預留樁)。");
  },
};
