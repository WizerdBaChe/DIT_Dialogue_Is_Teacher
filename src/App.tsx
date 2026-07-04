/** App 外殼：組裝 Header / Disclaimer / Sidebar / MainView，首次載入內建範例。 */
import { useEffect, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { sampleSession } from "@/fixtures";
import { Header } from "@/components/Header";
import { Disclaimer } from "@/components/Disclaimer";
import { OllamaPanel } from "@/components/OllamaPanel";
import { CloudPanel } from "@/components/CloudPanel";
import { AnnotateProgress } from "@/components/AnnotateProgress";
import { Sidebar } from "@/components/Sidebar";
import { MainView } from "@/components/MainView";
import { FishboneView } from "@/components/FishboneView";

export default function App(): ReactNode {
  const loadFromText = useSessionStore((s) => s.loadFromText);
  const hasDoc = useSessionStore((s) => Boolean(s.doc));
  const viewMode = useSessionStore((s) => s.viewMode);

  // 首次載入內建範例，讓使用者立即看到效果 (可再用「載入 .jsonl」替換)。
  useEffect(() => {
    if (!hasDoc) loadFromText(sampleSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <Header />
      <Disclaimer />
      <OllamaPanel />
      <CloudPanel />
      <AnnotateProgress />
      <div className="container">
        <Sidebar />
        {viewMode === "cognitive" ? <FishboneView /> : <MainView />}
      </div>
    </div>
  );
}
