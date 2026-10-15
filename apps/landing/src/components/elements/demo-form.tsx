"use client";

import { clsx } from "clsx/lite";
import { useActionState, useEffect, useRef, useState } from "react";
import {
	type DemoField,
	type FormState,
	requestDemo,
} from "@/actions/request-demo";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { captureLandingEvent } from "@/lib/posthog";
import { Button } from "./button";

const initialState: FormState = { status: "idle", message: "" };

const fieldClass =
	"w-full rounded-xl bg-white px-4 py-2.5 text-sm/7 text-olive-950 placeholder:text-olive-600 inset-ring-1 inset-ring-olive-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700 dark:focus-visible:outline-olive-200 focus:inset-ring-2 focus:inset-ring-olive-950/30 dark:bg-white/5 dark:text-white dark:placeholder:text-olive-400 dark:inset-ring-white/10 dark:focus:inset-ring-white/30";

const labelClass = "block text-sm/6 font-medium text-olive-950 dark:text-white";

const errorClass = "mt-1 text-sm text-red-600 dark:text-red-400";

const fieldIds: Record<DemoField, string> = {
	name: "demo-name",
	email: "demo-email",
	company: "demo-company",
	companySize: "demo-company-size",
	message: "demo-message",
};

const fields: DemoField[] = [
	"name",
	"email",
	"company",
	"companySize",
	"message",
];

export function DemoForm({ copy }: { copy: Dictionary["demoPage"]["form"] }) {
	const [state, formAction, isPending] = useActionState(
		requestDemo,
		initialState,
	);
	const lastTrackedState = useRef(state);

	// Controlled inputs so values survive React 19's automatic form reset after each server action.
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [company, setCompany] = useState("");
	const [companySize, setCompanySize] = useState("");
	const [message, setMessage] = useState("");

	useEffect(() => {
		if (state.message !== "validation") return;

		const firstInvalidField = fields.find(
			(field) => state.fieldErrors?.[field],
		);
		if (firstInvalidField) {
			document.getElementById(fieldIds[firstInvalidField])?.focus();
		}
	}, [state.fieldErrors, state.message]);

	useEffect(() => {
		if (lastTrackedState.current === state) return;
		lastTrackedState.current = state;

		if (state.status === "success") {
			if (state.message === "honeypot") return;
			captureLandingEvent("demo_request_succeeded", {
				company_size: companySize,
			});
			return;
		}

		if (state.status !== "error") return;
		captureLandingEvent("demo_request_failed", {
			company_size: companySize || null,
			failure_type: state.message,
			invalid_fields: Object.keys(state.fieldErrors ?? {}),
		});
	}, [companySize, state]);

	if (state.status === "success") {
		return (
			<div
				className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl bg-olive-950/5 p-8 text-center dark:bg-white/5"
				role="status"
			>
				<h2 className="font-['Instrument_Serif'] text-3xl text-olive-950 dark:text-white">
					{copy.successTitle}
				</h2>
				<p className="text-sm/6 text-olive-950/70 dark:text-white/70">
					{copy.successBody}
				</p>
			</div>
		);
	}

	const fieldError = (key: keyof NonNullable<FormState["fieldErrors"]>) => {
		const code = state.fieldErrors?.[key];
		if (!code) return null;
		const text =
			code === "invalid"
				? copy.errorEmail
				: code === "tooLong"
					? copy.errorTooLong
					: copy.errorRequired;
		return (
			<p className={errorClass} id={`${fieldIds[key]}-error`}>
				{text}
			</p>
		);
	};

	const errorDescription = (key: DemoField) =>
		state.fieldErrors?.[key] ? `${fieldIds[key]}-error` : undefined;

	const showGenericError =
		state.status === "error" && state.message === "internal";

	return (
		<form
			action={formAction}
			className="ph-no-capture mx-auto flex w-full max-w-xl flex-col gap-5"
			noValidate
			onSubmit={(event) => {
				if (new FormData(event.currentTarget).get("website")) return;
				captureLandingEvent("demo_request_submitted", {
					company_size: companySize || null,
				});
			}}
		>
			<div aria-hidden className="sr-only">
				<label>
					Website
					<input autoComplete="off" name="website" tabIndex={-1} type="text" />
				</label>
			</div>

			<div>
				<label className={labelClass} htmlFor="demo-name">
					{copy.nameLabel}
				</label>
				<input
					aria-describedby={errorDescription("name")}
					aria-invalid={state.fieldErrors?.name ? true : undefined}
					autoComplete="name"
					className={clsx(fieldClass, "mt-1.5")}
					id="demo-name"
					maxLength={100}
					name="name"
					onChange={(e) => setName(e.target.value)}
					placeholder={copy.namePlaceholder}
					required
					type="text"
					value={name}
				/>
				{fieldError("name")}
			</div>

			<div>
				<label className={labelClass} htmlFor="demo-email">
					{copy.emailLabel}
				</label>
				<input
					aria-describedby={errorDescription("email")}
					aria-invalid={state.fieldErrors?.email ? true : undefined}
					autoComplete="email"
					className={clsx(fieldClass, "mt-1.5")}
					id="demo-email"
					maxLength={254}
					name="email"
					onChange={(e) => setEmail(e.target.value)}
					placeholder={copy.emailPlaceholder}
					required
					type="email"
					value={email}
				/>
				{fieldError("email")}
			</div>

			<div>
				<label className={labelClass} htmlFor="demo-company">
					{copy.companyLabel}
				</label>
				<input
					aria-describedby={errorDescription("company")}
					aria-invalid={state.fieldErrors?.company ? true : undefined}
					autoComplete="organization"
					className={clsx(fieldClass, "mt-1.5")}
					id="demo-company"
					maxLength={200}
					name="company"
					onChange={(e) => setCompany(e.target.value)}
					placeholder={copy.companyPlaceholder}
					required
					type="text"
					value={company}
				/>
				{fieldError("company")}
			</div>

			<div>
				<label className={labelClass} htmlFor="demo-company-size">
					{copy.companySizeLabel}
				</label>
				<select
					aria-describedby={errorDescription("companySize")}
					aria-invalid={state.fieldErrors?.companySize ? true : undefined}
					className={clsx(fieldClass, "mt-1.5")}
					id="demo-company-size"
					name="companySize"
					onChange={(e) => setCompanySize(e.target.value)}
					required
					value={companySize}
				>
					<option disabled value="">
						{copy.companySizePlaceholder}
					</option>
					<option value="small">{copy.companySizeOptions.small}</option>
					<option value="medium">{copy.companySizeOptions.medium}</option>
					<option value="large">{copy.companySizeOptions.large}</option>
					<option value="xl">{copy.companySizeOptions.xl}</option>
					<option value="xxl">{copy.companySizeOptions.xxl}</option>
				</select>
				{fieldError("companySize")}
			</div>

			<div>
				<label className={labelClass} htmlFor="demo-message">
					{copy.messageLabel}
				</label>
				<textarea
					aria-describedby={errorDescription("message")}
					aria-invalid={state.fieldErrors?.message ? true : undefined}
					className={clsx(fieldClass, "mt-1.5 resize-y")}
					id="demo-message"
					maxLength={5000}
					name="message"
					onChange={(e) => setMessage(e.target.value)}
					placeholder={copy.messagePlaceholder}
					required
					rows={5}
					value={message}
				/>
				{fieldError("message")}
			</div>

			{showGenericError && (
				<p
					className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-300"
					role="alert"
				>
					{copy.errorGeneric}
				</p>
			)}

			<Button
				className="self-start"
				disabled={isPending}
				size="lg"
				type="submit"
			>
				{isPending ? copy.submitting : copy.submit}
			</Button>
		</form>
	);
}
