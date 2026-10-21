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
	NavbarLink,
	NavbarLogo,
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
import { homepageCopy } from "@/data/homepage";

const DOCS_URL = "https://docs.lunaris.app";
const GITHUB_URL = repositoryUrl;
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
					href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body>
				<ProboCookieBanner />
				<ThemeProvider>
					<a
						className="fixed top-3 left-3 z-50 -translate-y-24 rounded-full bg-olive-950 px-4 py-2 text-sm/6 font-medium text-white shadow-lg transition focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-olive-600 motion-reduce:transition-none dark:bg-olive-100 dark:text-olive-950"
						href="#main-content"
					>
						{dict.accessibility.skipToContent}
					</a>
					<NavbarWithLinksAndActions
						actions={
							<>
								<div className="hidden lg:block">
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
								</div>
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
						id="navbar"
						openMenuLabel={dict.accessibility.openMenu}
						closeMenuLabel={dict.accessibility.closeMenu}
						navigationLabel={dict.accessibility.primaryNavigation}
						links={
							<>
								<NavbarLink href={localePath(locale, "/pricing")}>
									{dict.nav.pricing}
								</NavbarLink>
								<NavbarLink href={DOCS_URL}>{dict.nav.docs}</NavbarLink>
								<NavbarLink href={localePath(locale, "/self-hosted")}>
									{source.label}
								</NavbarLink>
							</>
						}
						logo={
							<NavbarLogo href={localePath(locale, "/")}>
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
							</NavbarLogo>
						}
					/>

					<Main id="main-content" tabIndex={-1}>
						{children}
					</Main>

					<Footer
						cta={null}
						fineprint={
							<div className="flex flex-col items-start gap-3">
								<span>{dict.footer.fineprint}</span>
								<div className="flex items-center gap-3">
									<a
										aria-label="GitHub"
										className="transition-colors hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-600 dark:hover:text-white"
										href={GITHUB_URL}
									>
										<Github
											aria-hidden="true"
											className="size-5 [&_path]:fill-current"
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
										<X
											aria-hidden="true"
											className="size-5 [&_path]:fill-current"
										/>
									</a>
								</div>
							</div>
						}
						id="footer"
						links={
							<>
								<FooterCategory title={dict.footer.resources}>
									<FooterLink href={localePath(locale, "/self-hosted")}>
										{source.label}
									</FooterLink>
									<FooterLink href={GITHUB_URL}>GitHub</FooterLink>
									<FooterLink href={DOCS_URL}>{dict.nav.docs}</FooterLink>
									<FooterLink href={localePath(locale, "/pricing")}>
										{dict.nav.pricing}
									</FooterLink>
									<FooterLink href={localePath(locale, "/mcp")}>
										{dict.footer.mcp}
									</FooterLink>
									<FooterLink href={localePath(locale, "/demo")}>
										{dict.footer.contact}
									</FooterLink>
								</FooterCategory>
								<FooterCategory title={dict.footer.compare}>
									<FooterLink href={localePath(locale, "/compare/linear")}>
										{dict.footer.linearComparison}
									</FooterLink>
									<FooterLink href={localePath(locale, "/compare/obsidian")}>
										{dict.footer.obsidianComparison}
									</FooterLink>
									<FooterLink href={localePath(locale, "/compare/notion")}>
										{dict.footer.notionComparison}
									</FooterLink>
								</FooterCategory>
								<FooterCategory title={dict.footer.tool}>
									<FooterLink href={localePath(locale, "/tools/word-counter")}>
										{dict.footer.wordCounter}
									</FooterLink>
								</FooterCategory>
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
									<FooterLink href="/subprocessors">
										{dict.footer.subprocessors}
									</FooterLink>
									<FooterLink href={TRUST_CENTER_URL}>
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
