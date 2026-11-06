import type { Locale } from "@/i18n/config";

type DownloadsCopy = {
	subtitle: string;
	mac: string;
	windows: string;
	linux: string;
	browser: string;
};

export const downloadsCopy: Record<Locale, DownloadsCopy> = {
	en: {
		subtitle: "Your workspace, at home on your desktop.",
		mac: "Apple Silicon & Intel · macOS 13 or later",
		windows: "64-bit Intel & AMD",
		linux: "Debian & Ubuntu · 64-bit Intel & AMD",
		browser: "Prefer your browser?",
	},
	es: {
		subtitle: "Tu espacio de trabajo, en tu escritorio.",
		mac: "Apple Silicon e Intel · macOS 13 o posterior",
		windows: "Intel y AMD de 64 bits",
		linux: "Debian y Ubuntu · Intel y AMD de 64 bits",
		browser: "¿Prefieres el navegador?",
	},
	fr: {
		subtitle: "Votre espace de travail, sur votre ordinateur.",
		mac: "Apple Silicon et Intel · macOS 13 ou version ultérieure",
		windows: "Intel et AMD 64 bits",
		linux: "Debian et Ubuntu · Intel et AMD 64 bits",
		browser: "Vous préférez votre navigateur ?",
	},
	de: {
		subtitle: "Dein Workspace, zu Hause auf deinem Desktop.",
		mac: "Apple Silicon & Intel · macOS 13 oder neuer",
		windows: "Intel & AMD mit 64 Bit",
		linux: "Debian & Ubuntu · Intel & AMD mit 64 Bit",
		browser: "Lieber im Browser?",
	},
	"pt-BR": {
		subtitle: "Seu espaço de trabalho, no seu computador.",
		mac: "Apple Silicon e Intel · macOS 13 ou posterior",
		windows: "Intel e AMD de 64 bits",
		linux: "Debian e Ubuntu · Intel e AMD de 64 bits",
		browser: "Prefere usar o navegador?",
	},
};
