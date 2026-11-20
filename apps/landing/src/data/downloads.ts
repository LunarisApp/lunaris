import type { Locale } from "@/i18n/config";

type DownloadsCopy = {
	subtitle: string;
	mac: string;
	windows: string;
	linux: string;
	webApp: string;
	browser: string;
	copyCommand: string;
	manualCopy: string;
};

export const downloadsCopy: Record<Locale, DownloadsCopy> = {
	en: {
		copyCommand: "Copy Homebrew command",
		manualCopy: "Select the command and copy it manually.",
		subtitle: "Your workspace on the web and desktop.",
		mac: "Apple Silicon & Intel · macOS 13 or later",
		windows: "64-bit Intel & AMD",
		linux: "Debian & Ubuntu · 64-bit Intel & AMD",
		webApp: "Web app",
		browser: "Use Lunaris directly in your browser.",
	},
	es: {
		copyCommand: "Copiar el comando de Homebrew",
		manualCopy: "Selecciona el comando y cópialo manualmente.",
		subtitle: "Tu espacio de trabajo en la web y en tu escritorio.",
		mac: "Apple Silicon e Intel · macOS 13 o posterior",
		windows: "Intel y AMD de 64 bits",
		linux: "Debian y Ubuntu · Intel y AMD de 64 bits",
		webApp: "App web",
		browser: "Usa Lunaris directamente en tu navegador.",
	},
	fr: {
		copyCommand: "Copier la commande Homebrew",
		manualCopy: "Sélectionnez la commande et copiez-la manuellement.",
		subtitle: "Votre espace de travail sur le web et sur votre ordinateur.",
		mac: "Apple Silicon et Intel · macOS 13 ou version ultérieure",
		windows: "Intel et AMD 64 bits",
		linux: "Debian et Ubuntu · Intel et AMD 64 bits",
		webApp: "App web",
		browser: "Utilisez Lunaris directement dans votre navigateur.",
	},
	de: {
		copyCommand: "Homebrew-Befehl kopieren",
		manualCopy: "Wähle den Befehl aus und kopiere ihn manuell.",
		subtitle: "Dein Workspace im Web und auf dem Desktop.",
		mac: "Apple Silicon & Intel · macOS 13 oder neuer",
		windows: "Intel & AMD mit 64 Bit",
		linux: "Debian & Ubuntu · Intel & AMD mit 64 Bit",
		webApp: "Web-App",
		browser: "Nutze Lunaris direkt im Browser.",
	},
	"pt-BR": {
		copyCommand: "Copiar comando do Homebrew",
		manualCopy: "Selecione o comando e copie-o manualmente.",
		subtitle: "Seu espaço de trabalho na web e no seu computador.",
		mac: "Apple Silicon e Intel · macOS 13 ou posterior",
		windows: "Intel e AMD de 64 bits",
		linux: "Debian e Ubuntu · Intel e AMD de 64 bits",
		webApp: "App web",
		browser: "Use o Lunaris diretamente no navegador.",
	},
};
