import { expect, test } from "bun:test";
import { parseRailwayUpload, RailwayPackagingError } from "./railway-upload";

test("valid upload returns its deployment ID", () => {
  expect(
    parseRailwayUpload({
      ok: true,
      text: '{"deploymentId":"deployment"}',
      stderr: "",
    })
  ).toBe("deployment");
});

test("only structured missing-path archive errors permit retry", () => {
  const error = JSON.stringify({
    code: "ERROR",
    error:
      "/work/link: IO error for operation on /work/link: No such file or directory (os error 2)",
  });
  for (const stream of ["text", "stderr"] as const) {
    expect(() =>
      parseRailwayUpload({ ok: false, text: "", stderr: "", [stream]: error })
    ).toThrow(RailwayPackagingError);
  }
});

test("missing IDs, malformed output and remote failures retain unknown outcomes", () => {
  for (const result of [
    { ok: true, text: "{}", stderr: "" },
    {
      ok: false,
      text: '{"deploymentId":"deployment"}',
      stderr: JSON.stringify({
        code: "ERROR",
        error:
          "/work/link: IO error for operation on /work/link: No such file or directory (os error 2)",
      }),
    },
    { ok: true, text: "not JSON", stderr: "" },
    {
      ok: false,
      text: '{"deploymentId":"deployment"}',
      stderr: "connection reset",
    },
    {
      ok: false,
      text: "",
      stderr: '{"code":"UNAUTHORIZED","error":"Unauthorized"}',
    },
    {
      ok: false,
      text: "",
      stderr: '{"code":"ERROR","error":"No such file or directory"}',
    },
  ]) {
    expect(() => parseRailwayUpload(result)).toThrow("outcome unknown");
  }
});
