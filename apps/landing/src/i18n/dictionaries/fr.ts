import type { Dictionary } from "./types";

const fr = {
	meta: {
		title: "Lunaris — Un espace d’écriture adapté à votre travail",
		description:
			"Écrivez hors ligne, collaborez en temps réel, choisissez où résident vos données et façonnez chaque espace avec des extensions publiques ou privées.",
	},
	accessibility: {
		demoVideoDescription:
			"Démonstration sans son : la barre latérale d’un espace de travail affiche une vue d’ensemble, une feuille de route, un tableau blanc et des dossiers. La vue d’ensemble contient du texte mis en forme. La feuille de route regroupe les tâches par statut ; une carte est déplacée entre les colonnes. Le tableau blanc montre des formes reliées. Enfin, la feuille de route et la vue d’ensemble s’affichent côte à côte, puis la vue d’ensemble défile.",
		switchLanguage: "Changer de langue",
		openMenu: "Ouvrir le menu",
		closeMenu: "Fermer le menu",
		switchTheme: "Changer de thème",
		lightTheme: "Clair",
		darkTheme: "Sombre",
		systemTheme: "Système",
		demoVideo: "Démonstration vidéo de l’espace de travail Lunaris",

		skipToContent: "Aller au contenu principal",
		primaryNavigation: "Navigation principale",
		footerNavigation: "Navigation du pied de page",
	},
	nav: {
		pricing: "Tarifs",
		docs: "Documentation",
		mcp: "MCP",
		contact: "Contact",
	},
	hero: {
		mcpAnnouncement: {
			badge: "Nouveau",
			label: "Connectez vos outils d'IA avec MCP",
		},
		headline: "Un espace d’écriture que vous pouvez faire vôtre.",
		subheadline: {
			beforeHighlight: "Commencez par",
			highlight: "l’essentiel.",
			betweenHighlights: "Ajoutez",
			secondHighlight: "des extensions à mesure que votre travail évolue.",
			afterHighlight: " Travaillez hors ligne ou collaborez en temps réel.",
		},
	},
	problems: {
		headline: "Pourquoi vous adapter à votre organisation ?",
		subheadline:
			"Les outils tout-en-un imposent à chaque espace de travail le même encombrement, les mêmes limites et le même flux.",
		items: {
			featureBloat: {
				headline: "Fonctionnalités superflues",
				subheadline:
					"Chaque fonction intégrée ajoute un menu, même si votre espace de travail n’en a jamais besoin.",
			},
			vendorLockIn: {
				headline: "Verrouillage propriétaire",
				subheadline:
					"Le cloud obligatoire et les systèmes propriétaires décident quand et où votre travail reste accessible.",
			},
			rigidWorkflows: {
				headline: "Flux de travail rigides",
				subheadline:
					"Un roman, une base de connaissances et un outil interne ne devraient pas entrer dans le même moule.",
			},
		},
	},
	bentoFeatures: {
		headline: "Commencez par écrire. Façonnez tout le reste autour.",
		subheadline:
			"Gardez un cœur épuré. Ajoutez collaboration, IA et extensions selon vos besoins.",
		items: {
			dataOwnership: {
				headline: "Vos données vous appartiennent",
				subheadline:
					"Gardez les espaces de travail sensibles sur votre appareil ou choisissez où résident les données synchronisées.",
			},
			offlineFirst: {
				headline: "Le hors-ligne d’abord",
				subheadline:
					"Continuez à écrire sans connexion. Synchronisez à votre retour en ligne, si vous le souhaitez.",
			},
			extensions: {
				headline: "Extensions",
				subheadline:
					"Installez des outils de la communauté ou créez des extensions privées pour les besoins précis de votre équipe.",
			},
			collaboration: {
				headline: "Collaboration",
				subheadline:
					"Éditez ensemble en temps réel, partagez les espaces de travail et gérez les accès de votre équipe.",
			},
			aiReady: {
				headline: "Prêt pour l’IA",
				subheadline:
					"Connectez des outils d’IA via MCP et décidez quand ils entrent dans votre flux de travail.",
			},
			fastLightweight: {
				headline: "Rapide et léger",
				subheadline:
					"Se lance rapidement et reste réactif pour ne jamais ralentir votre travail.",
			},
			crossPlatform: {
				headline: "Multiplateforme",
				subheadline:
					"Passez du web à l’application de bureau sans apprendre un nouvel organisation.",
			},
		},
	},
	faqs: {
		headline: "Des questions ? Commencez ici.",
		items: {
			openPlatform: {
				question: "Pourquoi Lunaris est-elle une plateforme ouverte ?",
				answer:
					"Lunaris part d’un cœur centré sur l’écriture. Les extensions de la communauté ajoutent des outils spécialisés, tandis que les équipes peuvent créer des extensions privées pour leurs processus internes, sans transformer chaque espace en suite tout-en-un.",
			},
			free: {
				question: "Puis-je l'utiliser gratuitement ?",
				answer:
					"Oui. Free comprend la synchronisation cloud, des espaces de travail illimités, jusqu’à 25 éléments, jusqu’à 3 membres et 250 Mo de stockage par organisation, avec une limite de 25 Mo par fichier. Aucun moyen de paiement n’est nécessaire. Consultez nos {pricingLink}.",
			},
			offline: {
				question: "Fonctionne-t-il hors ligne ?",
				answer:
					"Oui, vous pouvez écrire hors ligne avec tous les plans. Votre travail se synchronise avec le cloud lorsque vous êtes en ligne, pour y accéder depuis n'importe quel appareil et collaborer. Vous pouvez également désactiver la synchronisation cloud et utiliser l'application entièrement hors ligne.",
			},
			security: {
				question: "Que proposez-vous en matière de Sécurité et Conformité ?",
				answer:
					"Vos écrits vous appartiennent. Vous choisissez où ils sont stockés, aux États-Unis ou dans l'UE, et tout est chiffré en transit et au repos. Les équipes Enterprise bénéficient de contrôles supplémentaires comme les rôles personnalisés, SSO & SCIM et les garanties SLA. Consultez notre {trustCenterLink} pour en savoir plus.",
			},
			fileStorage: {
				question: "Quels fichiers comptent dans le stockage ?",
				answer:
					"Les fichiers importés et les pièces jointes partagent un même espace de stockage dans tous les espaces de travail de l’organisation. Les fichiers dans la corbeille comptent jusqu’à leur suppression définitive. Les fichiers uniquement locaux n’utilisent pas le stockage cloud. Les unités sont décimales : 1 Mo = 1 000 000 octets ; 1 Go = 1 000 Mo.",
			},
			storageFull: {
				question: "Que se passe-t-il si mon organisation manque de stockage ?",
				answer:
					"Les fichiers existants restent accessibles en lecture, au téléchargement et à la suppression, même après un changement vers une offre inférieure ou le retrait de membres. Les envois qui augmentent le stockage sont suspendus jusqu’à ce que vous libériez de l’espace ou changiez d’offre. Vous pouvez remplacer des fichiers par des versions plus petites, dans la limite par fichier de votre offre. Les envois refusés restent sur votre appareil.",
			},
			aiTraining: {
				question:
					"Mes écrits sont-ils utilisés pour entraîner des modèles d'IA ?",
				answer: "Non.",
			},
		},
	},
	pricing: {
		headline: "Des tarifs simples pour chaque organisation.",
		plans: {
			free: {
				name: "Free",
				subheadline:
					"Pour le travail personnel et les petits espaces partagés.",
				features: [
					"Jusqu'à 25 éléments",
					"Jusqu'à 3 membres",
					"Espaces de travail illimités",
					"Synchronisation cloud",
					"Extensions de base",
					"250 Mo de stockage par organisation",
					"25 Mo par fichier",
				],
				ctaLabel: "Commencer gratuitement",
			},
			plus: {
				name: "Plus",
				subheadline:
					"Pour les espaces actifs avec plus de contenu ou de membres.",
				features: [
					"Tout dans Free",
					"Éléments illimités",
					"Jusqu'à 10 membres",
					"Espaces de travail illimités",
					"10 Go par organisation",
					"500 Mo par fichier",
				],
				ctaLabel: "Choisir Plus",
			},
			business: {
				name: "Business",
				subheadline:
					"Pour les équipes en croissance qui ont besoin de toutes les extensions et de membres illimités.",
				features: [
					"Tout dans Plus",
					"Membres illimités",
					"Toutes les extensions",
					"Support prioritaire",
					"100 Go par organisation",
					"5 Go par fichier",
				],
				ctaLabel: "Choisir Business",
			},
			enterprise: {
				name: "Enterprise",
				subheadline:
					"Pour les organisations qui ont besoin d'une sécurité, d'accès et d'un support sur mesure.",
				features: [
					"Tout dans Business",
					"Rôles et permissions personnalisés",
					"SSO & SCIM",
					"SOC 2",
					"Suivi SLA",
					"1 To ; limites personnalisables",
					"5 Go par fichier",
				],
				ctaLabel: "Parler à notre équipe",
			},
		},
	},
	pricingPage: {
		title: "Tarifs Lunaris — Commencez gratuitement, évoluez espace par espace",
		description:
			"Commencez gratuitement, sans moyen de paiement. Chaque espace Lunaris a son propre plan : faites évoluer uniquement ceux qui ont besoin de plus d'éléments, de membres ou d'extensions.",
		headline: "Commencez gratuitement. Évoluez espace par espace.",
		subheadline:
			"Créez un espace synchronisé sans moyen de paiement. Chaque espace a son propre plan : faites évoluer uniquement ceux qui ont besoin de plus d'éléments ou de membres.",
		options: { monthly: "Mensuel", yearly: "Annuel (Économisez 20%)" },
		labels: {
			perMemberMonth: "/membre/mois",
			save20: "Économisez 20%",
			unlimited: "Illimités",
			included: "Inclus",
			notIncluded: "Non inclus",
		},
		billingNote:
			"Les plans payants sont calculés par membre accepté dans chaque espace. Le propriétaire compte comme membre. Les plans annuels sont facturés une fois par an.",
		storage: {
			poolLabel: "Stockage de fichiers de l’organisation",
			fileLabel: "Taille maximale par fichier",
			note: "Le stockage est partagé entre tous les espaces de travail de l’organisation, y compris les espaces privés. Les limites sont fixes pour chaque offre et ne dépendent pas du nombre de membres.",
			pools: {
				free: "250 Mo au total",
				plus: "10 Go / organisation",
				business: "100 Go / organisation",
				enterprise: "1 To ; personnalisable",
			},
			files: {
				free: "25 Mo",
				plus: "500 Mo",
				business: "5 Go",
				enterprise: "5 Go",
			},
		},
		comparisonTable: {
			heading: "Comparer les plans",
			categories: {
				core: {
					title: "Principal",
					features: {
						workspaces: "Espaces de travail",
						items: "Éléments",
						members: "Membres (propriétaire inclus)",
						cloudSync: "Synchronisation Cloud",
					},
				},
				extensions: {
					title: "Extensions",
					features: {
						richTextEditor: "Éditeur de Texte Enrichi",
						whiteboard: "Tableau Blanc",
						kanbanBoard: "Tableau Kanban",
						compiler: "Export",
						allOther: "Tous les autres",
					},
				},
				support: {
					title: "Support",
					features: {
						community: "Support communautaire",
						priority: "Support prioritaire",
						dedicated: "Responsable dédié",
					},
				},
				securityCompliance: {
					title: "Sécurité et Conformité",
					features: {
						customRoles: "Rôles et permissions personnalisés",
						sla: "Suivi SLA",
						sso: "SSO & SCIM",
						soc2: "SOC 2",
					},
				},
			},
		},
		details: [
			{
				title: "Faites évoluer un espace à la fois",
				body: "Passez à Plus au 26e élément ou au 4e membre, puis à Business au 11e membre.",
			},
			{
				title: "Payez uniquement les membres acceptés",
				body: "Les membres acceptés sont facturés ; les invitations en attente réservent seulement une place.",
			},
			{
				title: "Donnez son propre plan à chaque espace",
				body: "Chaque espace est facturé séparément : l'un peut rester en Free tandis qu'un autre utilise Plus ou Business.",
			},
			{
				title: "Conservez votre travail après annulation",
				body: "Après annulation, l'espace repasse à Free sans supprimer ni verrouiller le contenu existant. Vous ne pouvez rien ajouter tant qu'une limite Free est dépassée.",
			},
			{
				title: "Gérez la facturation dans Lunaris",
				body: "Les propriétaires changent de plan dans Lunaris et gèrent les annulations ou moyens de paiement dans le portail Polar.",
			},
			{
				title: "Créez et rejoignez plusieurs espaces",
				body: "Créez plusieurs espaces ou rejoignez ceux d'autres personnes. Chaque espace que vous possédez conserve son propre plan.",
			},
		],
		ctaHeadline: "Créez votre premier organisation.",
		ctaLabel: "Créer un espace",
		ctaSuffix: "commencer gratuitement",
	},
	demoPage: {
		title: "Conseil en organisation — Lunaris",
		description:
			"Expliquez-nous comment votre équipe travaille et nous vous aiderons à façonner le bon espace Lunaris.",
		headline: "Construisons l'organisation adapté à votre équipe.",
		subheadline:
			"Expliquez-nous comment votre équipe écrit, planifie, collabore et gère l'information. Nous vous aiderons à créer un espace Lunaris autour de ces besoins.",
		form: {
			nameLabel: "Nom complet",
			namePlaceholder: "Ada Lovelace",
			emailLabel: "E-mail professionnel",
			emailPlaceholder: "ada@entreprise.com",
			companyLabel: "Entreprise",
			companyPlaceholder: "Acme Inc.",
			companySizeLabel: "Taille de l'entreprise",
			companySizePlaceholder: "Sélectionner la taille",
			companySizeOptions: {
				small: "1–10",
				medium: "11–50",
				large: "51–200",
				xl: "201–1 000",
				xxl: "1 000+",
			},
			messageLabel: "Que devrait vous permettre de faire votre organisation ?",
			messagePlaceholder:
				"Décrivez votre flux de travail, les outils dont vous avez besoin et les limites de votre configuration actuelle...",
			submit: "Demander une consultation",
			submitting: "Envoi de la demande...",
			successTitle: "Merci, nous avons bien reçu votre demande.",
			successBody: "Nous vous recontacterons sous un jour ouvré.",
			errorRequired: "Requis",
			errorEmail: "Entrez une adresse e-mail valide",
			errorTooLong: "Raccourcissez cette réponse",
			errorGeneric: "Une erreur est survenue. Veuillez réessayer.",
		},
	},
	mcpPage: {
		title: "Lunaris MCP — Connectez votre client MCP",
		description:
			"Connectez tout client MCP, dont Claude Code, Codex et Cursor, à Lunaris dans la région de données de votre choix.",
		eyebrow: "Lunaris MCP",
		headline: "Invitez votre organisation dans la conversation.",
		setup: {
			harnessLabel: "Choisissez votre client MCP",
			regionLabel: "Choisissez votre région de données",
			desktopName: "Application de bureau",
			desktopDescription:
				"Inclut vos espaces de travail avec une visibilité locale.",
			desktopAuthNote:
				"Gardez Lunaris Desktop ouvert et approuvez la demande d’association dans Réglages → Données locales.",
			desktopDataNote:
				"Les espaces de travail avec une visibilité locale restent sur cet appareil.",
			genericName: "Client MCP",
			comingSoon: "Bientôt disponible",
			available: "Disponible",
			commandLabel: "Exécutez cette commande",
			configLabel: "Ajoutez cette configuration",
			detailsLabel: "Détails du serveur",
			copy: "Copier",
			copied: "Copié",
			authNote:
				"Votre agent vous demandera de vous connecter de manière sécurisée lors de sa première connexion.",
			dataNote:
				"Les données de l'espace restent dans la région que vous choisissez.",
		},
	},
	linearComparisonPage: {
		title: "Lunaris vs Linear : des documents conçus pour aller plus loin",
		description:
			"Comparez Lunaris et Linear pour l’organisation des documents, les dossiers d’espace de travail, les extensions natives et les outils sur mesure.",
		headline: "Donnez un espace à vos documents, pas seulement une tâche.",
		subheadline:
			"Lunaris réunit documents, dossiers et fichiers créés par des extensions dans une seule arborescence d’espace de travail. Adaptez chaque espace au travail, tandis que Linear garde les documents liés à la planification produit.",
		primaryCta: "Commencer à écrire gratuitement",
		table: {
			heading: "Comparer l’essentiel",
			lunaris: "Lunaris",
			linear: "Linear",
			categories: {
				organization: {
					title: "Gestion documentaire",
					features: {
						structure: "Organisation des documents",
						navigation: "Recherche du contenu de l’espace de travail",
					},
				},
				content: {
					title: "Contenu",
					features: {
						resources: "Au-delà du texte",
						workspaceScope: "Contenu d’un espace de travail",
					},
				},
				extensions: {
					title: "Extensions",
					features: {
						customization: "Extension de l’espace",
						customTools: "Création d’outils sur mesure",
					},
				},
			},
			values: {
				nestedFolders:
					"Imbriquez documents et fichiers dans des dossiers d’espace de travail",
				attachedDocuments:
					"Joignez des documents aux espaces de travail, initiatives, équipes, tâches ou cycles",
				workspaceTree:
					"Parcourez et réorganisez le contenu dans une seule arborescence",
				workContext: "Parcourez les documents depuis leur contexte de travail",
				mixedContent:
					"Réunissez texte enrichi, tableaux blancs, tableaux et fichiers",
				richTextDocuments:
					"Les documents collaboratifs utilisent l’éditeur de Linear",
				workspaceContent:
					"Les espaces de travail accueillent dossiers et fichiers créés par des extensions",
				productPlanning:
					"Les espaces de travail associent tâches et documents facultatifs",
				nativeExtensions:
					"Les extensions communautaires ajoutent des outils dans l’espace",
				integrations:
					"Les intégrations relient Linear aux applications externes",
				privateExtensions:
					"Créez des extensions privées pour le processus de votre équipe",
				apiApps:
					"Créez des applications externes avec l’API et le SDK TypeScript de Linear",
			},
		},
		sources: {
			intro:
				"Les informations sur Linear reposent sur sa documentation publique, consultée en août 2026. Les fonctionnalités peuvent évoluer.",
			documents: "Documents",
			workspaces: "Espaces de travail",
			integrations: "Répertoire des intégrations",
			api: "SDK pour développeurs",
		},
		cta: {
			headline:
				"Faites de chaque espace de travail plus qu’une liste de tâches.",
			subheadline:
				"Commencez à écrire gratuitement. Organisez le contenu en dossiers, puis ajoutez les types de fichiers et les outils nécessaires.",
		},
	},
	obsidianComparisonPage: {
		title: "Lunaris vs Obsidian : collaboration offline-first",
		description:
			"Comparez Lunaris et Obsidian pour la collaboration en direct, les permissions d’équipe, l’édition hors ligne et les extensions.",
		eyebrow: "Lunaris vs Obsidian",
		headline: "Travaillez hors ligne, sans travailler seul.",
		subheadline:
			"Lunaris apporte la collaboration en temps réel à un espace offline-first. Modifiez des documents partagés ensemble, invitez vos collègues avec des rôles et continuez à écrire quand la connexion disparaît.",
		primaryCta: "Commencer à écrire gratuitement",
		secondaryCta: "Voir les tarifs",
		fit: {
			lunaris: {
				label: "Lunaris est fait pour vous si vous souhaitez",
				items: [
					"Modifier ensemble des documents partagés sans travailler à tour de rôle",
					"Inviter vos collègues et gérer les accès dans l’espace",
					"Continuer hors ligne et fusionner les changements en toute sécurité",
				],
			},
			obsidian: {
				label: "Là où Obsidian peut vous freiner",
				items: [
					"Les coffres partagés ne permettent pas l’édition en direct du même fichier",
					"Le curseur et les changements des autres restent invisibles avant la synchronisation",
					"Chaque collaborateur doit avoir Sync et reçoit les mêmes permissions",
				],
			},
		},
		table: {
			heading: "Comparez l’essentiel",
			lunaris: "Lunaris",
			obsidian: "Obsidian",
			categories: {
				collaboration: {
					title: "Collaboration",
					features: {
						sameDocument: "Modification en équipe",
						concurrentChanges: "Modifications simultanées",
					},
				},
				teamwork: {
					title: "Travail en équipe",
					features: {
						teamAccess: "Invitation de l’équipe",
						permissions: "Permissions",
					},
				},
				foundation: {
					title: "Hors ligne et extensions",
					features: {
						offlineModel: "Travail hors ligne",
						organizationShape: "Extension de l’espace",
					},
				},
			},
			values: {
				sharedEditing: "Modifiez des documents partagés ensemble en temps réel",
				noLiveEditing: "Pas d’édition collaborative en direct du même fichier",
				crdtMerge:
					"Tout le monde voit les changements en direct dans un document partagé",
				syncMerge:
					"Les modifications des autres apparaissent seulement après synchronisation",
				organizationInvite: "Invitez vos collègues directement dans l’espace",
				syncSubscription: "Chaque collaborateur doit avoir Obsidian Sync",
				organizationRoles:
					"Attribuez des rôles et des permissions dans l’espace",
				samePermissions:
					"Tous les collaborateurs ont les mêmes permissions de coffre",
				offlineOrganization:
					"Continuez hors ligne ; synchronisez une fois connecté",
				localVault: "Coffre Markdown local ; synchronisation facultative",
				extensionOrganization: "Éditeur épuré et extensions natives",
				markdownPlugins: "Coffre Markdown et extensions communautaires",
			},
		},
		differences: {
			eyebrow: "Pourquoi Lunaris",
			headline: "Collaborez sans renoncer au travail hors ligne.",
			items: [
				{
					headline: "Écrivez ensemble, pas à tour de rôle",
					body: "Travaillez dans le même document sans que chaque modification simultanée devienne un événement de synchronisation à fusionner ensuite.",
				},
				{
					headline: "Rassemblez l’équipe dans l’espace",
					body: "Invitez des membres et accordez-leur les accès nécessaires. La collaboration fait partie de l’espace, sans configuration de synchronisation séparée pour chacun.",
				},
				{
					headline: "Restez productif hors ligne",
					body: "Continuez à modifier sans connexion. À votre retour, les changements convergent dans le document partagé et l’équipe repart d’une source unique.",
				},
			],
		},
		sources: {
			intro:
				"Les informations sur Obsidian reposent sur sa documentation publique, consultée en août 2026. Les fonctionnalités peuvent évoluer.",
			collaboration: "Collaboration dans un coffre partagé",
			teams: "Sync pour les équipes",
			plans: "Offres et limites de Sync",
		},
		cta: {
			headline: "Faites entrer vos notes dans un espace partagé.",
			subheadline:
				"Commencez à écrire gratuitement. Continuez hors ligne, puis invitez votre équipe au moment de collaborer.",
		},
	},
	notionComparisonPage: {
		title: "Lunaris vs Notion : organisations offline-first",
		description:
			"Comparez Lunaris et Notion pour l’accès hors ligne, les espaces de travail locaux, la résidence des données, les extensions et l’accès des agents.",
		eyebrow: "Lunaris vs Notion",
		headline: "Travaillez hors ligne. Ajoutez seulement ce qu’il vous faut.",
		subheadline:
			"Lunaris commence par un éditeur épuré et offline-first. Gardez les espaces de travail sensibles sur votre appareil, choisissez une région de synchronisation et ajoutez des extensions communautaires ou privées lorsque votre travail l’exige.",
		primaryCta: "Commencer à écrire gratuitement",
		secondaryCta: "Voir les tarifs",
		fit: {
			lunaris: {
				label: "Lunaris est fait pour vous si vous voulez",
				items: [
					"Façonner chaque espace avec des extensions natives",
					"Ajouter tableaux blancs, tableaux et flux spécialisés seulement au besoin",
					"Garder des espaces de travail en local ou les synchroniser dans une région choisie",
				],
			},
			notion: {
				label: "Là où Notion peut gêner",
				items: [
					"Un large éventail tout-en-un ajoute plus de menus et de décisions dès le départ",
					"Le travail hors ligne dépend des pages téléchargées dans les applications bureau ou mobile",
					"Les espaces de travail vivent dans un espace cloud plutôt que dans un espace uniquement local",
				],
			},
		},
		table: {
			heading: "Comparez l’essentiel",
			lunaris: "Lunaris",
			notion: "Notion",
			categories: {
				access: {
					title: "Accès hors ligne",
					features: {
						offlineModel: "Travail hors ligne",
						localOnly: "Espaces de travail conservés sur l’appareil",
					},
				},
				control: {
					title: "Contrôle",
					features: {
						dataLocation: "Choix de l’emplacement des données",
						organizationShape: "Ajout d’outils à l’espace",
					},
				},
				connections: {
					title: "Extensions et accès des agents",
					features: {
						customization: "Extension de l’espace",
						agentAccess: "Connexion d’agents externes",
					},
				},
			},
			values: {
				offlineFirst: "Travaillez sur vos espaces de travail sans connexion",
				downloadedPages:
					"Travaillez hors ligne sur les pages téléchargées dans les apps",
				localWorkspaces:
					"Gardez les espaces de travail sensibles sur cet appareil",
				cloudOrganization: "Espace cloud avec options d’exportation",
				deviceOrRegion:
					"Gardez les espaces de travail en local ou choisissez une région de synchronisation",
				enterpriseResidency:
					"Cloud ; résidence régionale pour les espaces Enterprise éligibles",
				extensionLed: "Socle épuré ; ajoutez des extensions au besoin",
				allInOne: "Large éventail de fonctions inclus dès le départ",
				nativeExtensions: "Extensions communautaires et privées dans l’espace",
				integrations: "Connectez des outils externes par API et intégrations",
				mcp: "Accès MCP approuvé, y compris aux espaces de travail locaux",
				api: "L’accès API suit les autorisations des pages",
			},
		},
		differences: {
			eyebrow: "Pourquoi Lunaris",
			headline: "Un socle épuré. Des extensions selon vos règles.",
			items: [
				{
					headline: "Construisez l’espace, pas un détour",
					body: "Installez des extensions natives pour les tableaux blancs, tableaux et flux spécialisés. Chaque espace reçoit les outils nécessaires sans embarquer toutes les fonctions.",
				},
				{
					headline: "Hors ligne sans préparation",
					body: "Votre espace reste utile quand le réseau disparaît. Continuez à travailler et synchronisez plus tard si le cloud est activé.",
				},
				{
					headline: "Une vraie option locale",
					body: "Choisissez la visibilité locale pour les espaces de travail qui doivent rester sur un appareil, ou une région de synchronisation pour collaborer.",
				},
			],
		},
		sources: {
			intro:
				"Les informations sur Notion reposent sur sa documentation publique, consultée en août 2026. Les fonctions peuvent évoluer.",
			offline: "Utilisation hors ligne",
			backup: "Sauvegardes et exportations",
			residency: "Résidence des données",
			api: "Connexions API",
		},
		cta: {
			headline: "Créez l’espace dont votre travail a vraiment besoin.",
			subheadline:
				"Commencez à écrire gratuitement. Gardez les espaces de travail en local, synchronisez-les dans la région choisie et ajoutez des extensions lorsque vous en avez besoin.",
		},
	},
	cta: {
		headline: "Créez l’espace dont votre travail a vraiment besoin.",
		subheadline:
			"Écrivez gratuitement. Gardez vos espaces de travail en local ou synchronisez-les avec votre équipe, puis ajoutez des extensions au besoin.",
		label: "Créer un espace",
		suffix: "gratuit",
	},
	footer: {
		compare: "Comparer",
		linearComparison: "Lunaris vs Linear",
		obsidianComparison: "Lunaris vs Obsidian",
		notionComparison: "Lunaris vs Notion",
		tool: "Outils",
		wordCounter: "Compteur de mots",
		resources: "Ressources",
		trustCenter: "Centre de confiance",
		mcp: "MCP pour les agents",
		contact: "Contact",
		legal: "Juridique",
		privacyPolicy: "Politique de Confidentialité",
		cookiePolicy: "Politique relative aux cookies",
		cookieSettings: "Paramètres des cookies",
		termsOfService: "Conditions d'Utilisation",
		subprocessors: "Sous-traitants",
		fineprint: "© 2026 Lunaris",
	},
	notFound: {
		headline: "Page non trouvée",
		subheadline: "Désolé, mais la page que vous cherchiez est introuvable.",
		cta: "Retour à l'accueil",
	},
} satisfies Dictionary;

export default fr;
