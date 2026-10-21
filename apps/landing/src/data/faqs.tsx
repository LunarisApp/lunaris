import { openSourceCopy, repositoryUrl } from "@/data/open-source";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/types";

const TRUST_CENTER_URL = "https://trust.lunaris.app";

function localePath(locale: Locale, path: string) {
	if (locale === "en") return path;
	return `/${locale}${path}`;
}

export function getFaqs(
	locale: Locale,
	dict: Dictionary,
): { id: string; question: string; answer: ReactNode }[] {
	const items = dict.faqs.items;
	const pricingHref = localePath(locale, "/pricing");

	return [
		{
			id: "faq-1",
			question: openSourceCopy[locale].license,
			answer: (
				<p>
					{openSourceCopy[locale].licenseDescription}{" "}
					<Link className="underline underline-offset-3" href={repositoryUrl}>
						{openSourceCopy[locale].github}
					</Link>
				</p>
			),
		},
		{
			id: "faq-2",
			question: items.free.question,
			answer: (
				<p>
					{items.free.answer.split("{pricingLink}")[0]}
					<Link className="underline underline-offset-3" href={pricingHref}>
						{dict.nav.pricing.toLowerCase()}
					</Link>
					{items.free.answer.split("{pricingLink}")[1]}
				</p>
			),
		},
		{
			id: "faq-3",
			question: items.offline.question,
			answer: items.offline.answer,
		},
		{
			id: "faq-4",
			question: items.security.question,
			answer: (
				<p>
					{items.security.answer.split("{trustCenterLink}")[0]}
					<Link
						className="underline underline-offset-3"
						href={TRUST_CENTER_URL}
					>
						{dict.footer.trustCenter}
					</Link>
					{items.security.answer.split("{trustCenterLink}")[1]}
				</p>
			),
		},
		{
			id: "faq-5",
			question: items.aiTraining.question,
			answer: items.aiTraining.answer,
		},
		{
			id: "faq-file-storage",
			question: items.fileStorage.question,
			answer: items.fileStorage.answer,
		},
		{
			id: "faq-storage-full",
			question: items.storageFull.question,
			answer: items.storageFull.answer,
		},
	];
}
