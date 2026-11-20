import { BlockGameIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import Link from "next/link";
import { Container } from "@/components/elements/container";
import { EnterpriseArtwork } from "@/components/elements/enterprise-artwork";
import { ExtensionsArtwork } from "@/components/elements/extensions-artwork";
import { ExtensionTip } from "@/components/elements/extension-tip";
import { StorageArtwork } from "@/components/elements/storage-artwork";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { enterpriseCopy } from "@/data/enterprise";
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
		enterpriseDescription: string;
	}
> = {
	en: {
		tools: "Make room for more.",
		toolsSubtitle:
			"Install community extensions or build your own to extend Lunaris.",
		explore: "Explore",
		device: "On your device",
		server: "Your server",
		enterprise: "Manage access across your organization.",
		enterpriseDescription:
			"With Enterprise, give your team single sign-on (SSO), automate account provisioning with SCIM, and set permissions with custom roles.",
	},
	de: {
		tools: "Platz für mehr.",
		toolsSubtitle:
			"Installiere Erweiterungen aus der Community oder entwickle eigene für Lunaris.",
		explore: "Entdecken",
		device: "Auf deinem Gerät",
		server: "Dein Server",
		enterprise: "Zugriff für die ganze Organisation verwalten.",
		enterpriseDescription:
			"Mit Enterprise ermöglichst du die zentrale Anmeldung per SSO, automatisierst die Kontoverwaltung mit SCIM und steuerst Berechtigungen über eigene Rollen.",
	},
	es: {
		tools: "Haz sitio para más.",
		toolsSubtitle:
			"Personaliza Lunaris con extensiones de la comunidad o crea las tuyas.",
		explore: "Explorar",
		device: "En tu dispositivo",
		server: "Tu servidor",
		enterprise: "Gestiona el acceso de toda tu organización.",
		enterpriseDescription:
			"Con Enterprise, ofrece inicio de sesión único con SSO, automatiza la gestión de cuentas con SCIM y define permisos con roles personalizados.",
	},
	fr: {
		tools: "Faites place à de nouvelles possibilités.",
		toolsSubtitle:
			"Personnalisez Lunaris avec les extensions de la communauté ou créez les vôtres.",
		explore: "Découvrir",
		device: "Sur votre appareil",
		server: "Votre serveur",
		enterprise: "Gérez les accès de votre organisation.",
		enterpriseDescription:
			"Avec Enterprise, proposez une connexion unique avec le SSO, automatisez la gestion des comptes avec SCIM et définissez les permissions avec des rôles personnalisés.",
	},
	"pt-BR": {
		tools: "Abra espaço para mais.",
		toolsSubtitle:
			"Personalize o Lunaris com extensões da comunidade ou crie as suas.",
		explore: "Explorar",
		device: "No seu dispositivo",
		server: "Seu servidor",
		enterprise: "Gerencie o acesso em toda a organização.",
		enterpriseDescription:
			"Com o plano Enterprise, ofereça login único com SSO, automatize o provisionamento de contas com SCIM e defina permissões com funções personalizadas.",
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
						<ExtensionsArtwork />
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
				className="border-t border-current/10 py-14 sm:py-20"
			>
				<Container className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
					<div>
						<h2
							id="ownership-heading"
							className="max-w-[17ch] text-balance font-display text-4xl/none tracking-tight sm:text-5xl/none"
						>
							{home.ownershipTitle}
						</h2>
						<dl className="mt-6 max-w-lg divide-y divide-current/10">
							{(
								[
									["device", text.device],
									["cloud", "Lunaris Cloud"],
									["server", text.server],
								] as const
							).map(([kind, label]) => (
								<div
									key={kind}
									className="grid gap-1 py-3 sm:grid-cols-[8.5rem_1fr] sm:gap-3"
								>
									<dt className="font-medium">{label}</dt>
									<dd className="text-base/6 text-olive-700 dark:text-olive-300">
										{home.ownershipOptions[kind]}
									</dd>
								</div>
							))}
						</dl>
					</div>
					<StorageArtwork />
				</Container>
			</section>
			<section
				aria-labelledby="enterprise-heading"
				id="enterprise"
				className="border-y border-current/10 py-14 sm:py-20"
			>
				<Container className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
					<div className="lg:col-start-2 lg:row-start-1">
						<h2
							id="enterprise-heading"
							className="max-w-[19ch] text-balance font-display text-4xl/none tracking-tight sm:text-5xl/none"
						>
							{text.enterprise}
						</h2>
						<p className="mt-4 max-w-md text-pretty text-base/7 text-olive-700 dark:text-olive-300">
							{text.enterpriseDescription}
						</p>
						<Link
							className={`${link} mt-3`}
							href={localePath(locale, "/enterprise")}
						>
							{enterpriseCopy[locale].detailsLink}
							<ArrowNarrowRightIcon />
						</Link>
					</div>
					<div className="lg:col-start-1 lg:row-start-1">
						<EnterpriseArtwork />
					</div>
				</Container>
			</section>
		</>
	);
}
