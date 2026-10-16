"use client";

export interface OpenDebuggerDeps {
  openTool: (input: { toolId: string }) => void;
  t: (key: string) => string;
}

export function createOpenDebuggerPanelAction({ openTool }: OpenDebuggerDeps) {
  return () => {
    openTool({ toolId: "debugger" });
  };
}
