import Github from "@thesvg/react/github";
import Linkedin from "@thesvg/react/linkedin";
import X from "@thesvg/react/x";
import type { Metadata } from "next";
import Image from "next/image";
import { TrackedButtonLink } from "@/components/analytics/tracked-button-link";
import { LanguageSwitcher } from "@/components/elements/language-switcher";
import { Main } from "@/components/elements/main";
import { ProboCookieBanner } from "@/components/elements/probo-cookie-banner";
import {
	Footer,
	FooterCategory,
	FooterCookieSettingsLink,
	FooterLink,
} from "@/components/sections/footer";
import {
	type NavGroup,
	NavbarWithLinksAndActions,
} from "@/components/sections/navbar-with-links-and-actions";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { type Locale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localePath } from "@/i18n/locale-path";
import { brandIcons, localizedAlternates } from "@/i18n/metadata";
import { legalDocumentPaths } from "@/lib/legal-document-links";

import { openSourceCopy, repositoryUrl } from "@/data/open-source";
import { extensionQuickstartUrl, extensionsCopy } from "@/data/extensions";
import { homepageCopy } from "@/data/homepage";

const DOCS_URL = "https://docs.lunaris.app";
const LINKEDIN_URL = "https://www.linkedin.com/company/lunarisapp";
const TRUST_CENTER_URL = "https://trust.lunaris.app";
const X_URL = "https://x.com/lunarisapp";

export async function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);

	return {
		title: dict.meta.title,
		description: dict.meta.description,
		icons: brandIcons,
		alternates: localizedAlternates(locale, "/"),
	};
}

export default async function LocaleLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);
	const source = openSourceCopy[locale];
	const home = homepageCopy[locale];
	const menu = dict.nav.menu;
	const comparisons = {
		label: dict.footer.compare,
		links: [
			{
				label: dict.footer.linearComparison,
				href: localePath(locale, "/compare/linear"),
			},
			{
				label: dict.footer.obsidianComparison,
				href: localePath(locale, "/compare/obsidian"),
			},
			{
				label: dict.footer.notionComparison,
				href: localePath(locale, "/compare/notion"),
			},
		],
	};
	const documentation = { label: dict.nav.docs, href: DOCS_URL };
	const contact = {
		label: dict.footer.contact,
		href: localePath(locale, "/demo"),
	};
	const trust = { label: dict.footer.trustCenter, href: TRUST_CENTER_URL };
	const subprocessors = {
		label: dict.footer.subprocessors,
		href: "/subprocessors",
	};
	const wordCounter = {
		label: dict.footer.wordCounter,
		href: localePath(locale, "/tools/word-counter"),
	};
	const github = { label: "GitHub", href: repositoryUrl };
	const product: NavGroup = {
		label: dict.nav.product,
		links: [
			{
				label: dict.nav.productTour,
				href: localePath(locale, "/watch"),
				icon: "tour",
				description: menu.tour,
			},
			{
				label: extensionsCopy[locale].nav,
				href: localePath(locale, "/extensions"),
				icon: "extensions",
				description: menu.extensions,
			},
			{
				label: dict.nav.mcp,
				href: localePath(locale, "/mcp"),
				icon: "mcp",
				description: menu.mcp,
			},
		],
		related: comparisons,
	};
	const developers: NavGroup = {
		label: dict.nav.developers,
		links: [
			{
				label: "CLI",
				href: localePath(locale, "/downloads#cli"),
				icon: "cli",
				description: menu.cli,
			},
			{
				label: dict.nav.extensionsSdk,
				href: extensionQuickstartUrl,
				icon: "sdk",
				description: menu.sdk,
			},
			{
				label: source.label,
				href: localePath(locale, "/self-hosted"),
				icon: "hosting",
				description: menu.hosting,
			},
		],
		related: { label: dict.footer.resources, links: [documentation, github] },
	};
	const resources: NavGroup = {
		label: dict.footer.resources,
		links: [
			{ ...documentation, icon: "docs", description: menu.docs },
			{ ...contact, icon: "contact", description: menu.contact },
		],
		related: { label: menu.security, links: [trust, subprocessors] },
	};
	const directLinks = [
		{ label: dict.nav.pricing, href: localePath(locale, "/pricing") },
		{ label: dict.nav.downloads, href: localePath(locale, "/downloads") },
	];

	return (
		<html lang={locale} suppressHydrationWarning>
			<head>
				<ThemeScript />
				<link href="https://fonts.googleapis.com" rel="preconnect" />
				<link
					crossOrigin=""
					href="https://fonts.gstatic.com"
					rel="preconnect"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
					rel="stylesheet"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,100..1000;1,100..1000&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body>
				<ProboCookieBanner />
				<ThemeProvider>
					<NavbarWithLinksAndActions
						skipLabel={dict.accessibility.skipToContent}
						groups={[product, developers, resources]}
						directLinks={directLinks}
						appLink={
							<TrackedButtonLink
								analyticsProperties={{
									cta: "open_web_app",
									destination: "web",
									location: "navbar",
								}}
								className="min-h-11 px-5"
								href="https://web.lunaris.app"
							>
								{home.open}
							</TrackedButtonLink>
						}
						settings={
							<>
								<LanguageSwitcher
									currentLocale={locale}
									label={dict.accessibility.switchLanguage}
								/>
								<ThemeSwitcher
									labels={{
										toggle: dict.accessibility.switchTheme,
										light: dict.accessibility.lightTheme,
										dark: dict.accessibility.darkTheme,
										system: dict.accessibility.systemTheme,
									}}
								/>
							</>
						}
						openMenuLabel={dict.accessibility.openMenu}
						closeMenuLabel={dict.accessibility.closeMenu}
						navigationLabel={dict.accessibility.primaryNavigation}
						homeHref={localePath(locale, "/")}
						logo={
							<span className="inline-flex items-center gap-2.5">
								<Image
									alt=""
									className="size-8 shrink-0 dark:hidden"
									height={32}
									src="/img/lunaris-mark-light.svg"
									width={32}
								/>
								<Image
									alt=""
									className="hidden size-8 shrink-0 dark:block"
									height={32}
									src="/img/lunaris-mark-dark.svg"
									width={32}
								/>
								<span className="font-wordmark text-xl/none font-[650] tracking-[0.04em] text-olive-950 uppercase dark:text-white">
									Lunaris
								</span>
							</span>
						}
					/>

					<Main id="main-content" tabIndex={-1}>
						{children}
					</Main>

					<Footer
						fineprint={
							<div className="flex items-center justify-between gap-6">
								<span>{dict.footer.fineprint}</span>
								<div className="flex items-center gap-3">
									<a
										aria-label="GitHub"
										className="transition-colors hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-600 dark:hover:text-white"
										href={repositoryUrl}
									>
										<Github
											variant="mono"
											aria-hidden="true"
											className="size-5"
										/>
									</a>
									<a
										aria-label="LinkedIn"
										className="transition-colors hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-600 dark:hover:text-white"
										href={LINKEDIN_URL}
									>
										<Linkedin
											aria-hidden="true"
											className="size-5 [&_path]:fill-current"
										/>
									</a>
									<a
										aria-label="X"
										className="transition-colors hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-600 dark:hover:text-white"
										href={X_URL}
									>
										<X variant="mono" aria-hidden="true" className="size-5" />
									</a>
								</div>
							</div>
						}
						id="footer"
						links={
							<>
								{[
									product,
									{ ...developers, links: [...developers.links, github] },
									comparisons,
									{
										...resources,
										links: [
											...directLinks,
											documentation,
											wordCounter,
											contact,
										],
									},
								].map((group) => (
									<FooterCategory key={group.label} title={group.label}>
										{group.links.map((link) => (
											<FooterLink key={link.href} href={link.href}>
												{link.label}
											</FooterLink>
										))}
									</FooterCategory>
								))}
								<FooterCategory title={dict.footer.legal}>
									<FooterLink href={legalDocumentPaths.privacy}>
										{dict.footer.privacyPolicy}
									</FooterLink>
									<FooterLink href={legalDocumentPaths.cookies}>
										{dict.footer.cookiePolicy}
									</FooterLink>
									<FooterCookieSettingsLink>
										{dict.footer.cookieSettings}
									</FooterCookieSettingsLink>
									<FooterLink href={legalDocumentPaths.terms}>
										{dict.footer.termsOfService}
									</FooterLink>
									<FooterLink href={subprocessors.href}>
										{dict.footer.subprocessors}
									</FooterLink>
									<FooterLink href={trust.href}>
										{dict.footer.trustCenter}
									</FooterLink>
								</FooterCategory>
							</>
						}
						navigationLabel={dict.accessibility.footerNavigation}
					/>
				</ThemeProvider>
			</body>
		</html>
	);
}
