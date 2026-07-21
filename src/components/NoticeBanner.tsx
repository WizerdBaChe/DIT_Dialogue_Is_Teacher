import type { ReactNode } from "react";
import { useT } from "@/i18n";

interface NoticeBannerProps {
  /** warn = 可忽略的提示；error = 需要處理的失敗。 */
  tone: "warn" | "error";
  children: ReactNode;
  onDismiss: () => void;
}

/**
 * 可關閉的橫幅提示。
 * 常駐不可關的提示會一直吃掉閱讀區高度 —— 使用者看過就該能收掉，
 * 資訊本身仍留在 store（例如總覽仍會顯示解析提示則數）。
 */
export function NoticeBanner({ tone, children, onDismiss }: NoticeBannerProps): ReactNode {
  const t = useT();
  return (
    <div className={`error-banner ${tone === "warn" ? "warn" : ""}`} role={tone === "error" ? "alert" : undefined}>
      <span className="notice-body">{children}</span>
      <button
        type="button"
        className="notice-dismiss"
        onClick={onDismiss}
        aria-label={t.notice.dismiss}
        title={t.notice.dismiss}
      >
        ✕
      </button>
    </div>
  );
}
