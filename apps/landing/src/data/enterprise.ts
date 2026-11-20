import type { Locale } from "@/i18n/config";

type EnterpriseCopy = {
	headline: string;
	description: string;
	access: string;
	sso: { title: string; description: string };
	scim: { title: string; description: string };
	roles: string;
	security: {
		description: string;
		documents: string;
	};
	residency: { title: string; description: string };
	extensions: { title: string; description: string };
	selfHostingQuestion: string;
	consultation: { title: string; description: string };
	detailsLink: string;
};

export const enterpriseCopy: Record<Locale, EnterpriseCopy> = {
	en: {
		headline: "Lunaris for enterprise",
		description:
			"Give your teams an offline-first workspace for writing and collaboration, with organization-wide access controls and a choice of cloud region.",
		access: "Manage access across your organization",
		sso: {
			title: "Single sign-on (SSO)",
			description: "Let employees sign in through your identity provider.",
		},
		scim: {
			title: "Account provisioning (SCIM)",
			description: "Automate account provisioning from your identity provider.",
		},
		roles: "Define organization roles with the permissions each group needs.",
		security: {
			description:
				"Lunaris encrypts synced workspace data in transit and at rest. Review our security policies, see who processes data, or request access to restricted documents in the Lunaris Trust Center.",
			documents: "Security documents",
		},
		residency: {
			title: "Regional data residency",
			description:
				"Eligible Enterprise organizations can choose where their Lunaris Cloud data is hosted.",
		},
		extensions: {
			title: "Private extensions",
			description:
				"Use the Lunaris Extensions SDK to build internal tools, such as an admin panel or a project tracker, alongside your organization’s writing.",
		},
		selfHostingQuestion: "Can we host Lunaris on our own infrastructure?",
		consultation: {
			title: "Discuss your rollout with Lunaris",
			description:
				"Tell us how your team works and what you need for access, data residency, and support.",
		},
		detailsLink: "Explore Enterprise",
	},
	de: {
		headline: "Lunaris für Unternehmen",
		description:
			"Bieten Sie Ihren Teams einen Arbeitsbereich für gemeinsames Schreiben, der auch offline funktioniert. Verwalten Sie den Zugriff zentral und wählen Sie Ihre Cloud-Region.",
		access: "Zugriff für die gesamte Organisation verwalten",
		sso: {
			title: "Single Sign-on (SSO)",
			description:
				"Mitarbeitende melden sich über Ihren Identitätsanbieter an.",
		},
		scim: {
			title: "Kontobereitstellung (SCIM)",
			description:
				"Stellen Sie Konten automatisch über Ihren Identitätsanbieter bereit.",
		},
		roles:
			"Legen Sie Rollen mit den Berechtigungen fest, die jede Gruppe benötigt.",
		security: {
			description:
				"Lunaris verschlüsselt synchronisierte Arbeitsbereichsdaten bei der Übertragung und im Ruhezustand. Im Lunaris Trust Center finden Sie unsere Sicherheitsrichtlinien und die Liste der Unterauftragsverarbeiter. Dort können Sie auch Zugriff auf geschützte Dokumente anfragen.",
			documents: "Sicherheitsdokumente",
		},
		residency: {
			title: "Regionale Datenresidenz",
			description:
				"Berechtigte Enterprise-Organisationen können den Speicherort ihrer Daten in Lunaris Cloud wählen.",
		},
		extensions: {
			title: "Private Erweiterungen",
			description:
				"Entwickeln Sie mit dem Lunaris Extensions SDK interne Werkzeuge wie eine Verwaltungsoberfläche oder eine Projektübersicht direkt im Arbeitsbereich.",
		},
		selfHostingQuestion:
			"Können wir Lunaris auf eigener Infrastruktur betreiben?",
		consultation: {
			title: "Planen Sie die Einführung mit Lunaris",
			description:
				"Erzählen Sie uns, wie Ihr Team arbeitet und welche Anforderungen Sie an Zugriff, Datenresidenz und Support haben.",
		},
		detailsLink: "Enterprise entdecken",
	},
	es: {
		headline: "Lunaris para empresas",
		description:
			"Ofrece a tus equipos un espacio para escribir y colaborar que funciona sin conexión, con controles de acceso para toda la organización y opciones de región en la nube.",
		access: "Gestiona el acceso de toda tu organización",
		sso: {
			title: "Inicio de sesión único (SSO)",
			description:
				"Permite que el personal inicie sesión con tu proveedor de identidad.",
		},
		scim: {
			title: "Aprovisionamiento de cuentas (SCIM)",
			description:
				"Automatiza el alta de cuentas desde tu proveedor de identidad.",
		},
		roles: "Define roles con los permisos que necesita cada grupo.",
		security: {
			description:
				"Lunaris cifra los datos sincronizados en tránsito y en reposo. Consulta nuestras políticas de seguridad y la lista de subencargados del tratamiento, o solicita acceso a documentos restringidos en el centro de confianza de Lunaris.",
			documents: "Documentos de seguridad",
		},
		residency: {
			title: "Residencia regional de datos",
			description:
				"Las organizaciones Enterprise elegibles pueden elegir dónde se alojan sus datos en Lunaris Cloud.",
		},
		extensions: {
			title: "Extensiones privadas",
			description:
				"Usa el SDK de extensiones de Lunaris para crear herramientas internas, como un panel de administración o un gestor de proyectos, junto a los documentos de tu organización.",
		},
		selfHostingQuestion:
			"¿Podemos alojar Lunaris en nuestra propia infraestructura?",
		consultation: {
			title: "Planifica la adopción con Lunaris",
			description:
				"Cuéntanos cómo trabaja tu equipo y qué necesita en materia de acceso, residencia de datos y soporte.",
		},
		detailsLink: "Descubre Enterprise",
	},
	fr: {
		headline: "Lunaris pour les entreprises",
		description:
			"Offrez à vos équipes un espace de rédaction collaborative qui fonctionne hors ligne. Gérez les accès de toute l’organisation et choisissez votre région cloud.",
		access: "Gérez les accès de votre organisation",
		sso: {
			title: "Authentification unique (SSO)",
			description:
				"Permettez à vos équipes de se connecter via votre fournisseur d’identité.",
		},
		scim: {
			title: "Provisionnement des comptes (SCIM)",
			description:
				"Automatisez la création des comptes depuis votre fournisseur d’identité.",
		},
		roles:
			"Définissez des rôles avec les autorisations propres à chaque groupe.",
		security: {
			description:
				"Lunaris chiffre les données synchronisées en transit et au repos. Consultez nos politiques de sécurité et la liste des sous-traitants, ou demandez l’accès à des documents restreints dans le centre de confiance de Lunaris.",
			documents: "Documents de sécurité",
		},
		residency: {
			title: "Résidence régionale des données",
			description:
				"Les organisations Enterprise éligibles peuvent choisir où leurs données sont hébergées dans Lunaris Cloud.",
		},
		extensions: {
			title: "Extensions privées",
			description:
				"Utilisez le SDK d’extensions Lunaris pour créer des outils internes, comme un panneau d’administration ou un outil de suivi de projets, aux côtés de vos documents.",
		},
		selfHostingQuestion:
			"Pouvons-nous héberger Lunaris sur notre propre infrastructure ?",
		consultation: {
			title: "Préparez votre déploiement avec Lunaris",
			description:
				"Parlez-nous de vos méthodes de travail et de vos besoins en matière d’accès, de résidence des données et d’assistance.",
		},
		detailsLink: "Découvrir Enterprise",
	},
	"pt-BR": {
		headline: "Lunaris para empresas",
		description:
			"Ofereça às suas equipes um espaço para escrever e colaborar que funciona offline, com controles de acesso para toda a organização e opções de região na nuvem.",
		access: "Gerencie o acesso em toda a organização",
		sso: {
			title: "Login único (SSO)",
			description:
				"Permita que sua equipe entre pelo provedor de identidade da empresa.",
		},
		scim: {
			title: "Provisionamento de contas (SCIM)",
			description:
				"Automatize a criação de contas pelo seu provedor de identidade.",
		},
		roles: "Defina funções com as permissões de que cada grupo precisa.",
		security: {
			description:
				"O Lunaris criptografa os dados sincronizados em trânsito e em repouso. Consulte nossas políticas de segurança e a lista de subprocessadores ou solicite acesso a documentos restritos na Central de Confiança do Lunaris.",
			documents: "Documentos de segurança",
		},
		residency: {
			title: "Residência regional de dados",
			description:
				"Organizações Enterprise elegíveis podem escolher onde seus dados ficam hospedados no Lunaris Cloud.",
		},
		extensions: {
			title: "Extensões privadas",
			description:
				"Use o SDK de extensões do Lunaris para criar ferramentas internas, como um painel administrativo ou um gerenciador de projetos, junto aos documentos da organização.",
		},
		selfHostingQuestion:
			"Podemos hospedar o Lunaris na nossa própria infraestrutura?",
		consultation: {
			title: "Planeje a adoção com o Lunaris",
			description:
				"Conte como sua equipe trabalha e o que precisa em relação a acesso, residência de dados e suporte.",
		},
		detailsLink: "Conheça o Enterprise",
	},
};
