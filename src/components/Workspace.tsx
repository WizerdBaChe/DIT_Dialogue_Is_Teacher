import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { MainView } from "./MainView";
import { SubagentView } from "./SubagentView";
import { OverviewView } from "./OverviewView";
import { Sidebar } from "./Sidebar";
import { useT } from "@/i18n";

export function Workspace(): ReactNode {
  const t = useT();
  const hasDoc = useSessionStore((state) => Boolean(state.doc));
  const primaryView = useSessionStore((state) => state.primaryView);
  const structureCollapsed = useSessionStore((state) => state.structureCollapsed);
  const toggleStructureCollapsed = useSessionStore((state) => state.toggleStructureCollapsed);

  return (
    <div className={`workspace-layout ${structureCollapsed ? "structure-collapsed" : ""}`}>
      {hasDoc && !structureCollapsed && <Sidebar />}
      {hasDoc && structureCollapsed && (
        <button
          type="button"
          className="structure-rail"
          onClick={toggleStructureCollapsed}
          aria-label={t.structure.expand}
          title={t.structure.expand}
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
      <div
        id={`workspace-panel-${primaryView}`}
        className={`workspace-panel workspace-${primaryView}`}
        role="tabpanel"
        aria-labelledby={`workspace-tab-${primaryView}`}
        tabIndex={0}
      >
        {primaryView === "overview" && <OverviewView />}
        {primaryView === "reader" && <MainView />}
        {primaryView === "subagents" && <SubagentView />}
      </div>
    </div>
  );
}
