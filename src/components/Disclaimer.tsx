/** Provider 責任說明橫幅 (D-3：知情選擇、責任釐清)。 */
import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { PROVIDER_DISCLAIMER } from "./labels";

export function Disclaimer(): ReactNode {
  const providerId = useSessionStore((s) => s.providerId);
  return <div className={`disclaimer ${providerId}`}>{PROVIDER_DISCLAIMER[providerId]}</div>;
}
