import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { PRIMARY_VIEWS, primaryViewAfterKey, type PrimaryView } from "@/core/view/workspace";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

export function WorkspaceTabs(): ReactNode {
  const t = useT();
  const primaryView = useSessionStore((state) => state.primaryView);
  const setPrimaryView = useSessionStore((state) => state.setPrimaryView);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: PrimaryView) => {
    const next = primaryViewAfterKey(current, event.key);
    if (!next) return;
    event.preventDefault();
    setPrimaryView(next);
    buttons.current[PRIMARY_VIEWS.indexOf(next)]?.focus();
  };

  return (
    <div className="workspace-tabs" role="tablist" aria-label={t.workspace.tablistLabel}>
      {PRIMARY_VIEWS.map((view, index) => (
        <button
          key={view}
          ref={(element) => { buttons.current[index] = element; }}
          type="button"
          id={`workspace-tab-${view}`}
          className={`workspace-tab ${primaryView === view ? "active" : ""}`}
          role="tab"
          aria-selected={primaryView === view}
          aria-controls={`workspace-panel-${view}`}
          tabIndex={primaryView === view ? 0 : -1}
          onClick={() => setPrimaryView(view)}
          onKeyDown={(event) => onKeyDown(event, view)}
        >
          {t.workspace.tabs[view]}
        </button>
      ))}
    </div>
  );
}
