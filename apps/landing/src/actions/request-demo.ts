"use server";

import { Resend } from "resend";
import { createError, useLogger, withEvlog } from "@/lib/evlog";

export type FormState = {
	status: "idle" | "success" | "error";
	message: string;
	fieldErrors?: Partial<Record<DemoField, FieldErrorCode>>;
};

export type DemoField =
	| "name"
	| "email"
	| "company"
	| "companySize"
	| "message";

type FieldErrorCode = "required" | "invalid" | "tooLong";

const VALID_COMPANY_SIZES = new Set(["small", "medium", "large", "xl", "xxl"]);
const MAX_LENGTHS = {
	name: 100,
	email: 254,
	company: 200,
	message: 5000,
} as const;

async function requestDemoAction(
	_prevState: FormState,
	formData: FormData,
): Promise<FormState> {
	const log = useLogger();
	log.set({ action: "request_demo", source: "server_action" });

	// Honeypot — silently "succeed" for bots that fill the hidden field.
	if (formData.get("website")) {
		log.set({ demoRequest: { outcome: "honeypot" } });
		return { status: "success", message: "honeypot" };
	}

	const name = String(formData.get("name") ?? "").trim();
	const email = String(formData.get("email") ?? "").trim();
	const company = String(formData.get("company") ?? "").trim();
	const companySize = String(formData.get("companySize") ?? "").trim();
	const message = String(formData.get("message") ?? "").trim();

	const fieldErrors: NonNullable<FormState["fieldErrors"]> = {};
	if (!name) fieldErrors.name = "required";
	else if (name.length > MAX_LENGTHS.name) fieldErrors.name = "tooLong";
	if (!email) fieldErrors.email = "required";
	else if (
		email.length > MAX_LENGTHS.email ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
	)
		fieldErrors.email = "invalid";
	if (!company) fieldErrors.company = "required";
	else if (company.length > MAX_LENGTHS.company)
		fieldErrors.company = "tooLong";
	if (!companySize || !VALID_COMPANY_SIZES.has(companySize))
		fieldErrors.companySize = "required";
	if (!message) fieldErrors.message = "required";
	else if (message.length > MAX_LENGTHS.message)
		fieldErrors.message = "tooLong";

	if (Object.keys(fieldErrors).length > 0) {
		log.set({
			demoRequest: {
				invalidFields: Object.keys(fieldErrors),
				outcome: "validation_error",
			},
		});
		return { status: "error", message: "validation", fieldErrors };
	}

	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.RESEND_FROM_EMAIL;
	if (!(apiKey && from)) {
		log.error(
			createError({
				fix: "Set RESEND_API_KEY and RESEND_FROM_EMAIL in the landing service",
				internal: {
					fromEmailConfigured: Boolean(from),
					resendApiKeyConfigured: Boolean(apiKey),
				},
				message: "Demo request email is not configured",
				why: "One or more required Resend environment variables are missing",
			}),
			{ demoRequest: { outcome: "configuration_error" } },
		);
		return { status: "error", message: "internal" };
	}

	const to = "hello@lunaris.app";
	const text = [
		`Name: ${name}`,
		`Email: ${email}`,
		`Company: ${company}`,
		`Company size: ${companySize}`,
		"",
		"Message:",
		message,
	].join("\n");

	try {
		const resend = new Resend(apiKey);
		const { error } = await resend.emails.send({
			from,
			to,
			replyTo: email,
			subject: `Organization consultation: ${company}`,
			text,
		});

		if (error) {
			log.error(
				createError({
					fix: "Inspect Resend delivery status and landing email configuration",
					internal: { providerErrorName: error.name },
					message: "Demo request email was rejected",
					why: "Resend returned an unsuccessful delivery response",
				}),
				{
					demoRequest: {
						emailProvider: "resend",
						outcome: "provider_error",
					},
				},
			);
			return { status: "error", message: "internal" };
		}

		log.set({
			demoRequest: {
				companySize,
				emailProvider: "resend",
				outcome: "success",
			},
		});
		return { status: "success", message: "" };
	} catch (err) {
		const cause = err instanceof Error ? err : new Error("Unknown Resend error");
		log.error(
			createError({
				cause,
				fix: "Check Resend availability and retry the demo request",
				message: "Demo request email delivery failed",
				why: "Resend threw while sending the consultation request",
			}),
			{
				demoRequest: {
					emailProvider: "resend",
					outcome: "exception",
				},
			},
		);
		return { status: "error", message: "internal" };
	}
}

export const requestDemo = withEvlog(requestDemoAction);
