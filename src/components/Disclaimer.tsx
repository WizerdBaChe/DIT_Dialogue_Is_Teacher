/** Provider 責任說明橫幅 (D-3：知情選擇、責任釐清)。 */
import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

export function Disclaimer(): ReactNode {
  const t = useT();
  const providerId = useSessionStore((s) => s.providerId);
  return (
    <div className={`disclaimer ${providerId}`}>{t.providerDisclaimer[providerId]}</div>
  );
}

export function StorageNotice(): ReactNode {
  const t = useT();
  const storageNotice = useSessionStore((state) => state.storageNotice);
  const dismiss = useSessionStore((state) => state.dismissStorageNotice);
  if (!storageNotice) return null;
  return (
    <div className="storage-notice" role="alert">
      <span className="notice-body">{t.storage.degraded(storageNotice)}</span>
      <button type="button" className="notice-dismiss" onClick={dismiss} aria-label={t.notice.dismiss} title={t.notice.dismiss}>✕</button>
    </div>
  );
}
