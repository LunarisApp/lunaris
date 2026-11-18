import type { INestApplication } from "@nestjs/common";
import request from "supertest";

// Exercise the real Node HTTP server; simulated streams do not complete on Bun.
export async function injectHttp(
  app: INestApplication,
  options: {
    method: "GET" | "POST" | "OPTIONS";
    url: string;
    headers?: Record<string, string | undefined>;
    payload?: object | string;
  }
) {
  const client = request(app.getHttpServer());
  const response = await client[
    options.method.toLowerCase() as "get" | "post" | "options"
  ](options.url)
    .set(
      Object.fromEntries(
        Object.entries(options.headers ?? {}).filter(
          (entry): entry is [string, string] => entry[1] !== undefined
        )
      )
    )
    .send(options.payload);
  return {
    statusCode: response.status,
    headers: response.headers as import("node:http").IncomingHttpHeaders,
    body: response.text,
    json: <T = unknown>(): T => response.body,
  };
}
