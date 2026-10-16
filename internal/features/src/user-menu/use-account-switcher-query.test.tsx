/** @vitest-environment happy-dom */

import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAccountSwitcher } from "./use-account-switcher";

const mocks = vi.hoisted(() => ({
  listDeviceSessions: vi.fn(),
  refetchSession: vi.fn(),
}));

const currentSession = {
  session: { token: "token-1" },
  user: {
    email: "rhea@example.com",
    id: "user-1",
    name: "Rhea Vale",
  },
};

vi.mock("../auth/context", () => ({
  buildAddAccountPath: (path: string) => path,
  createAccountSwitchNavigationState: (userId: string) => ({ userId }),
  useAuth: () => ({
    multiSession: {
      listDeviceSessions: mocks.listDeviceSessions,
    },
    useSession: () => ({
      data: currentSession,
      refetch: mocks.refetchSession,
    }),
  }),
}));

vi.mock("../region", () => ({
  useRegion: () => ({
    pathWithRegion: (path: string) => path,
  }),
}));

vi.mock("@repo/data/core", () => ({
  usePowerSyncSession: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

describe("useAccountSwitcher account preloading", () => {
  it("loads device sessions on mount and reuses cached accounts", async () => {
    let resolveSessions:
      | ((result: {
          data: [
            typeof currentSession,
            {
              session: { token: string };
              user: {
                email: string;
                id: string;
                name: string;
              };
            },
          ];
          error: null;
        }) => void)
      | undefined;
    mocks.listDeviceSessions.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSessions = resolve;
        })
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 30_000,
        },
      },
    });
    const wrapper = createWrapper(queryClient);

    const firstRender = renderHook(() => useAccountSwitcher(), { wrapper });

    await waitFor(() => {
      expect(mocks.listDeviceSessions).toHaveBeenCalledOnce();
    });
    expect(firstRender.result.current.accounts).toEqual([currentSession]);

    act(() => {
      resolveSessions?.({
        data: [
          currentSession,
          {
            session: { token: "token-2" },
            user: {
              email: "sol@example.com",
              id: "user-2",
              name: "Sol Arden",
            },
          },
        ],
        error: null,
      });
    });

    await waitFor(() => {
      expect(firstRender.result.current.accounts).toHaveLength(2);
    });
    firstRender.unmount();
    mocks.listDeviceSessions.mockClear();

    const cachedRender = renderHook(() => useAccountSwitcher(), { wrapper });

    expect(cachedRender.result.current.accounts).toHaveLength(2);
    expect(mocks.listDeviceSessions).not.toHaveBeenCalled();
  });

  it("keeps the current account usable while the account list is offline", async () => {
    onlineManager.setOnline(false);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ["auth", "device-sessions", "user-1"],
      [
        currentSession,
        {
          session: { token: "token-2" },
          user: {
            email: "sol@example.com",
            id: "user-2",
            name: "Sol Arden",
          },
        },
      ]
    );

    const rendered = renderHook(() => useAccountSwitcher(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(rendered.result.current.accountListStatus).toBe("offline");
    });
    expect(rendered.result.current.accounts).toEqual([currentSession]);
    expect(mocks.listDeviceSessions).not.toHaveBeenCalled();
  });

  it("contains account-list request failures", async () => {
    mocks.listDeviceSessions.mockResolvedValue({
      data: null,
      error: new TypeError("service unavailable"),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ["auth", "device-sessions", "user-1"],
      [
        currentSession,
        {
          session: { token: "token-2" },
          user: {
            email: "sol@example.com",
            id: "user-2",
            name: "Sol Arden",
          },
        },
      ]
    );

    const rendered = renderHook(() => useAccountSwitcher(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(rendered.result.current.accountListStatus).toBe("error");
    });
    expect(rendered.result.current.accounts).toEqual([currentSession]);
  });
});
