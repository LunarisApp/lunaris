import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./errors";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (
            error instanceof ApiError &&
            error.statusCode >= 400 &&
            error.statusCode < 500
          ) {
            return false;
          }
          if (error instanceof ApiError && error.isOffline) {
            return false;
          }
          return failureCount < 2;
        },
        staleTime: 30_000,
        gcTime: 5 * 60 * 1000,
        networkMode: "offlineFirst",
      },
      mutations: {
        retry: false,
        networkMode: "offlineFirst",
      },
    },
  });
}
