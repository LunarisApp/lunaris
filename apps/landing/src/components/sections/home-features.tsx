import { BlockGameIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import Link from "next/link";
import { Container } from "@/components/elements/container";
import { FeatureSymbol } from "@/components/elements/feature-symbol";
import { ExtensionTip } from "@/components/elements/extension-tip";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { extensionCatalog } from "@/data/extension-catalog";
import { extensionQuickstartUrl, extensionsCopy } from "@/data/extensions";
import { homepageCopy } from "@/data/homepage";
import { repositoryUrl } from "@/data/open-source";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { localePath } from "@/i18n/locale-path";

const copy: Record<
	Locale,
	{
		title: string;
		enterprise: string;
		description: string;
		together: string;
		tools: string;
		buildTitle: string;
		buildDescription: string;
		explore: string;
		device: string;
		server: string;
		roles: string;
	}
> = {
	en: {
		together: "Write together.",
		tools: "Make it your workspace.",
		buildTitle: "Build your own extension.",
		buildDescription:
			"Create a private tool with the Extensions SDK. Your team can open it right inside the workspace.",
		explore: "Explore",
		device: "On your device",
		server: "Your server",
		roles: "Custom roles",
		title: "Built for the way your team works.",
		enterprise: "Ready for your organization.",
		description:
			"Give every teammate the right access, with controls that grow with your organization.",
	},
	de: {
		together: "Gemeinsam schreiben.",
		tools: "Dein Workspace, deine Werkzeuge.",
		buildTitle: "Entwickle deine eigene Erweiterung.",
		buildDescription:
			"Mit dem Erweiterungs-SDK kannst du ein internes Werkzeug entwickeln, das dein Team direkt im Workspace öffnet.",
		explore: "Entdecken",
		device: "Auf deinem Gerät",
		server: "Dein Server",
		roles: "Eigene Rollen",
		title: "Gemacht für die Arbeitsweise deines Teams.",
		enterprise: "Bereit für deine Organisation.",
		description:
			"Gib jedem Teammitglied den passenden Zugriff – mit Kontrolle, die mit deiner Organisation wächst.",
	},
	es: {
		together: "Escribe en equipo.",
		tools: "Haz tuyo el espacio.",
		buildTitle: "Crea tu propia extensión.",
		buildDescription:
			"Usa el SDK de extensiones para crear una herramienta privada que tu equipo pueda abrir en su espacio de trabajo.",
		explore: "Explorar",
		device: "En tu dispositivo",
		server: "Tu servidor",
		roles: "Roles personalizados",
		title: "Hecho para la forma de trabajar de tu equipo.",
		enterprise: "Listo para tu organización.",
		description:
			"Da a cada persona el acceso adecuado, con controles que crecen con tu organización.",
	},
	fr: {
		together: "Écrivez ensemble.",
		tools: "Un espace à votre image.",
		buildTitle: "Créez votre propre extension.",
		buildDescription:
			"Avec le SDK d’extensions, créez un outil privé que votre équipe pourra ouvrir directement dans son espace de travail.",
		explore: "Découvrir",
		device: "Sur votre appareil",
		server: "Votre serveur",
		roles: "Rôles personnalisés",
		title: "Pensé pour la façon de travailler de votre équipe.",
		enterprise: "Prêt pour votre organisation.",
		description:
			"Donnez à chacun les bons accès, avec des contrôles qui évoluent avec votre organisation.",
	},
	"pt-BR": {
		together: "Escrevam juntos.",
		tools: "Seu espaço, suas ferramentas.",
		buildTitle: "Crie sua própria extensão.",
		buildDescription:
			"Use o SDK de extensões para criar uma ferramenta privada que sua equipe possa abrir no próprio espaço de trabalho.",
		explore: "Explorar",
		device: "No seu dispositivo",
		server: "Seu servidor",
		roles: "Funções personalizadas",
		title: "Feito para o jeito que sua equipe trabalha.",
		enterprise: "Pronto para sua organização.",
		description:
			"Dê a cada pessoa o acesso certo, com controles que crescem com sua organização.",
	},
};

const heading =
	"font-display text-3xl/none tracking-tight text-balance sm:text-4xl/none";
const body = "mt-3 max-w-md text-base/6 text-olive-700 dark:text-olive-300";
const link =
	"inline-flex min-h-11 items-center gap-2 text-sm/6 font-medium underline-offset-4 hover:underline";

export function HomeFeatures({
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
		<>
			<section
				aria-labelledby="features-heading"
				id="features"
				className="border-t border-olive-950/10 py-14 sm:py-20 dark:border-white/10"
			>
				<Container>
					<h2
						className="max-w-[26ch] font-display text-4xl/none tracking-tight text-balance text-olive-950 sm:text-5xl/none dark:text-olive-100"
						id="features-heading"
					>
						{text.title}
					</h2>
					<div className="mt-8 grid gap-8 sm:mt-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
						<article className="writing-stage text-olive-950 dark:text-white">
							<div className="writing-sheet bg-olive-100 dark:bg-olive-950">
								<h3 className="font-display text-[clamp(2.4rem,4.8vw,4.5rem)] leading-none tracking-tight text-balance">
									<span className="shared-selection">{text.together}</span>
								</h3>
								<p className="mt-5 max-w-[34ch] text-base/7">
									{features.collaboration.subheadline}
								</p>
								<div aria-hidden="true" className="manuscript-lines" />
							</div>
						</article>
						<div className="grid content-center gap-5 text-olive-950 dark:text-olive-100">
							<article id="extensions">
								<h3 className={heading}>{text.tools}</h3>
								<p className={body}>{extensions.homeDescription}</p>
								<ul className="mt-5 mb-2 grid max-w-md grid-cols-2 gap-y-2 min-[390px]:grid-cols-4 sm:gap-x-2">
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
											<span className="grid size-14 place-items-center rounded-xl border border-current/20 transition-colors group-hover:bg-olive-200 sm:size-16 dark:group-hover:bg-olive-800">
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
							</article>
							<article className="border-t border-olive-950/15 pt-5 dark:border-white/15">
								<h3 className={heading}>{text.buildTitle}</h3>
								<p className={body}>{text.buildDescription}</p>
								<a className={link} href={extensionQuickstartUrl}>
									{extensions.build}
									<ArrowNarrowRightIcon />
								</a>
							</article>
						</div>
					</div>
				</Container>
			</section>
			<section
				aria-labelledby="ownership-heading"
				id="your-workspace"
				className="border-y border-olive-950/10 py-16 text-olive-950 dark:text-white sm:py-24 dark:border-white/10"
			>
				<Container>
					<header className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
						<h2
							id="ownership-heading"
							className="font-display text-4xl/none tracking-tight text-balance sm:text-5xl/none"
						>
							{home.ownershipTitle}
						</h2>
						<a className={link} href={repositoryUrl}>
							{home.source}
							<ArrowNarrowRightIcon />
						</a>
					</header>
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
										{home.ownershipOptions[kind]}
									</p>
									{kind === "server" && (
										<Link
											className={link}
											href={localePath(locale, "/self-hosted")}
										>
											{home.selfHost}
											<ArrowNarrowRightIcon />
										</Link>
									)}
								</div>
							</li>
						))}
					</ul>
					<article className="grid items-center gap-4 border-t border-current/15 pt-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
						<div>
							<h3 className="text-2xl/8 font-medium tracking-tight">
								{text.enterprise}
							</h3>
							<p className="mt-2 max-w-xl text-base/6 text-olive-700 dark:text-olive-300">
								{text.description}
							</p>
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
