/** App shell: persistent status surfaces plus one active workspace panel. */
import { useEffect, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { sampleSession } from "@/fixtures";
import { Header } from "@/components/Header";
import { StorageNotice } from "@/components/Disclaimer";
import { PrivacyReview } from "@/components/PrivacyReview";
import { AnnotateProgress } from "@/components/AnnotateProgress";
import { SessionLoadStatus } from "@/components/SessionLoadStatus";
import { Workspace } from "@/components/Workspace";
import { MapLauncher } from "@/components/MapLauncher";
import { SessionMapDialog } from "@/components/SessionMapDialog";
import { SettingsDialog } from "@/components/SettingsDialog";

export default function App(): ReactNode {
  const loadFromText = useSessionStore((s) => s.loadFromText);
  const hasDoc = useSessionStore((s) => Boolean(s.doc));

  // 首次載入內建範例，讓使用者立即看到效果 (可再用「載入 .jsonl」替換)。
  useEffect(() => {
    if (!hasDoc) loadFromText(sampleSession, "sample");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <Header />
      <SessionLoadStatus />
      <StorageNotice />
      <PrivacyReview />
      <AnnotateProgress />
      <Workspace />
      <MapLauncher />
      <SessionMapDialog />
      <SettingsDialog />
    </div>
  );
}
