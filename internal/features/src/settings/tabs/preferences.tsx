"use client";

import { buttonVariants } from "@lunarisapp/ui/components/button";
import { Label } from "@lunarisapp/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@lunarisapp/ui/components/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@lunarisapp/ui/components/select";
import { Switch } from "@lunarisapp/ui/components/switch";
import { useTheme } from "next-themes";
import posthog from "posthog-js";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useDebugLogging } from "../../debug-logging/context";
import { useFontFamily } from "../../font-family/context";
import { useFontSize } from "../../font-size/context";
import { useLocale } from "../../locale/context";
import { SUPPORTED_LOCALES } from "../../locale/i18n";
import type { CookieSettingsLinkProps } from "../types";

function ThemePreviewLines({ lineClass }: { lineClass: string }) {
	return (
		<div className="p-2 space-y-1.5">
			<div className={`h-1.5 w-3/4 rounded-full ${lineClass}`} />
			<div className={`h-1.5 w-1/2 rounded-full ${lineClass}`} />
			<div className={`h-1.5 w-2/3 rounded-full ${lineClass}`} />
		</div>
	);
}

function ThemePreview({ mode }: { mode: "system" | "light" | "dark" }) {
	if (mode === "system") {
		return (
			<div className="w-full h-12 rounded-md border border-border/50 relative overflow-hidden">
				<div
					className="absolute inset-0 bg-white"
					style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
				>
					<ThemePreviewLines lineClass="bg-zinc-200" />
				</div>
				<div
					className="absolute inset-0 bg-zinc-800"
					style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
				>
					<ThemePreviewLines lineClass="bg-zinc-600" />
				</div>
			</div>
		);
	}

	const bg = mode === "dark" ? "bg-zinc-800" : "bg-white";
	const line = mode === "dark" ? "bg-zinc-600" : "bg-zinc-200";

	return (
		<div className={`w-full h-12 rounded-md border border-border/50 ${bg}`}>
			<ThemePreviewLines lineClass={line} />
		</div>
	);
}

function ThemePicker({
	theme,
	onThemeChange,
}: {
	theme: string | undefined;
	onThemeChange: (value: string) => void;
}) {
	const { t } = useTranslation();

	const themes = [
		{ id: "system", label: t("settings.preferences.themeSystem") },
		{ id: "light", label: t("settings.preferences.themeLight") },
		{ id: "dark", label: t("settings.preferences.themeDark") },
	] as const;

	return (
		<div className="space-y-2">
			<p className="text-xs font-medium" id="settings-theme-label">
				{t("settings.preferences.themeMode")}
			</p>
			<RadioGroup
				aria-labelledby="settings-theme-label"
				onValueChange={onThemeChange}
				value={theme}
			>
				<div className="grid grid-cols-3 gap-3">
					{themes.map((opt) => (
						<label
							className="flex-1 cursor-pointer"
							data-testid={`settings-preferences-theme-${opt.id}`}
							htmlFor={`settings-theme-${opt.id}`}
							key={opt.id}
						>
								<div
									className={`flex flex-col items-center gap-2 rounded-lg p-2 transition-colors ${
										theme === opt.id
											? "bg-muted"
											: "hover:bg-muted/50"
									}`}
							>
								<ThemePreview mode={opt.id} />
								<div className="flex items-center gap-1.5">
									<RadioGroupItem
										id={`settings-theme-${opt.id}`}
										value={opt.id}
									/>
									<span className="text-xs font-medium">{opt.label}</span>
								</div>
							</div>
						</label>
					))}
				</div>
			</RadioGroup>
		</div>
	);
}

function TypographySection({
	fontSize,
	fontFamily,
	onFontSizeChange,
	onFontFamilyChange,
}: {
	fontSize: string;
	fontFamily: string;
	onFontSizeChange: (value: string) => void;
	onFontFamilyChange: (value: string) => void;
}) {
	const { t } = useTranslation();

	const fontSizes = [
		{ id: "compact", label: t("settings.preferences.fontSizeCompact") },
		{ id: "large", label: t("settings.preferences.fontSizeLarge") },
		{ id: "extra-large", label: t("settings.preferences.fontSizeExtraLarge") },
	];

	const fontFamilies = [
		{
			id: "default",
			label: t("settings.preferences.fontDefault"),
			previewClass: "font-family-default",
		},
		{
			id: "serif",
			label: t("settings.preferences.fontSerif"),
			previewClass: "font-family-serif",
		},
		{
			id: "dyslexic",
			label: t("settings.preferences.fontDyslexic"),
			previewClass: "font-family-dyslexic",
		},
	];

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<p className="text-xs font-medium" id="settings-font-size-label">
					{t("settings.preferences.fontSize")}
				</p>
				<RadioGroup
					aria-labelledby="settings-font-size-label"
					onValueChange={onFontSizeChange}
					value={fontSize}
				>
					<div className="grid grid-cols-1 items-stretch divide-y overflow-hidden rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
						{fontSizes.map((size) => (
							<label
								className="min-w-0 cursor-pointer"
								data-testid={`settings-preferences-font-size-${size.id}`}
								htmlFor={`settings-font-size-${size.id}`}
								key={size.id}
							>
								<div
									className={`flex h-full min-h-11 items-center justify-start gap-2 px-3 py-2 transition-colors sm:min-h-9 sm:justify-center ${
									fontSize === size.id
										? "bg-muted"
										: "hover:bg-muted/50"
								}`}
							>
									<RadioGroupItem
										id={`settings-font-size-${size.id}`}
										value={size.id}
									/>
									<span className="min-w-0 text-sm font-medium leading-tight sm:text-center">
										{size.label}
									</span>
								</div>
							</label>
						))}
					</div>
				</RadioGroup>
			</div>

			<div className="space-y-2">
				<p className="text-xs font-medium" id="settings-font-family-label">
					{t("settings.preferences.font")}
				</p>
				<RadioGroup
					aria-labelledby="settings-font-family-label"
					onValueChange={onFontFamilyChange}
					value={fontFamily}
				>
					<div className="grid grid-cols-1 items-stretch divide-y overflow-hidden rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
						{fontFamilies.map((family) => (
							<label
								className="min-w-0 cursor-pointer"
								data-testid={`settings-preferences-font-family-${family.id}`}
								htmlFor={`settings-font-family-${family.id}`}
								key={family.id}
							>
								<div
									className={`flex h-full min-h-11 items-center justify-start gap-2 px-3 py-2 transition-colors sm:min-h-9 sm:justify-center ${
									fontFamily === family.id
										? "bg-muted"
										: "hover:bg-muted/50"
								}`}
							>
									<RadioGroupItem
										id={`settings-font-family-${family.id}`}
										value={family.id}
									/>
									<span
										aria-hidden="true"
										className={`font-semibold text-lg leading-none ${family.previewClass}`}
									>
										Aa
									</span>
									<span className="text-muted-foreground min-w-0 text-xs font-medium leading-tight sm:text-center">
										{family.label}
									</span>
								</div>
							</label>
						))}
					</div>
				</RadioGroup>
			</div>
		</div>
	);
}

function LanguagePicker({
	locale,
	onLocaleChange,
}: {
	locale: string;
	onLocaleChange: (value: string | null) => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="space-y-2">
			<Label className="text-xs" htmlFor="settings-locale">
				{t("settings.preferences.language")}
			</Label>
			<Select onValueChange={onLocaleChange} value={locale}>
				<SelectTrigger
					className="w-full"
					data-testid="settings-preferences-locale-trigger"
					id="settings-locale"
				>
					<SelectValue>
						{(value: string | null) => {
							const loc = SUPPORTED_LOCALES.find((l) => l.code === value);
							return loc ? `${loc.nativeLabel} (${loc.label})` : value;
						}}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{SUPPORTED_LOCALES.map((loc) => (
						<SelectItem
							data-testid={`settings-preferences-locale-${loc.code}`}
							key={loc.code}
							value={loc.code}
						>
							{loc.nativeLabel}{" "}
							<span className="text-muted-foreground">({loc.label})</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function PreferencesContent({
	CookieSettingsLink,
}: {
	CookieSettingsLink?: ComponentType<CookieSettingsLinkProps>;
}) {
	const { t } = useTranslation();
	const { fontSize, setFontSize } = useFontSize();
	const { fontFamily, setFontFamily } = useFontFamily();
	const { theme, setTheme } = useTheme();
	const { locale, setLocale } = useLocale();
	const { debugLogging, setDebugLogging } = useDebugLogging();

	return (
		<div className="space-y-10" data-testid="settings-panel-preferences">
			<section
				aria-labelledby="language-heading"
				className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8"
			>
				<h2 className="text-sm font-medium" id="language-heading">
					{t("settings.preferences.languageRegion")}
				</h2>
				<div className="max-w-md">
					<LanguagePicker
						locale={locale}
						onLocaleChange={(value) => {
							if (!value) return;
							setLocale(value as "en" | "es");
							posthog.capture("language_changed", { locale: value });
						}}
					/>
				</div>
			</section>

			{CookieSettingsLink ? (
				<section
					aria-labelledby="privacy-heading"
					className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8"
				>
					<h2 className="text-sm font-medium" id="privacy-heading">
						{t("settings.preferences.privacy")}
					</h2>
					<div className="flex max-w-2xl items-center justify-between gap-4">
						<p className="text-muted-foreground text-xs">
							{t("settings.preferences.cookieSettingsDescription")}
						</p>
						<CookieSettingsLink
							className={buttonVariants({
								className: "cursor-pointer",
								size: "sm",
								variant: "outline",
							})}
						>
							{t("settings.preferences.cookieSettings")}
						</CookieSettingsLink>
					</div>
				</section>
			) : null}

			<section
				aria-labelledby="appearance-heading"
				className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8"
			>
				<h2 className="text-sm font-medium" id="appearance-heading">
					{t("settings.preferences.appearance")}
				</h2>
				<div className="max-w-2xl space-y-7">
					<ThemePicker
						onThemeChange={(value) => {
							setTheme(value);
							posthog.capture("theme_changed", { theme: value });
						}}
						theme={theme}
					/>
					<TypographySection
						fontFamily={fontFamily}
						fontSize={fontSize}
						onFontFamilyChange={(v) => {
							setFontFamily(v as "default" | "serif" | "dyslexic");
							posthog.capture("font_family_changed", { family: v });
						}}
						onFontSizeChange={(v) => {
							setFontSize(v as "compact" | "large" | "extra-large");
							posthog.capture("font_size_changed", { size: v });
						}}
					/>
				</div>
			</section>

			<section
				aria-labelledby="developer-heading"
				className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8"
			>
				<h2 className="text-sm font-medium" id="developer-heading">
					{t("settings.preferences.developer")}
				</h2>
				<div className="flex max-w-2xl items-center justify-between gap-4">
					<div className="space-y-0.5">
						<Label className="text-xs" htmlFor="settings-debug-logging">
							{t("settings.preferences.debugLogging")}
						</Label>
						<p
							className="text-muted-foreground text-xs"
							id="settings-debug-logging-description"
						>
							{t("settings.preferences.debugLoggingDescription")}
						</p>
					</div>
					<Switch
						aria-describedby="settings-debug-logging-description"
						checked={debugLogging}
						data-testid="settings-preferences-debug-logging"
						id="settings-debug-logging"
						onCheckedChange={(checked) => {
							setDebugLogging(checked);
							posthog.capture("debug_logging_toggled", { enabled: checked });
						}}
						size="sm"
					/>
				</div>
			</section>
		</div>
	);
}
