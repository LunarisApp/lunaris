import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/elements/container";
import { FeatureSymbol } from "@/components/elements/feature-symbol";
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
	{
		title: string;
		enterprise: string;
		description: string;
		together: string;
		tools: string;
		offline: string;
		device: string;
		server: string;
		roles: string;
		editorAlt: string;
	}
> = {
	en: {
		together: "Write together.",
		tools: "Make it your workspace.",
		offline: "No connection needed.",
		device: "On your device",
		server: "Your server",
		roles: "Custom roles",
		editorAlt: "A project brief open in the Lunaris editor.",
		title: "Built for the way your team works.",
		enterprise: "Ready for your organization.",
		description:
			"Give every teammate the right access, with controls that grow with your organization.",
	},
	de: {
		together: "Gemeinsam schreiben.",
		tools: "Dein Workspace, deine Werkzeuge.",
		offline: "Keine Verbindung nötig.",
		device: "Auf deinem Gerät",
		server: "Dein Server",
		roles: "Eigene Rollen",
		editorAlt: "Ein Projektbrief im Lunaris-Editor.",
		title: "Gemacht für die Arbeitsweise deines Teams.",
		enterprise: "Bereit für deine Organisation.",
		description:
			"Gib jedem Teammitglied den passenden Zugriff – mit Kontrolle, die mit deiner Organisation wächst.",
	},
	es: {
		together: "Escribe en equipo.",
		tools: "Haz tuyo el espacio.",
		offline: "Sin necesidad de conexión.",
		device: "En tu dispositivo",
		server: "Tu servidor",
		roles: "Roles personalizados",
		editorAlt: "Un resumen de proyecto en el editor de Lunaris.",
		title: "Hecho para la forma de trabajar de tu equipo.",
		enterprise: "Listo para tu organización.",
		description:
			"Da a cada persona el acceso adecuado, con controles que crecen con tu organización.",
	},
	fr: {
		together: "Écrivez ensemble.",
		tools: "Un espace à votre image.",
		offline: "Pas besoin de connexion.",
		device: "Sur votre appareil",
		server: "Votre serveur",
		roles: "Rôles personnalisés",
		editorAlt: "Un brief de projet ouvert dans l’éditeur Lunaris.",
		title: "Pensé pour la façon de travailler de votre équipe.",
		enterprise: "Prêt pour votre organisation.",
		description:
			"Donnez à chacun les bons accès, avec des contrôles qui évoluent avec votre organisation.",
	},
	"pt-BR": {
		together: "Escrevam juntos.",
		tools: "Seu espaço, suas ferramentas.",
		offline: "Sem precisar de conexão.",
		device: "No seu dispositivo",
		server: "Seu servidor",
		roles: "Funções personalizadas",
		editorAlt: "Um resumo de projeto aberto no editor do Lunaris.",
		title: "Feito para o jeito que sua equipe trabalha.",
		enterprise: "Pronto para sua organização.",
		description:
			"Dê a cada pessoa o acesso certo, com controles que crescem com sua organização.",
	},
};

const tile =
	"flex min-w-0 flex-col rounded-2xl border border-olive-950/10 bg-olive-50 p-6 sm:p-8 dark:border-white/10 dark:bg-olive-900";
const heading =
	"font-display text-3xl/9 tracking-tight text-balance text-olive-950 dark:text-olive-100";
const body = "mt-3 max-w-lg text-sm/6 text-olive-700 dark:text-olive-300";
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
					className="mb-10 max-w-3xl font-display text-4xl/11 tracking-tight text-balance text-olive-950 sm:text-5xl/13 dark:text-olive-100"
					id="features-heading"
				>
					{text.title}
				</h2>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-5">
					<article
						className={`${tile} sm:col-span-2 lg:col-span-8 lg:row-span-2`}
					>
						<h3 className={heading}>{text.together}</h3>
						<p className={body}>{features.collaboration.subheadline}</p>
						<Image
							alt={text.editorAlt}
							className="mt-8 w-full rounded-lg"
							height={720}
							src="/video/demo-poster.jpg"
							width={1280}
							sizes="(min-width: 1280px) 720px, (min-width: 1024px) 60vw, (min-width: 640px) 600px, 85vw"
						/>
					</article>
					<article className={`${tile} lg:col-span-4`}>
						<h3 className={heading}>{features.offlineFirst.headline}</h3>
						<p className={body}>{features.offlineFirst.subheadline}</p>
						<div className="mt-auto flex items-center gap-5 pt-8 text-olive-600 dark:text-olive-300">
							<FeatureSymbol kind="offline" className="size-12 shrink-0" />
							<span className="max-w-40 text-sm/6 font-medium">
								{text.offline}
							</span>
						</div>
					</article>
					<article className={`${tile} lg:col-span-4`} id="extensions">
						<h3 className={heading}>{text.tools}</h3>
						<p className={body}>{features.extensions.subheadline}</p>
						<ul className="mt-auto flex flex-wrap gap-4 pt-6">
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
					<article className={`${tile} lg:col-span-5`}>
						<h3 className={heading}>{text.enterprise}</h3>
						<p className={body}>{text.description}</p>
						<div className="mt-6 mb-4 flex items-center gap-5 text-olive-600 dark:text-olive-300">
							<FeatureSymbol kind="shield" className="size-10 shrink-0" />
							<ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm/6 font-medium">
								<li>Enterprise</li>
								<li>SSO</li>
								<li>SCIM</li>
								<li>{text.roles}</li>
							</ul>
						</div>
						<Link
							className={`${link} mt-auto self-start pt-2`}
							href={localePath(locale, "/pricing")}
						>
							{home.pricing}
							<ArrowNarrowRightIcon />
						</Link>
					</article>
					<article className={`${tile} lg:col-span-7`} id="your-workspace">
						<h3 className={heading}>{home.ownershipTitle}</h3>
						<p className={body}>{home.ownershipDescription}</p>
						<ul className="relative mt-7 mb-4 grid grid-cols-3 gap-3 text-center text-olive-600 before:absolute before:top-3.5 before:right-[16.66%] before:left-[16.66%] before:border-t before:border-olive-300 dark:text-olive-300 dark:before:border-olive-700">
							{(
								[
									{ kind: "device", label: text.device },
									{ kind: "cloud", label: "Lunaris Cloud" },
									{ kind: "server", label: text.server },
								] as const
							).map(({ kind, label }) => (
								<li
									key={kind}
									className="relative flex flex-col items-center gap-3"
								>
									<span className="bg-olive-50 px-3 dark:bg-olive-900">
										<FeatureSymbol kind={kind} />
									</span>
									<span className="text-xs/5 font-medium">{label}</span>
								</li>
							))}
						</ul>
						<div className="mt-auto flex flex-wrap gap-x-6">
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
