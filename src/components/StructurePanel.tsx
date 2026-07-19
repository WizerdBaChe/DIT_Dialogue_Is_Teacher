import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function StructurePanel(): ReactNode {
  return (
    <main className="structure-workspace">
      <Sidebar />
    </main>
  );
}
