"use client";

import posthog from "posthog-js";
import { posthogConfigured } from "./posthog-config";

type EventProperty = boolean | number | string | null;

export function captureLandingEvent(
	event: string,
	properties?: Record<string, EventProperty | EventProperty[]>,
) {
	if (!posthogConfigured) return;
	posthog.capture(event, properties);
}
