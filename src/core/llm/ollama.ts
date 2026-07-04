/**
 * OllamaProvider：本地優先的講解 (D-4)。
 * 直連本地 Ollama (預設 http://localhost:11434)，code/log 不外傳。
 * 需在 Ollama 端設定 OLLAMA_ORIGINS 允許瀏覽器跨域存取。
 */
import type { Annotation } from "@/types/spanTree";
import type { LLMProvider, AnnotateContext } from "./types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import type { Span } from "@/types/spanTree";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  /** 單次請求逾時 (毫秒)，避免本地模型卡住時無限等待。 */
  timeoutMs: number;
  /**
   * 是否顯式停用模型思考 (送 think:false)。
   * 僅對支援 thinking 的模型 (qwen3 / deepseek-r1 / gpt-oss…) 有意義，可避免長 think 拖慢或破壞 JSON。
   * undefined = 不送此參數 (預設，對不支援 thinking 的模型如 gemma 較安全)。
   */
  think?: boolean;
  /**
   * 模型保活時間 (Ollama keep_alive，如 "10m"、"30m")。
   * 連續逐節點講解時，讓模型留在 VRAM、不被卸載重載 → 第 2 個節點起明顯變快。
   * 這是緩解「8B 變慢」最有效的一招。undefined = 用 Ollama 預設 (約 5m)。
   */
  keepAlive?: string;
  /** 單段講解輸出 token 上限 (num_predict)；限制長度以加速。undefined = 模型預設。 */
  numPredict?: number;
  /** 上下文視窗大小 (num_ctx)；調小省記憶體/加速，但過小會截斷輸入。undefined = 模型預設。 */
  numCtx?: number;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: "http://localhost:11434",
  model: "qwen2.5-coder:7b",
  // 60s：4B 以上模型首次冷載入進 VRAM 可能超過 30s，放寬避免誤判逾時。
  timeoutMs: 60000,
  // 預設保活 10 分鐘：逐節點講解時免於重複冷載入 (對大模型尤其有感)。
  keepAlive: "10m",
  // 預設輸出上限 512 token：講解只需「什麼/為何/通則」，不需長篇，限長即加速。
  numPredict: 512,
};

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

/** Ollama 服務的探測狀態，供 UI 給出對應的引導。 */
export type OllamaState =
  | "checking" // 探測中
  | "ready" // 已連線且指定模型存在
  | "model-missing" // 已連線，但指定模型尚未安裝
  | "no-model" // 已連線，但完全沒有任何模型
  | "offline"; // 連不上 (未啟動 / CORS / 逾時)

export interface OllamaStatus {
  state: OllamaState;
  baseUrl: string;
  /** 指定要使用的模型。 */
  model: string;
  /** 已安裝的模型名稱清單。 */
  models: string[];
  /** 可讀的狀態說明。 */
  message: string;
}

/** 推薦的小模型 (適合本地逐節點講解；使用者可自行 pull 其他)。 */
export const RECOMMENDED_MODELS = ["qwen2.5-coder:7b", "qwen2.5:3b", "llama3.2:3b"] as const;

/**
 * 探測 Ollama：GET /api/tags 取得已安裝模型清單，據此判斷狀態。
 * 不丟例外——一律回傳結構化 status，讓 UI 決定如何引導。
 * 注意：/api/tags 同樣受 OLLAMA_ORIGINS 規範，CORS 被擋會落入 offline。
 */
export async function checkOllama(
  config: Pick<OllamaConfig, "baseUrl" | "model"> = DEFAULT_OLLAMA_CONFIG,
): Promise<OllamaStatus> {
  const base = { baseUrl: config.baseUrl, model: config.model, models: [] as string[] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${config.baseUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) {
      return { ...base, state: "offline", message: `Ollama 回應 HTTP ${res.status}（/api/tags）。` };
    }
    const data = (await res.json()) as { models?: { name?: string }[] };
    const models = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    if (models.length === 0) {
      return { ...base, state: "no-model", message: "Ollama 已啟動，但尚未安裝任何模型。" };
    }
    const has = models.includes(config.model);
    return {
      ...base,
      models,
      state: has ? "ready" : "model-missing",
      message: has ? `就緒：使用模型 ${config.model}。` : `已連線，但未安裝指定模型「${config.model}」。`,
    };
  } catch (e) {
    const why = (e as Error).name === "AbortError" ? "連線逾時" : (e as Error).message;
    return {
      ...base,
      state: "offline",
      message: `無法連線到 Ollama (${config.baseUrl})：${why}。可能未啟動，或未允許瀏覽器跨域 (OLLAMA_ORIGINS)。`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 組出 Ollama `options` 物件 (僅含有設定的鍵)；都沒設則回 undefined 以省略整段。 */
function buildOptions(config: OllamaConfig): Record<string, number> | undefined {
  const opts: Record<string, number> = {};
  if (typeof config.numPredict === "number") opts.num_predict = config.numPredict;
  if (typeof config.numCtx === "number") opts.num_ctx = config.numCtx;
  return Object.keys(opts).length > 0 ? opts : undefined;
}

function coerceAnnotation(raw: unknown): Annotation {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : 0.6);
  return {
    what: str(o.what),
    why: str(o.why),
    generalLesson: str(o.generalLesson ?? o.general_lesson),
    confidence: num(o.confidence),
    provider: "ollama",
  };
}

export function createOllamaProvider(config: OllamaConfig = DEFAULT_OLLAMA_CONFIG): LLMProvider {
  return {
    id: "ollama",
    sendsDataOut: false, // 本地，不離開裝置。
    async annotate(span: Span, ctx: AnnotateContext): Promise<Annotation | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      const res = await fetch(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          stream: false,
          format: "json",
          // 保活：讓模型留在 VRAM，連續講解免於冷載入 (緩解大模型變慢)。
          ...(config.keepAlive ? { keep_alive: config.keepAlive } : {}),
          ...(buildOptions(config) ? { options: buildOptions(config) } : {}),
          // 僅在使用者明確要求時才送 think (避免對不支援 thinking 的模型報錯)。
          ...(config.think === false ? { think: false } : {}),
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(span, ctx) },
          ],
        }),
      })
        .catch((e: unknown) => {
          const msg = (e as Error).name === "AbortError"
            ? `Ollama 逾時 (>${config.timeoutMs / 1000}s)，已中止。`
            : `無法連線到 Ollama (${config.baseUrl})：${(e as Error).message}。請確認 Ollama 已啟動並設定 OLLAMA_ORIGINS。`;
          throw new Error(msg);
        })
        .finally(() => clearTimeout(timer));

      if (!res.ok) {
        if (res.status === 404)
          throw new Error(`找不到模型「${config.model}」。請先在終端機安裝：ollama pull ${config.model}`);
        throw new Error(`Ollama 回應錯誤：HTTP ${res.status}`);
      }
      const data = (await res.json()) as OllamaChatResponse;
      if (data.error) throw new Error(`Ollama 錯誤：${data.error}`);

      const content = data.message?.content ?? "";
      try {
        return coerceAnnotation(JSON.parse(content));
      } catch {
        // 模型未回傳合法 JSON：降級為把整段當作 what。
        return { what: content.slice(0, 300), why: "", generalLesson: "", confidence: 0.4, provider: "ollama" };
      }
    },
  };
}
