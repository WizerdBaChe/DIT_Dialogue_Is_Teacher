/** Provider 責任說明橫幅 (D-3：知情選擇、責任釐清)。 */
import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

export function Disclaimer(): ReactNode {
  const t = useT();
  const providerId = useSessionStore((s) => s.providerId);
  return <div className={`disclaimer ${providerId}`}>{t.providerDisclaimer[providerId]}</div>;
}
