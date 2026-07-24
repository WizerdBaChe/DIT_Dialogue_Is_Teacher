/**
 * 靜態範例講解，供 Onboarding 預覽用 (問題1)。
 * 這不是即時呼叫 —— 內容是 2026-07-24 在開發機以本機 Ollama (qwen2.5-coder:7b)
 * 針對 fixtures/sampleSession.jsonl 裡「改用 filter 取代直接 mutate state」這一步
 * 實際產生一次後原封凍結存放，讓使用者不用先裝好 Ollama、先跑一次才知道講解長怎樣。
 * 要更新範例：在本機起 Ollama 後對同一步驟重新呼叫一次，把新輸出貼回這裡即可。
 */
import type { Locale } from "@/i18n/locales";
import type { Annotation } from "@/types/spanTree";

export interface SampleAnnotationPreview {
  stepSummary: string;
  annotation: Annotation;
}

export const SAMPLE_ANNOTATION_PREVIEW: Record<Locale, SampleAnnotationPreview> = {
  "zh-TW": {
    stepSummary: "編輯 src/TodoList.jsx：把直接 splice 修改陣列，改成用 filter 回傳新陣列",
    annotation: {
      what: "將 splice 方法替換為 filter 方法",
      why: "splice 方法會直接修改原陣列，但本任務需要刪除元素且保持原陣列不被就地修改，React 才能偵測到變化並重新渲染",
      generalLesson: "在 React 中更新狀態時，應使用會回傳新陣列的方法（如 filter）以確保重新渲染",
      confidence: 0.95,
      provider: "ollama",
    },
  },
  en: {
    stepSummary: "Edit src/TodoList.jsx: replace an in-place `splice` mutation with a `filter` that returns a new array",
    annotation: {
      what: "Replace the `splice` method with a filter to remove the todo item.",
      why: "Using `filter` ensures the state update is functional and does not directly modify the existing array, which React requires for correct re-rendering.",
      generalLesson: "When updating arrays in React state, use methods like `filter`, `map`, or `reduce` to create a new array instead of mutating the original.",
      confidence: 1,
      provider: "ollama",
    },
  },
};
