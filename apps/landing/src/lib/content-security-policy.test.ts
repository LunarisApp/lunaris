import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const landingDirectory = fileURLToPath(new URL("../../", import.meta.url));

test.each(["development", "production"])(
	"CSP allows eval only in development (%s)",
	(mode) => {
		// Fresh processes keep Next config's module-level environment evaluation isolated.
		const result = Bun.spawnSync(
			[
				process.execPath,
				"-e",
				`
		import config from "./next.config.ts";
		import { proxy } from "./src/proxy.ts";
		import { NextRequest } from "next/server";
		const rules = await config.headers();
		const configured = rules[0].headers.find(header => header.key === "Content-Security-Policy").value;
		const proxied = proxy(new NextRequest("http://localhost/download/windows")).headers.get("Content-Security-Policy");
		console.log(JSON.stringify([configured, proxied]));
	`,
			],
			{ cwd: landingDirectory, env: { ...process.env, NODE_ENV: mode } },
		);
		expect(result.exitCode).toBe(0);
		const policies = JSON.parse(result.stdout.toString()) as string[];
		for (const policy of policies) {
			expect(policy.includes("'unsafe-eval'")).toBe(mode === "development");
			expect(policy).toContain("object-src 'none'");
		}
	},
);
