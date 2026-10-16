/** @vitest-environment happy-dom */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegionProvider } from "../../region";
import { AuthProvider } from "../context";
import VerifyEmailPage from "./verify-email";

Object.assign(globalThis, {
  __BUILD_VERSION__: "test-version",
});

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

describe("VerifyEmailPage", () => {
  it("rechecks a transient empty session without dropping the redirect", async () => {
    let session: {
      user: {
        email: string;
        emailVerified: boolean;
        isAnonymous: boolean;
      };
    } | null = null;
    const refetch = vi.fn(async () => {
      session = {
        user: {
          email: "ada@example.com",
          emailVerified: false,
          isAnonymous: false,
        },
      };
    });
    const sendVerificationEmail = vi.fn().mockResolvedValue({ error: null });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          apiUrl: "https://api-us.example.com",
          syncUrl: "https://sync-us.example.com",
          regionId: "us",
          storageUrl: "https://storage-us.example.com",
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    );

    render(
      <MemoryRouter
        initialEntries={[
          "/auth/verify-email?region=us&redirectTo=%2Fworkspaces%3Ftab%3Drecent%23verify",
        ]}
      >
        <RegionProvider
          directory={[
            {
              id: "us",
              label: "United States",
              apiUrl: "https://api-us.example.com",
              status: "active",
              default: true,
            },
          ]}
        >
          <AuthProvider
            client={
              {
                sendVerificationEmail,
                useSession: () => ({
                  data: session,
                  isPending: false,
                  refetch,
                }),
              } as never
            }
          >
            <Routes>
              <Route
                element={
                  <>
                    <VerifyEmailPage />
                    <LocationProbe />
                  </>
                }
                path="/auth/verify-email"
              />
              <Route element={<LocationProbe />} path="*" />
            </Routes>
          </AuthProvider>
        </RegionProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(refetch).toHaveBeenCalledOnce();
      expect(screen.getByTestId("auth-verify-page")).not.toBeNull();
      expect(screen.getByTestId("location").textContent).toBe(
        "/auth/verify-email?region=us&redirectTo=%2Fworkspaces%3Ftab%3Drecent%23verify"
      );
    });
  });
});
