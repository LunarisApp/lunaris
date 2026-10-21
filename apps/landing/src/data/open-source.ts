import type { Locale } from "@/i18n/config";

export const repositoryUrl = "https://github.com/LunarisApp/lunaris";
export const selfHostingGuideUrl = `${repositoryUrl}/blob/next/infra/self-host/README.md`;
export const selfHostCommand =
	"curl -fsSL https://lunaris.app/install.sh | bash";

type OpenSourceCopy = {
	label: string;
	headline: string;
	description: string;
	badge: string;
	github: string;
	selfHostHeadline: string;
	selfHostDescription: string;
	guide: string;
	requirements: string;
	server: string;
	docker: string;
	domain: string;
	install: string;
	installDescription: string;
	nextStep: string;
	operations: string;
	operationsDescription: string;
	license: string;
	licenseDescription: string;
	licenseLink: string;
	cloud: string;
	cloudDescription: string;
	pricing: string;
};

export const openSourceCopy: Record<Locale, OpenSourceCopy> = {
	en: {
		label: "Self-hosted",
		headline: "Open-source writing. Your workspace, your server.",
		description:
			"An offline-first word processor with an open-source Community Edition. Write, collaborate, and extend your workspace on your terms.",
		badge: "Built in the open",
		github: "Explore the source on GitHub",
		selfHostHeadline: "Run Lunaris on your own server.",
		selfHostDescription:
			"Deploy Community Edition with Docker Compose. Keep writing, collaboration, sync, and file storage on infrastructure you control.",
		guide: "Read the deployment guide",
		requirements: "Before you install",
		server:
			"Linux server (AMD64 or ARM64), at least 4 GB RAM, and disk space for your work and backups.",
		docker: "Docker Engine, Docker Compose 2.24+, curl, and OpenSSL.",
		domain:
			"A domain pointing to your server, with TCP ports 80 and 443 open for automatic HTTPS.",
		install: "Install Community Edition",
		installDescription:
			"Run this command on your server. The installer asks for your domain, downloads prebuilt images, generates secrets, and starts the services in ./lunaris.",
		nextStep:
			"Open the URL printed by the installer and create your account. No source build required.",
		operations: "Your server, your responsibility",
		operationsDescription:
			"You manage updates, backups, access, and availability. Back up the data volumes and .env secrets. Configure email for password resets and invitations, and review registration settings before sharing your server.",
		license: "Open source, clear boundaries",
		licenseDescription:
			"Community Edition is open source under MIT. Enterprise features have a separate proprietary license; third-party components retain their own terms.",
		licenseLink: "Read the licensing details",
		cloud: "Prefer managed hosting?",
		cloudDescription:
			"Use Lunaris Cloud and let us run the infrastructure. Cloud plans and limits apply to the hosted service.",
		pricing: "See cloud pricing",
	},
	es: {
		label: "Autoalojado",
		headline: "Escritura de código abierto. Tu espacio, tu servidor.",
		description:
			"Un procesador de textos que funciona sin conexión, con Community Edition de código abierto. Escribe, colabora y amplía tu espacio a tu manera.",
		badge: "Desarrollado en abierto",
		github: "Explora el código en GitHub",
		selfHostHeadline: "Ejecuta Lunaris en tu servidor.",
		selfHostDescription:
			"Despliega Community Edition con Docker Compose. Mantén la escritura, la colaboración, la sincronización y los archivos en tu infraestructura.",
		guide: "Leer la guía de despliegue",
		requirements: "Antes de instalar",
		server:
			"Servidor Linux (AMD64 o ARM64), al menos 4 GB de RAM y espacio para tu trabajo y copias de seguridad.",
		docker: "Docker Engine, Docker Compose 2.24+, curl y OpenSSL.",
		domain:
			"Un dominio que apunte al servidor y puertos TCP 80 y 443 abiertos para HTTPS automático.",
		install: "Instalar Community Edition",
		installDescription:
			"Ejecuta este comando en tu servidor. El instalador solicita tu dominio, descarga imágenes precompiladas, genera secretos e inicia los servicios en ./lunaris.",
		nextStep:
			"Abre la URL que muestra el instalador y crea tu cuenta. No necesitas compilar el código.",
		operations: "Tu servidor, tu responsabilidad",
		operationsDescription:
			"Tú gestionas las actualizaciones, las copias de seguridad, el acceso y la disponibilidad. Guarda los volúmenes de datos y los secretos de .env. Configura el correo para recuperar contraseñas y enviar invitaciones, y revisa los ajustes de registro antes de compartir tu servidor.",
		license: "Código abierto, límites claros",
		licenseDescription:
			"Community Edition es de código abierto bajo MIT. Las funciones empresariales tienen una licencia propietaria independiente; los componentes de terceros conservan sus propios términos.",
		licenseLink: "Leer los detalles de licencia",
		cloud: "¿Prefieres alojamiento gestionado?",
		cloudDescription:
			"Usa Lunaris Cloud y deja que gestionemos la infraestructura. Los planes y límites de la nube se aplican al servicio alojado.",
		pricing: "Ver precios de la nube",
	},
	fr: {
		label: "Auto-hébergé",
		headline: "Écriture open source. Votre espace, votre serveur.",
		description:
			"Un traitement de texte utilisable hors ligne, avec une Community Edition open source. Écrivez, collaborez et adaptez votre espace à votre façon.",
		badge: "Développé au grand jour",
		github: "Explorer le code sur GitHub",
		selfHostHeadline: "Hébergez Lunaris sur votre serveur.",
		selfHostDescription:
			"Déployez Community Edition avec Docker Compose. Gardez écriture, collaboration, synchronisation et fichiers sur votre propre infrastructure.",
		guide: "Lire le guide de déploiement",
		requirements: "Avant l’installation",
		server:
			"Serveur Linux (AMD64 ou ARM64), au moins 4 Go de RAM et de l’espace pour votre travail et vos sauvegardes.",
		docker: "Docker Engine, Docker Compose 2.24+, curl et OpenSSL.",
		domain:
			"Un domaine pointant vers votre serveur et les ports TCP 80 et 443 ouverts pour HTTPS automatique.",
		install: "Installer Community Edition",
		installDescription:
			"Exécutez cette commande sur votre serveur. Le programme demande votre domaine, télécharge les images précompilées, génère les secrets et démarre les services dans ./lunaris.",
		nextStep:
			"Ouvrez l’URL affichée et créez votre compte. Aucune compilation nécessaire.",
		operations: "Votre serveur, votre responsabilité",
		operationsDescription:
			"Vous gérez mises à jour, sauvegardes, accès et disponibilité. Sauvegardez les volumes de données et les secrets .env. Configurez les e-mails pour les réinitialisations de mot de passe et les invitations, puis vérifiez les paramètres d’inscription avant de partager votre serveur.",
		license: "Open source, périmètre clair",
		licenseDescription:
			"Community Edition est open source sous MIT. Les fonctions Enterprise ont une licence propriétaire distincte ; les composants tiers conservent leurs propres conditions.",
		licenseLink: "Lire les détails des licences",
		cloud: "Vous préférez un hébergement géré ?",
		cloudDescription:
			"Utilisez Lunaris Cloud et confiez-nous l’infrastructure. Les forfaits et limites cloud s’appliquent au service hébergé.",
		pricing: "Voir les tarifs cloud",
	},
	de: {
		label: "Selbst gehostet",
		headline: "Open-Source-Schreiben. Dein Workspace, dein Server.",
		description:
			"Eine offlinefähige Textverarbeitung mit einer quelloffenen Community Edition. Schreibe, arbeite zusammen und erweitere deinen Workspace nach deinen Vorstellungen.",
		badge: "Offen entwickelt",
		github: "Quellcode auf GitHub ansehen",
		selfHostHeadline: "Betreibe Lunaris auf deinem Server.",
		selfHostDescription:
			"Stelle Community Edition mit Docker Compose bereit. Behalte Schreiben, Zusammenarbeit, Synchronisierung und Dateien auf deiner eigenen Infrastruktur.",
		guide: "Bereitstellungsanleitung lesen",
		requirements: "Vor der Installation",
		server:
			"Linux-Server (AMD64 oder ARM64), mindestens 4 GB RAM und Speicherplatz für deine Arbeit und Backups.",
		docker: "Docker Engine, Docker Compose 2.24+, curl und OpenSSL.",
		domain:
			"Eine Domain, die auf deinen Server verweist, sowie offene TCP-Ports 80 und 443 für automatisches HTTPS.",
		install: "Community Edition installieren",
		installDescription:
			"Führe diesen Befehl auf deinem Server aus. Das Installationsprogramm fragt nach deiner Domain, lädt fertige Images, erzeugt Geheimnisse und startet die Dienste in ./lunaris.",
		nextStep:
			"Öffne die angezeigte URL und erstelle dein Konto. Kein Kompilieren erforderlich.",
		operations: "Dein Server, deine Verantwortung",
		operationsDescription:
			"Du verwaltest Updates, Backups, Zugriff und Verfügbarkeit. Sichere die Datenvolumes und .env-Geheimnisse. Richte E-Mail für Passwortzurücksetzungen und Einladungen ein und prüfe die Registrierungseinstellungen, bevor du deinen Server teilst.",
		license: "Open Source mit klaren Grenzen",
		licenseDescription:
			"Community Edition ist Open Source unter MIT. Enterprise-Funktionen haben eine separate proprietäre Lizenz; für Drittanbieterkomponenten gelten eigene Bedingungen.",
		licenseLink: "Lizenzdetails lesen",
		cloud: "Lieber verwaltetes Hosting?",
		cloudDescription:
			"Nutze Lunaris Cloud und überlasse uns die Infrastruktur. Cloud-Tarife und Limits gelten für den gehosteten Dienst.",
		pricing: "Cloud-Preise ansehen",
	},
	"pt-BR": {
		label: "Auto-hospedado",
		headline: "Escrita de código aberto. Seu espaço, seu servidor.",
		description:
			"Um processador de textos que funciona offline, com Community Edition de código aberto. Escreva, colabore e amplie seu espaço do seu jeito.",
		badge: "Desenvolvido abertamente",
		github: "Explore o código no GitHub",
		selfHostHeadline: "Execute o Lunaris no seu servidor.",
		selfHostDescription:
			"Implante a Community Edition com Docker Compose. Mantenha escrita, colaboração, sincronização e arquivos na sua infraestrutura.",
		guide: "Ler o guia de implantação",
		requirements: "Antes de instalar",
		server:
			"Servidor Linux (AMD64 ou ARM64), pelo menos 4 GB de RAM e espaço para seu trabalho e backups.",
		docker: "Docker Engine, Docker Compose 2.24+, curl e OpenSSL.",
		domain:
			"Um domínio apontando para o servidor e portas TCP 80 e 443 abertas para HTTPS automático.",
		install: "Instalar Community Edition",
		installDescription:
			"Execute este comando no seu servidor. O instalador solicita seu domínio, baixa imagens prontas, gera segredos e inicia os serviços em ./lunaris.",
		nextStep:
			"Abra a URL exibida pelo instalador e crie sua conta. Não é necessário compilar o código.",
		operations: "Seu servidor, sua responsabilidade",
		operationsDescription:
			"Você gerencia atualizações, backups, acesso e disponibilidade. Salve os volumes de dados e os segredos de .env. Configure o e-mail para recuperação de senha e convites, e revise as configurações de cadastro antes de compartilhar seu servidor.",
		license: "Código aberto, limites claros",
		licenseDescription:
			"A Community Edition é de código aberto sob MIT. Os recursos Enterprise têm licença proprietária separada; componentes de terceiros mantêm seus próprios termos.",
		licenseLink: "Ler os detalhes das licenças",
		cloud: "Prefere hospedagem gerenciada?",
		cloudDescription:
			"Use o Lunaris Cloud e deixe a infraestrutura conosco. Os planos e limites da nuvem se aplicam ao serviço hospedado.",
		pricing: "Ver preços da nuvem",
	},
};
