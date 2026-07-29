/**
 * 骨架分類的定義鍵 (R9.1 RC-G)。
 *
 * 作者實測回報：「『決策』的定義到底是什麼，目前各定義都沒有面向使用者的完整解釋和說明，
 * 只有單純分類。」——確實如此。`decision` 的實際判準是 `s.tags.includes("decision")`，
 * 而那個標籤來自降噪層對思考節點的限縮規則；使用者無從得知，圖例也只給了一個名詞。
 *
 * 這裡只定義**有哪些分類**（結構），文字（定義／判準／例子）在 i18n 的 `categoryDefinition`
 * 表裡。分開的理由是：結構要能被型別檢查與完整性測試釘住，文字要能翻譯。
 *
 * 唯一來源原則：圖例、Session Map 說明、使用者指南**都讀這一份**。同一個定義寫在三個地方，
 * 遲早會有兩個是舊的。
 */
import { SKELETON_NODE_KIND_ORDER, SKELETON_RIB_KIND_ORDER } from "./sessionMap";
import type { SkeletonNodeKind, SkeletonRibKind } from "@/types/spanTree";

/** 需要面向使用者解釋的分類。子代理不在此列——它是來源而非判定結果，本身自我說明。 */
export type CategoryKey = SkeletonNodeKind | SkeletonRibKind;

/** 顯示順序：先主線（因果骨幹），再支線（旁支）。 */
export const CATEGORY_ORDER: CategoryKey[] = [...SKELETON_NODE_KIND_ORDER, ...SKELETON_RIB_KIND_ORDER];

/**
 * 一則定義的三段式。三段都是必填，缺一則等於沒解釋：
 * - `what` 一句話說它是什麼（給只想掃過去的人）
 * - `rule` DIT 實際用什麼判準把它標出來（給想知道能不能信的人）
 * - `example` 一個具體的樣子（給看了前兩段還是沒感覺的人）
 */
export interface CategoryDefinition {
  what: string;
  rule: string;
  example: string;
}

export type CategoryDefinitionTable = Record<CategoryKey, CategoryDefinition>;

export function isSkeletonNodeKind(key: CategoryKey): key is SkeletonNodeKind {
  return (SKELETON_NODE_KIND_ORDER as CategoryKey[]).includes(key);
}
