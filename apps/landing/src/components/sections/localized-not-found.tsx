"use client";

import Image from "next/image";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Link } from "@/components/elements/link";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { HeroSimpleCentered } from "@/components/sections/hero-simple-centered";
import {
	defaultLocale,
	type Locale,
	locales,
} from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";

const copy: Record<
	Locale,
	{
		title: string;
		body: string;
		back: string;
		homeLabel: string;
	}
> = {
	en: {
		title: "Page not found",
		body: "The page you were looking for does not exist or may have moved.",
		back: "Go back home",
		homeLabel: "Lunaris home",
	},
	es: {
		title: "Página no encontrada",
		body: "La página que buscas no existe o puede haberse movido.",
		back: "Volver al inicio",
		homeLabel: "Inicio de Lunaris",
	},
	fr: {
		title: "Page introuvable",
		body: "La page que vous recherchez n’existe pas ou a peut-être été déplacée.",
		back: "Retour à l’accueil",
		homeLabel: "Accueil de Lunaris",
	},
	de: {
		title: "Seite nicht gefunden",
		body: "Die gesuchte Seite existiert nicht oder wurde möglicherweise verschoben.",
		back: "Zur Startseite",
		homeLabel: "Lunaris-Startseite",
	},
	"pt-BR": {
		title: "Página não encontrada",
		body: "A página que você procura não existe ou pode ter sido movida.",
		back: "Voltar ao início",
		homeLabel: "Início do Lunaris",
	},
};

function localeFromPathname(pathname: string): Locale {
	const candidate = pathname.split("/")[1];
	return locales.includes(candidate as Locale)
		? (candidate as Locale)
		: defaultLocale;
}

export function LocalizedNotFound({
	standalone = false,
}: {
	standalone?: boolean;
}) {
	const pathname = usePathname();
	const locale = localeFromPathname(pathname);
	const content = copy[locale];
	const homePath = localePath(locale, "/");

	useEffect(() => {
		document.documentElement.lang = locale;
		document.title = `${content.title} — Lunaris`;
	}, [content.title, locale]);

	if (!standalone) {
		return (
			<HeroSimpleCentered
				cta={
					<Link href={homePath}>
						{content.back} <ArrowNarrowRightIcon aria-hidden="true" />
					</Link>
				}
				headline={content.title}
				subheadline={<p>{content.body}</p>}
			/>
		);
	}

	return (
		<main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
			<NextLink
				aria-label={content.homeLabel}
				className="inline-flex items-center gap-2.5"
				href={homePath}
			>
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
				<span className="font-wordmark text-xl/none font-[650] tracking-[0.04em] uppercase">
					Lunaris
				</span>
			</NextLink>

			<p className="mt-16 text-sm font-medium tracking-[0.16em] text-olive-600 uppercase dark:text-olive-400">
				404
			</p>
			<h1 className="mt-4 font-display text-6xl/none tracking-tight sm:text-7xl">
				{content.title}
			</h1>
			<p className="mt-6 max-w-md text-base/7 text-olive-700 sm:text-lg/8 dark:text-olive-300">
				{content.body}
			</p>
			<NextLink
				className="mt-10 inline-flex items-center gap-2 rounded-full bg-olive-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-olive-800 dark:bg-olive-200 dark:text-olive-950 dark:hover:bg-white"
				href={homePath}
			>
				{content.back}
				<ArrowNarrowRightIcon aria-hidden="true" />
			</NextLink>
		</main>
	);
}
