"use client";

import type { ComponentProps } from "react";
import {
	ButtonLink,
	SoftButtonLink,
} from "@/components/elements/button";
import { captureLandingEvent } from "@/lib/posthog";

type AnalyticsProperties = Record<
	string,
	boolean | number | string | null | (boolean | number | string | null)[]
>;

type TrackedLinkProps<T extends typeof ButtonLink | typeof SoftButtonLink> =
	ComponentProps<T> & {
		analyticsProperties: AnalyticsProperties;
	};

function captureCta(properties: AnalyticsProperties) {
	captureLandingEvent("landing_cta_clicked", properties);
}

export function TrackedButtonLink({
	analyticsProperties,
	onClick,
	...props
}: TrackedLinkProps<typeof ButtonLink>) {
	return (
		<ButtonLink
			onClick={(event) => {
				onClick?.(event);
				if (!event.defaultPrevented) captureCta(analyticsProperties);
			}}
			{...props}
		/>
	);
}

export function TrackedSoftButtonLink({
	analyticsProperties,
	onClick,
	...props
}: TrackedLinkProps<typeof SoftButtonLink>) {
	return (
		<SoftButtonLink
			onClick={(event) => {
				onClick?.(event);
				if (!event.defaultPrevented) captureCta(analyticsProperties);
			}}
			{...props}
		/>
	);
}
