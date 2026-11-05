import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { models, Polar } from "@polar-sh/sdk/2026-10";
import { PolarConfig } from "./polar.config";
import { POLAR_CLIENT, PolarModule } from "./polar.module";

@Global()
@Module({
  providers: [
    {
      provide: PolarConfig,
      useValue: {
        enabled: true,
        values: { accessToken: "test-token", sandbox: true },
      },
    },
  ],
  exports: [PolarConfig],
})
class TestConfiguration {}

describe("Polar SDK HTTP contract", () => {
  let client: Polar;
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [TestConfiguration, PolarModule],
    }).compile();
    client = module.get(POLAR_CLIENT);
    fetchSpy = spyOn(globalThis, "fetch");
  });
  afterEach(() => fetchSpy.mockRestore());

  it("sends versioned checkout and portal bodies without changing organization metadata", async () => {
    fetchSpy.mockResolvedValue(Response.json({ url: "https://checkout.test" }));
    await client.checkouts.create({
      products: ["product-1"],
      external_customer_id: "owner-1",
      seats: 2,
      metadata: { referenceId: "organization-1" },
      success_url: "https://app.test/settings",
      return_url: "https://app.test/settings",
    });
    const [url, request] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://sandbox-api.polar.sh/v1/checkouts/");
    expect(new Headers(request?.headers).get("Polar-Version")).toBe("2026-10");
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer test-token"
    );
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(request?.body as string)).toMatchObject({
      external_customer_id: "owner-1",
      metadata: { referenceId: "organization-1" },
      seats: 2,
    });

    fetchSpy.mockResolvedValue(
      Response.json({ customer_portal_url: "https://portal.test" })
    );
    const session = await client.customerSessions.create({
      external_customer_id: "owner-1",
      external_member_id: "owner-1",
      return_url: "https://app.test/settings",
    });
    expect(session.customer_portal_url).toBe("https://portal.test");
    expect(JSON.parse(fetchSpy.mock.calls[1]![1]?.body as string)).toEqual({
      external_customer_id: "owner-1",
      external_member_id: "owner-1",
      return_url: "https://app.test/settings",
    });
  });

  it("visits every subscription page and preserves wire timestamps", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        Response.json({
          items: [{ id: "first", modified_at: "2026-10-01T00:00:00Z" }],
          pagination: { max_page: 2, total_count: 2 },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [{ id: "second" }],
          pagination: { max_page: 2, total_count: 2 },
        })
      );
    const items: models.Subscription[] = [];
    for await (const item of client.subscriptions.iterList({
      limit: 1,
      metadata: { referenceId: "organization-1" },
    })) {
      items.push(item);
    }
    expect(items.map((item) => item.id)).toEqual(["first", "second"]);
    expect(items[0]?.modified_at).toBe("2026-10-01T00:00:00Z");
    expect(
      new URL(fetchSpy.mock.calls[1]![0] as string).searchParams.get("page")
    ).toBe("2");
    expect(
      new URL(fetchSpy.mock.calls[1]![0] as string).searchParams.get(
        "metadata[referenceId]"
      )
    ).toBe("organization-1");
  });

  it("does not retry rate-limited writes while database locks are held", async () => {
    fetchSpy.mockResolvedValue(
      new Response("{}", { status: 429, headers: { "Retry-After": "5" } })
    );
    await expect(
      client.subscriptions.update("subscription-1", {
        seats: 3,
        proration_behavior: "prorate",
      })
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string)).toEqual({
      seats: 3,
      proration_behavior: "prorate",
    });
  });
});
