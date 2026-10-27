import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/elements/container";
import { ExtensionTip } from "@/components/elements/extension-tip";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { extensionCatalog } from "@/data/extension-catalog";
import { extensionsCopy } from "@/data/extensions";
import { homepageCopy } from "@/data/homepage";
import { repositoryUrl } from "@/data/open-source";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { localePath } from "@/i18n/locale-path";

const copy: Record<
	Locale,
	{ title: string; enterprise: string; description: string }
> = {
	en: {
		title: "Built for the way your team works.",
		enterprise: "Ready for your organization.",
		description: "Enterprise: SSO, SCIM, and custom roles for your team.",
	},
	de: {
		title: "Gemacht für die Arbeitsweise deines Teams.",
		enterprise: "Bereit für deine Organisation.",
		description: "Enterprise: SSO, SCIM und eigene Rollen für dein Team.",
	},
	es: {
		title: "Hecho para la forma de trabajar de tu equipo.",
		enterprise: "Listo para tu organización.",
		description: "Enterprise: SSO, SCIM y roles personalizados para tu equipo.",
	},
	fr: {
		title: "Pensé pour la façon de travailler de votre équipe.",
		enterprise: "Prêt pour votre organisation.",
		description:
			"Enterprise : SSO, SCIM et rôles personnalisés pour votre équipe.",
	},
	"pt-BR": {
		title: "Feito para o jeito que sua equipe trabalha.",
		enterprise: "Pronto para sua organização.",
		description:
			"Enterprise: SSO, SCIM e funções personalizadas para sua equipe.",
	},
};

const tile =
	"min-w-0 rounded-xl border border-olive-950/20 bg-olive-50 p-6 dark:border-white/20 dark:bg-olive-900";
const heading =
	"font-display text-3xl/9 tracking-tight text-balance text-olive-950 dark:text-olive-100";
const body = "mt-3 max-w-lg text-sm/7 text-olive-700 dark:text-olive-300";
const link =
	"mt-4 inline-flex min-h-11 items-center gap-2 text-sm/6 font-medium text-olive-950 underline-offset-4 hover:underline dark:text-olive-100";

export function HomeFeaturePrototype({
	locale,
	dictionary,
}: {
	locale: Locale;
	dictionary: Dictionary;
}) {
	const text = copy[locale];
	const features = dictionary.bentoFeatures.items;
	const home = homepageCopy[locale];
	const extensions = extensionsCopy[locale];
	return (
		<section
			aria-labelledby="features-heading"
			className="pb-6 sm:pb-10"
			id="features"
		>
			<Container>
				<h2
					className="mb-8 max-w-2xl font-display text-4xl/11 tracking-tight text-balance text-olive-950 sm:text-5xl/13 dark:text-olive-100"
					id="features-heading"
				>
					{text.title}
				</h2>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
					<article
						className={`${tile} flex flex-col sm:col-span-2 lg:col-span-4 lg:row-span-2`}
					>
						<h3 className={heading}>{features.collaboration.headline}</h3>
						<p className={body}>{features.collaboration.subheadline}</p>
						<Image
							alt={dictionary.accessibility.demoVideoDescription}
							className="mt-8 w-full rounded-lg grayscale"
							height={720}
							src="/video/demo-poster.jpg"
							width={1280}
						/>
					</article>
					<article className={`${tile} lg:col-span-2`}>
						<h3 className={heading}>{features.offlineFirst.headline}</h3>
						<p className={body}>{features.offlineFirst.subheadline}</p>
					</article>
					<article className={`${tile} lg:col-span-2`} id="extensions">
						<h3 className={heading}>{features.extensions.headline}</h3>
						<p className={body}>{features.extensions.subheadline}</p>
						<ul className="mt-4 flex flex-wrap gap-4">
							{(["spreadsheet", "mini-app", "exporter"] as const).map((id) => (
								<li key={id}>
									<ExtensionTip
										id={id}
										src={
											extensionCatalog.find((entry) => entry.slug === id)
												?.iconUrl
										}
										name={extensions.homeTools[id]}
										description={extensions.items[id]?.description ?? ""}
										href={localePath(locale, `/extensions/${id}`)}
									/>
								</li>
							))}
						</ul>
						<Link className={link} href={localePath(locale, "/extensions")}>
							{extensions.explore}
							<ArrowNarrowRightIcon />
						</Link>
					</article>
					<article className={`${tile} lg:col-span-3`}>
						<h3 className={heading}>{text.enterprise}</h3>
						<p className={body}>{text.description}</p>
						<Link className={link} href={localePath(locale, "/pricing")}>
							{home.pricing}
							<ArrowNarrowRightIcon />
						</Link>
					</article>
					<article className={`${tile} lg:col-span-3`} id="your-workspace">
						<h3 className={heading}>{home.ownershipTitle}</h3>
						<p className={body}>{home.ownershipDescription}</p>
						<div className="flex flex-wrap gap-x-6">
							<Link className={link} href={localePath(locale, "/self-hosted")}>
								{home.selfHost}
								<ArrowNarrowRightIcon />
							</Link>
							<a className={link} href={repositoryUrl}>
								{home.source}
								<ArrowNarrowRightIcon />
							</a>
						</div>
					</article>
				</div>
			</Container>
		</section>
	);
}
