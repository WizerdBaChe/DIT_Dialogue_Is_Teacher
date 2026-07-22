/**
 * 快照專用進入點 (EX-03)。責任只有三件：讀取並 JSON.parse payload script 的內容 →
 * 驗 ditExport 標記 → 呼叫 store 的 hydrateSessionExport 後渲染 <App />。
 * 任何一步失敗就渲染一個純文字錯誤區塊並 console.error (EX-INV-7)——絕不留白畫面。
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/styles/index.css";
import { useSessionStore } from "@/store/sessionStore";
import type { SessionExport } from "@/core/export/contracts";

function readSnapshotPayload(): SessionExport {
  const el = document.getElementById("dit-snapshot");
  const raw = el?.textContent?.trim();
  if (!raw || raw === "null") {
    throw new Error("Snapshot payload is missing.");
  }
  const payload = JSON.parse(raw) as Partial<SessionExport>;
  if (payload.ditExport !== "session" || !payload.document) {
    throw new Error("Snapshot payload is missing the ditExport marker.");
  }
  return payload as SessionExport;
}

function renderFatalError(message: string): void {
  console.error("[DIT snapshot] failed to load:", message);
  const root = document.getElementById("root");
  if (root) {
    root.textContent = `Snapshot failed to load: ${message}`;
  }
}

try {
  const payload = readSnapshotPayload();
  useSessionStore.getState().hydrateSessionExport(payload);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  renderFatalError((error as Error).message);
}
