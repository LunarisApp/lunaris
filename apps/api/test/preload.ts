import { mock } from "bun:test";

export const mockEvlogLogger = {
  audit: Object.assign(mock(() => {}), {
    deny: mock(() => {}),
  }),
  set: mock(() => {}),
  error: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  emit: mock(() => null),
  getContext: mock(() => ({
    path: undefined as string | undefined,
    requestId: "test-request-id",
  })),
};

mock.module("evlog/nestjs", () => ({
  useLogger: () => mockEvlogLogger,
  EvlogModule: {
    forRoot: () => ({ module: class {}, global: true }),
    forRootAsync: () => ({ module: class {}, global: true }),
  },
}));

let nanoCounter = 0;
mock.module("nanoid", () => ({
  customAlphabet: () => () => `mock-${++nanoCounter}`,
  nanoid: () => `mock-${++nanoCounter}`,
}));

let uuidCounter = 0;
mock.module("uuid", () => ({
  v4: () =>
    `00000000-0000-0000-0000-${String(++uuidCounter).padStart(12, "0")}`,
}));

mock.module("@thallesp/nestjs-better-auth", () => {
  class AuthService {
    api = { signJWT: mock() };
  }
  return {
    AuthService,
    Session: () => () => {},
  };
});
