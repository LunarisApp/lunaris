import { getConsent } from "@probo/cookie-banner/consent";
import { initPostHogBrowser } from "@repo/utils/posthog-browser";
import posthog from "posthog-js";
import {
	posthogApiHost,
	posthogKey,
	posthogUiHost,
} from "./lib/posthog-config";

let posthogInitialized = false;
const consent = getConsent();

function initializePostHogWithConsent(
	categories: Readonly<Record<string, boolean>>,
) {
	if (posthogInitialized) return;
	const analyticsAllowed = categories.analytics === true;

	posthogInitialized = initPostHogBrowser(posthog, {
		apiHost: posthogApiHost,
		appSurface: "landing",
		autocapture: false,
		capturePageview: "history_change",
		cookielessMode: "on_reject",
		environment: process.env.NODE_ENV,
		key: posthogKey,
		optOutCapturingByDefault: !analyticsAllowed,
		optOutPersistenceByDefault: !analyticsAllowed,
		persistence: "localStorage+cookie",
		uiHost: posthogUiHost,
	});

	if (!posthogInitialized) return;

	consent.onChange((categories) => {
		if (categories.analytics === true) {
			posthog.opt_in_capturing({ captureEventName: false });
			return;
		}

		posthog.opt_out_capturing();
	});
}

consent.onReady(initializePostHogWithConsent);
