import type { DrainContext } from "evlog";
import { createEvlog } from "evlog/next";
import { createDrainPipeline } from "evlog/pipeline";
import { createPostHogDrain } from "evlog/posthog";

const posthogDrain = process.env.POSTHOG_API_KEY
	? createDrainPipeline<DrainContext>({
			batch: { intervalMs: 1000, size: 10 },
			onDropped: (events) => {
				process.stderr.write(
					`${JSON.stringify({
						droppedEvents: events.length,
						level: "error",
						message: "PostHog log delivery exhausted retries",
						service: "landing",
					})}\n`,
				);
			},
		})(createPostHogDrain())
	: undefined;
const commitHash = process.env.RAILWAY_GIT_COMMIT_SHA;

export const { createError, useLogger, withEvlog } = createEvlog({
	drain: posthogDrain,
	env: {
		environment: process.env.NODE_ENV,
		service: "landing",
		version: commitHash?.slice(0, 7) ?? "local",
		...(commitHash ? { commitHash } : {}),
	},
	redact: true,
	service: "landing",
});
