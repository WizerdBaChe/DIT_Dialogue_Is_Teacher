import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { MainView } from "./MainView";
import { SubagentView } from "./SubagentView";
import { OverviewView } from "./OverviewView";

export function Workspace(): ReactNode {
  const primaryView = useSessionStore((state) => state.primaryView);

  return (
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
  );
}
