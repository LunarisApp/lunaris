import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

export function createAgentWorkRoutes(options: {
  AppBarLeading: ComponentType;
  AppBarTrailing: ComponentType;
}): RouteObject[] {
  return [
    {
      path: "agent-work",
      lazy: async () => {
        const { default: AgentWorkPage } = await import("./page");
        return { Component: () => <AgentWorkPage {...options} /> };
      },
    },
  ];
}
