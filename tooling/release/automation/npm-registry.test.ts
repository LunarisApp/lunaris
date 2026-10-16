import { expect, test } from "bun:test";
import {
  ensureNpmPublication,
  TransientRegistryError,
  inspectNpmIntegrity,
} from "./npm-registry";

test("partial publication resumes missing packages without republishing successful ones", async () => {
  const registry = new Map<string, string>();
  const published: string[] = [];
  let fail = true;
  const ship = async () => {
    for (const name of ["sdk", "ui"]) {
      await ensureNpmPublication(
        `${name}@1.0.0`,
        name,
        async () => registry.get(name) ?? null,
        () => {
          if (name === "ui" && fail) {
            throw new Error("Registry unavailable");
          }
          published.push(name);
          registry.set(name, name);
        }
      );
    }
  };
  await expect(ship()).rejects.toThrow("Registry unavailable");
  expect(published).toEqual(["sdk"]);
  fail = false;
  await ship();
  await ship();
  expect(published).toEqual(["sdk", "ui"]);
});

test("conflicting bytes and uncertain readback never overwrite a published version", async () => {
  let writes = 0;
  await expect(
    ensureNpmPublication(
      "sdk@1.0.0",
      "wanted",
      async () => "other",
      () => {
        writes++;
      }
    )
  ).rejects.toThrow("different bytes");
  expect(writes).toBe(0);
  await expect(
    ensureNpmPublication(
      "sdk@1.0.0",
      "wanted",
      async () => null,
      () => {
        writes++;
      },
      clock().options
    )
  ).rejects.toThrow("readback timed out");
  expect(writes).toBe(1);
});

function clock() {
  let time = 0;
  const waits: number[] = [];
  const logs: string[] = [];
  return {
    waits,
    logs,
    elapsed: () => time,
    options: {
      now: () => time,
      sleep: async (milliseconds: number) => {
        waits.push(milliseconds);
        time += milliseconds;
      },
      log: (message: string) => logs.push(message),
    },
  };
}

test("immediate availability publishes once without waiting", async () => {
  const timer = clock();
  let writes = 0;
  await ensureNpmPublication(
    "sdk@1",
    "wanted",
    async () => (writes ? "wanted" : null),
    () => {
      writes++;
    },
    timer.options
  );
  expect(writes).toBe(1);
  expect(timer.waits).toEqual([]);
});

test("delayed availability and transient errors back off without republishing", async () => {
  const timer = clock();
  let reads = 0;
  let writes = 0;
  await ensureNpmPublication(
    "sdk@1",
    "wanted",
    async () => {
      reads++;
      if (reads === 3) {
        throw new TransientRegistryError("HTTP 503");
      }
      return reads >= 5 ? "wanted" : null;
    },
    () => {
      writes++;
    },
    timer.options
  );
  expect(writes).toBe(1);
  expect(timer.waits).toEqual([1000, 2000, 4000]);
  expect(timer.logs.join("\n")).toContain("HTTP 503");
  expect(timer.logs.join("\n")).toContain("actual integrity wanted");
});

test.each(["missing", "HTTP 503"])(
  "readback timeout preserves last reason: %s",
  async (reason) => {
    const timer = clock();
    let writes = 0;
    await expect(
      ensureNpmPublication(
        "sdk@1",
        "wanted",
        async () => {
          if (writes && reason !== "missing") {
            throw new TransientRegistryError(reason);
          }
          return null;
        },
        () => {
          writes++;
        },
        timer.options
      )
    ).rejects.toThrow(
      `last reason: ${reason === "missing" ? "version missing" : reason}`
    );
    expect(writes).toBe(1);
    expect(timer.elapsed()).toBe(300_000);
    expect(Math.max(...timer.waits)).toBe(30_000);
  }
);

test("readback integrity mismatch fails immediately with both hashes", async () => {
  const timer = clock();
  let writes = 0;
  await expect(
    ensureNpmPublication(
      "sdk@1",
      "wanted",
      async () => (writes ? "other" : null),
      () => {
        writes++;
      },
      timer.options
    )
  ).rejects.toThrow("expected integrity wanted; actual integrity other");
  expect(writes).toBe(1);
  expect(timer.waits).toEqual([]);
});

test("preflight transient failure cannot cause a duplicate publish", async () => {
  const timer = clock();
  let reads = 0;
  let writes = 0;
  await ensureNpmPublication(
    "sdk@1",
    "wanted",
    async () => {
      if (++reads === 1) {
        throw new TransientRegistryError("HTTP 429");
      }
      return "wanted";
    },
    () => {
      writes++;
    },
    timer.options
  );
  expect(writes).toBe(0);
  expect(timer.waits).toEqual([1000]);
});

test("permanent inspection errors fail without publishing or waiting", async () => {
  const timer = clock();
  let writes = 0;
  await expect(
    ensureNpmPublication(
      "sdk@1",
      "wanted",
      async () => {
        throw new Error("HTTP 403");
      },
      () => {
        writes++;
      },
      timer.options
    )
  ).rejects.toThrow("HTTP 403");
  expect(writes).toBe(0);
  expect(timer.waits).toEqual([]);
});

test("registry inspection distinguishes missing, transient and permanent responses", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const status = Number(new URL(request.url).pathname.slice(1));
      return Response.json({ dist: { integrity: "wanted" } }, { status });
    },
  });
  try {
    for (const status of [408, 429, 500, 503]) {
      await expect(
        inspectNpmIntegrity(`${server.url}${status}`, AbortSignal.timeout(1000))
      ).rejects.toBeInstanceOf(TransientRegistryError);
    }
    expect(
      await inspectNpmIntegrity(`${server.url}404`, AbortSignal.timeout(1000))
    ).toBeNull();
    expect(
      await inspectNpmIntegrity(`${server.url}200`, AbortSignal.timeout(1000))
    ).toBe("wanted");
    await expect(
      inspectNpmIntegrity(`${server.url}403`, AbortSignal.timeout(1000))
    ).rejects.toThrow("HTTP 403");
  } finally {
    server.stop(true);
  }
});

test("registry transport timeouts are transient", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("Read deadline reached", "TimeoutError"));
  await expect(
    inspectNpmIntegrity(
      "https://registry.npmjs.org/example/1.0.0",
      controller.signal
    )
  ).rejects.toBeInstanceOf(TransientRegistryError);
});
