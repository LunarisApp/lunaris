import { BlockGameIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import Link from "next/link";
import { Container } from "@/components/elements/container";
import { FeatureSymbol } from "@/components/elements/feature-symbol";
import { ExtensionShowcase } from "@/components/elements/extension-showcase";
import { ExtensionTip } from "@/components/elements/extension-tip";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { extensionCatalog } from "@/data/extension-catalog";
import { extensionQuickstartUrl, extensionsCopy } from "@/data/extensions";
import { homepageCopy } from "@/data/homepage";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";

const copy: Record<
	Locale,
	{
		enterprise: string;
		tools: string;
		toolsSubtitle: string;
		explore: string;
		device: string;
		server: string;
		roles: string;
	}
> = {
	en: {
		tools: "Make room for more.",
		toolsSubtitle:
			"Install community extensions or build your own to extend Lunaris.",
		explore: "Explore",
		device: "On your device",
		server: "Your server",
		roles: "Custom roles",
		enterprise: "Ready for your organization.",
	},
	de: {
		tools: "Platz für mehr.",
		toolsSubtitle:
			"Installiere Erweiterungen aus der Community oder entwickle eigene für Lunaris.",
		explore: "Entdecken",
		device: "Auf deinem Gerät",
		server: "Dein Server",
		roles: "Eigene Rollen",
		enterprise: "Bereit für deine Organisation.",
	},
	es: {
		tools: "Haz sitio para más.",
		toolsSubtitle:
			"Personaliza Lunaris con extensiones de la comunidad o crea las tuyas.",
		explore: "Explorar",
		device: "En tu dispositivo",
		server: "Tu servidor",
		roles: "Roles personalizados",
		enterprise: "Listo para tu organización.",
	},
	fr: {
		tools: "Faites place à de nouvelles possibilités.",
		toolsSubtitle:
			"Personnalisez Lunaris avec les extensions de la communauté ou créez les vôtres.",
		explore: "Découvrir",
		device: "Sur votre appareil",
		server: "Votre serveur",
		roles: "Rôles personnalisés",
		enterprise: "Prêt pour votre organisation.",
	},
	"pt-BR": {
		tools: "Abra espaço para mais.",
		toolsSubtitle:
			"Personalize o Lunaris com extensões da comunidade ou crie as suas.",
		explore: "Explorar",
		device: "No seu dispositivo",
		server: "Seu servidor",
		roles: "Funções personalizadas",
		enterprise: "Pronto para sua organização.",
	},
};

const link =
	"inline-flex min-h-11 items-center gap-2 text-sm/6 font-medium underline-offset-4 hover:underline";

export function HomeFeatures({ locale }: { locale: Locale }) {
	const text = copy[locale];
	const home = homepageCopy[locale];
	const extensions = extensionsCopy[locale];

	return (
		<>
			<section
				aria-labelledby="features-heading"
				id="features"
				className="border-t border-olive-950/10 py-14 sm:py-20 dark:border-white/10"
			>
				<Container>
					<h2
						id="features-heading"
						className="font-display text-4xl/none tracking-tight sm:text-5xl/none"
					>
						{text.tools}
					</h2>
					<p className="mt-3 max-w-2xl text-pretty text-base/7 text-olive-700 dark:text-olive-300">
						{text.toolsSubtitle}
					</p>
					<div className="mt-5 grid items-center gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-20">
						<ExtensionShowcase locale={locale} />
						<article
							id="extensions"
							className="min-w-0 text-olive-950 dark:text-olive-100"
						>
							<ul className="mb-2 grid max-w-md grid-cols-2 gap-y-2 min-[390px]:grid-cols-4 sm:gap-x-2">
								{(["spreadsheet", "mini-app", "exporter"] as const).map(
									(id) => (
										<li key={id} className="group/extension">
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
									),
								)}
								<li>
									<Link
										className="group flex flex-col items-center gap-2 rounded-xl py-2 text-center text-[0.8125rem]/5 font-medium hover:underline underline-offset-4"
										href={localePath(locale, "/extensions")}
										aria-label={extensions.explore}
									>
										<span className="grid size-14 place-items-center rounded-xl border border-current/20 bg-olive-100 dark:bg-olive-950 transition-colors group-hover:bg-olive-200 sm:size-16 dark:group-hover:bg-olive-800">
											<HugeiconsIcon
												aria-hidden="true"
												className="size-6"
												icon={BlockGameIcon}
											/>
										</span>
										{text.explore}
									</Link>
								</li>
							</ul>
							<div className="mt-3 flex max-w-md justify-end border-t border-current/15 pt-2">
								<a className={link} href={extensionQuickstartUrl}>
									{extensions.build}
									<ArrowNarrowRightIcon />
								</a>
							</div>
						</article>
					</div>
				</Container>
			</section>
			<section
				aria-labelledby="ownership-heading"
				id="your-workspace"
				className="border-y border-olive-950/10 py-16 text-olive-950 dark:text-white sm:py-24 dark:border-white/10"
			>
				<Container>
					<h2
						id="ownership-heading"
						className="font-display text-4xl/none tracking-tight text-balance sm:text-5xl/none"
					>
						{home.ownershipTitle}
					</h2>
					<ul className="mt-6 grid gap-6 border-t border-current/15 py-8 sm:mt-8 sm:grid-cols-3 sm:gap-8 sm:py-10">
						{(
							[
								{ kind: "device", label: text.device },
								{ kind: "cloud", label: "Lunaris Cloud" },
								{ kind: "server", label: text.server },
							] as const
						).map(({ kind, label }) => (
							<li
								key={kind}
								className="grid grid-cols-[auto_1fr] items-start gap-x-4 sm:block"
							>
								<FeatureSymbol
									kind={kind}
									className="mt-1 size-6 sm:mt-0 sm:mb-4"
								/>
								<div>
									<h3 className="text-xl/7 font-medium tracking-tight">
										{label}
									</h3>
									<p className="mt-1 max-w-[34ch] text-base/6 text-olive-700 dark:text-olive-300">
										{kind === "server" ? (
											<Link
												className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
												href={localePath(locale, "/self-hosted")}
											>
												{home.ownershipOptions.server}
												<ArrowNarrowRightIcon />
											</Link>
										) : (
											home.ownershipOptions[kind]
										)}
									</p>
								</div>
							</li>
						))}
					</ul>
					<article className="grid items-center gap-4 border-t border-current/15 pt-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
						<div>
							<h3 className="text-2xl/8 font-medium tracking-tight">
								{text.enterprise}
							</h3>
							<ul className="mt-2 flex flex-wrap gap-x-4 text-sm/6 text-olive-700 dark:text-olive-300">
								<li>SSO</li>
								<li className="list-inside list-disc">SCIM</li>
								<li className="list-inside list-disc">{text.roles}</li>
							</ul>
						</div>
						<Link className={link} href={localePath(locale, "/pricing")}>
							{home.pricing}
							<ArrowNarrowRightIcon />
						</Link>
					</article>
				</Container>
			</section>
		</>
	);
}
