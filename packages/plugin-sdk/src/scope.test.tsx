/** @vitest-environment happy-dom */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExtensionScopeProvider, usePluginPermission } from "./scope";

function NetworkConsumer() {
  usePluginPermission("network.https");
  return null;
}

describe("extension permission scope", () => {
  it("rejects undeclared capabilities", () => {
    expect(() =>
      render(
        <ExtensionScopeProvider extensionId="acme.notes" permissions={[]}>
          <NetworkConsumer />
        </ExtensionScopeProvider>,
      ),
    ).toThrow('has not declared permission "network.https"');
  });

  it("allows declared capabilities", () => {
    expect(() =>
      render(
        <ExtensionScopeProvider
          extensionId="acme.notes"
          permissions={["network.https"]}
        >
          <NetworkConsumer />
        </ExtensionScopeProvider>,
      ),
    ).not.toThrow();
  });
});
