import type { Locale } from "@/i18n/config";
import type { ExtensionPermission } from "./extension-types";

export const extensionDocsUrl =
	"https://docs.lunaris.app/guides/tools-and-extensions/manage-extensions";
export const extensionRequestsUrl =
	"https://github.com/LunarisApp/extensions/tree/main/requests";
export const extensionQuickstartUrl =
	"https://docs.lunaris.app/developers/extensions/quickstart";

type ExtensionDescription = { description: string; about: string };
export type ExtensionsCopy = {
	nav: string;
	metaTitle: string;
	metaDescription: string;
	homeTitle: string;
	homeDescription: string;
	homeTools: Record<"spreadsheet" | "mini-app" | "exporter", string>;
	explore: string;
	manage: string;
	build: string;
	contributeTitle: string;
	contributeDescription: string;
	contribute: string;
	description: string;
	searchLabel: string;
	searchPlaceholder: string;
	clearSearch: string;
	all: string;
	catalog: string;
	builtIn: string;
	filterLabel: string;
	resultOne: string;
	resultMany: string;
	emptyTitle: string;
	emptyDescription: string;
	clearFilters: string;
	viewDetails: string;
	detailsLabel: string;
	typeLabel: string;
	developer: string;
	version: string;
	api: string;
	permissionsLabel: string;
	screenshotsLabel: string;
	screenshotFull: string;
	source: string;
	website: string;
	about: string;
	open: string;
	installTitle: string;
	builtInNote: string;
	catalogNote: string;
	allExtensions: string;
	updated: string;
	permissions: Record<ExtensionPermission, string>;
	items: Record<string, ExtensionDescription>;
};

export const extensionsCopy: Record<Locale, ExtensionsCopy> = {
	en: {
		nav: "Extensions",
		homeTitle: "The demo is just the start.",
		homeDescription:
			"Add the tools your team needs with extensions, workspace by workspace.",
		homeTools: {
			spreadsheet: "Spreadsheets",
			"mini-app": "Mini apps",
			exporter: "PDF exports",
		},
		explore: "Explore extensions",
		manage: "How to manage extensions",
		build: "Build your first extension",
		contributeTitle: "Help build the next extension",
		contributeDescription:
			"Pick an open request or propose an idea for the community to build.",
		contribute: "Browse extension requests",
		description:
			"Browse tools for your workspace. Install and manage them in Lunaris.",
		searchLabel: "Search extensions",
		searchPlaceholder: "Search by name, tool, or keyword…",
		clearSearch: "Clear search",
		all: "All",
		catalog: "Catalog",
		builtIn: "Built in",
		filterLabel: "Filter extensions",
		resultOne: "{count} extension",
		resultMany: "{count} extensions",
		emptyTitle: "No extensions found",
		emptyDescription: "Try another name or keyword, or clear your filters.",
		clearFilters: "Clear filters",
		viewDetails: "View details",
		detailsLabel: "Details",
		typeLabel: "Type",
		developer: "Developer",
		version: "Version",
		api: "Plugin API",
		permissionsLabel: "Permissions",
		screenshotsLabel: "Screenshots",
		screenshotFull: "View full-size screenshot",
		source: "Source code",
		website: "Website",
		about: "About",
		open: "Open Lunaris",
		installTitle: "Use this extension",
		builtInNote:
			"Included with Lunaris. Enable or disable it in Manage extensions for each workspace.",
		catalogNote:
			"In your workspace, open Manage extensions, find this extension, and install a compatible version.",
		allExtensions: "All extensions",
		updated: "Catalog updated",
		metaTitle: "Extensions — Lunaris",
		metaDescription:
			"Browse tools for your workspace. Install and manage them in Lunaris.",
		permissions: {
			"content.read": "Read workspace content",
			"content.write": "Edit workspace content",
			"files.read": "Read files",
			"files.write": "Write files",
			"downloads.write": "Save downloads",
			"network.https": "Make HTTPS requests",
		},
		items: {
			"rich-text": {
				description:
					"Turn notes, decisions, and team knowledge into structured pages.",
				about:
					"Create and edit notes with headings, lists, links, and rich formatting. Keep them alongside the rest of your workspace content.",
			},
			kanban: {
				description:
					"Plan work in columns and move tasks through your team’s process.",
				about:
					"Organize tasks into columns, add task details, and move work through each stage of your workflow.",
			},
			file: {
				description:
					"Keep reference files close and preview supported formats in place.",
				about:
					"Upload, organize, preview supported formats, and download files from your workspace.",
			},
			excalidraw: {
				description:
					"Sketch ideas and draw diagrams together on a shared canvas.",
				about:
					"Create drawings and diagrams together on an Excalidraw canvas inside Lunaris.",
			},
			spreadsheet: {
				description:
					"Work with tables and formulas, with offline collaboration and portable file formats.",
				about:
					"Work with tables and formulas in collaborative workbooks. Supports offline editing and portable file formats.",
			},
			"mini-app": {
				description: "Run self-contained HTML apps inside your workspace.",
				about:
					"Upload a self-contained HTML app and use its interactive interface alongside your notes. Keep scripts, styles, and data inside the file.",
			},
			exporter: {
				description: "Choose, order, and style workspace content for a PDF.",
				about:
					"Choose supported workspace content, arrange it in order, and set the page layout and typography before downloading a PDF.",
			},
			demo: {
				description:
					"A developer example with a read-only workspace dashboard.",
				about:
					"A developer example of a resource type, key-value storage, and a read-only dashboard. Use it to explore what an extension can contribute.",
			},
		},
	},
	es: {
		nav: "Extensiones",
		homeTitle: "La demo es solo el principio.",
		homeDescription:
			"Añade las herramientas que tu equipo necesita con extensiones, espacio por espacio.",
		homeTools: {
			spreadsheet: "Hojas de cálculo",
			"mini-app": "Mini apps",
			exporter: "Exportar a PDF",
		},
		explore: "Explorar extensiones",
		manage: "Cómo gestionar extensiones",
		build: "Crea tu primera extensión",
		contributeTitle: "Ayuda a crear la próxima extensión",
		contributeDescription:
			"Elige una propuesta abierta o comparte una idea para que la comunidad la desarrolle.",
		contribute: "Ver propuestas de extensiones",
		description:
			"Explora herramientas para tu espacio. Instálalas y gestiónalas en Lunaris.",
		searchLabel: "Buscar extensiones",
		searchPlaceholder: "Buscar por nombre, herramienta o palabra clave…",
		clearSearch: "Borrar búsqueda",
		all: "Todas",
		catalog: "Catálogo",
		builtIn: "Integradas",
		filterLabel: "Filtrar extensiones",
		resultOne: "{count} extensión",
		resultMany: "{count} extensiones",
		emptyTitle: "No se encontraron extensiones",
		emptyDescription:
			"Prueba otro nombre o palabra clave, o borra los filtros.",
		clearFilters: "Borrar filtros",
		viewDetails: "Ver detalles",
		detailsLabel: "Detalles",
		typeLabel: "Tipo",
		developer: "Desarrollador",
		version: "Versión",
		api: "API de plugins",
		permissionsLabel: "Permisos",
		screenshotsLabel: "Capturas",
		screenshotFull: "Ver captura a tamaño completo",
		source: "Código fuente",
		website: "Sitio web",
		about: "Acerca de",
		open: "Abrir Lunaris",
		installTitle: "Usar esta extensión",
		builtInNote:
			"Incluida en Lunaris. Actívala o desactívala en Gestionar extensiones de cada espacio.",
		catalogNote:
			"En tu espacio, abre Gestionar extensiones, busca esta extensión e instala una versión compatible.",
		allExtensions: "Todas las extensiones",
		updated: "Catálogo actualizado",
		metaTitle: "Extensiones — Lunaris",
		metaDescription:
			"Explora herramientas para tu espacio. Instálalas y gestiónalas en Lunaris.",
		permissions: {
			"content.read": "Leer contenido del espacio",
			"content.write": "Editar contenido del espacio",
			"files.read": "Leer archivos",
			"files.write": "Escribir archivos",
			"downloads.write": "Guardar descargas",
			"network.https": "Realizar solicitudes HTTPS",
		},
		items: {
			"rich-text": {
				description:
					"Organiza notas, decisiones y conocimiento del equipo en páginas estructuradas.",
				about:
					"Crea y edita notas con títulos, listas, enlaces y formato enriquecido. Mantenlas junto al resto del contenido de tu espacio.",
			},
			kanban: {
				description:
					"Planifica en columnas y mueve tareas por el proceso de tu equipo.",
				about:
					"Organiza tareas en columnas, añade detalles y avanza por cada etapa de tu proceso de trabajo.",
			},
			file: {
				description:
					"Mantén cerca tus archivos de referencia y previsualiza los formatos compatibles.",
				about:
					"Sube, organiza, previsualiza formatos compatibles y descarga archivos de tu espacio.",
			},
			excalidraw: {
				description:
					"Esboza ideas y dibuja diagramas en equipo sobre un lienzo compartido.",
				about:
					"Crea dibujos y diagramas en equipo sobre un lienzo de Excalidraw dentro de Lunaris.",
			},
			spreadsheet: {
				description:
					"Trabaja con tablas y fórmulas, colaboración sin conexión y formatos portables.",
				about:
					"Trabaja con tablas y fórmulas en libros colaborativos. Admite edición sin conexión y formatos de archivo portables.",
			},
			"mini-app": {
				description:
					"Ejecuta aplicaciones HTML autónomas dentro de tu espacio.",
				about:
					"Sube una aplicación HTML autónoma y usa su interfaz interactiva junto a tus notas. Incluye scripts, estilos y datos en el archivo.",
			},
			exporter: {
				description:
					"Elige, ordena y da estilo al contenido para crear un PDF.",
				about:
					"Elige contenido compatible, ordénalo y configura el diseño y la tipografía antes de descargar un PDF.",
			},
			demo: {
				description:
					"Un ejemplo para desarrolladores con un panel de solo lectura.",
				about:
					"Un ejemplo para desarrolladores con un tipo de recurso, almacenamiento clave-valor y un panel de solo lectura. Permite explorar lo que puede aportar una extensión.",
			},
		},
	},
	fr: {
		nav: "Extensions",
		homeTitle: "La démo n’est qu’un début.",
		homeDescription:
			"Ajoutez les outils dont votre équipe a besoin grâce aux extensions, espace par espace.",
		homeTools: {
			spreadsheet: "Feuilles de calcul",
			"mini-app": "Mini apps",
			exporter: "Exports PDF",
		},
		explore: "Découvrir les extensions",
		manage: "Comment gérer les extensions",
		build: "Créer votre première extension",
		contributeTitle: "Contribuez à la prochaine extension",
		contributeDescription:
			"Choisissez une proposition ouverte ou partagez une idée à développer avec la communauté.",
		contribute: "Voir les propositions d’extensions",
		description:
			"Parcourez les outils pour votre espace. Installez-les et gérez-les dans Lunaris.",
		searchLabel: "Rechercher des extensions",
		searchPlaceholder: "Rechercher un nom, un outil ou un mot-clé…",
		clearSearch: "Effacer la recherche",
		all: "Toutes",
		catalog: "Catalogue",
		builtIn: "Intégrées",
		filterLabel: "Filtrer les extensions",
		resultOne: "{count} extension",
		resultMany: "{count} extensions",
		emptyTitle: "Aucune extension trouvée",
		emptyDescription:
			"Essayez un autre nom ou mot-clé, ou effacez les filtres.",
		clearFilters: "Effacer les filtres",
		viewDetails: "Voir les détails",
		detailsLabel: "Détails",
		typeLabel: "Type",
		developer: "Développeur",
		version: "Version",
		api: "API des plugins",
		permissionsLabel: "Autorisations",
		screenshotsLabel: "Captures d’écran",
		screenshotFull: "Voir la capture en taille réelle",
		source: "Code source",
		website: "Site web",
		about: "À propos",
		open: "Ouvrir Lunaris",
		installTitle: "Utiliser cette extension",
		builtInNote:
			"Incluse dans Lunaris. Activez-la ou désactivez-la dans Gérer les extensions pour chaque espace.",
		catalogNote:
			"Dans votre espace, ouvrez Gérer les extensions, trouvez cette extension et installez une version compatible.",
		allExtensions: "Toutes les extensions",
		updated: "Catalogue mis à jour",
		metaTitle: "Extensions — Lunaris",
		metaDescription:
			"Parcourez les outils pour votre espace. Installez-les et gérez-les dans Lunaris.",
		permissions: {
			"content.read": "Lire le contenu de l’espace",
			"content.write": "Modifier le contenu de l’espace",
			"files.read": "Lire les fichiers",
			"files.write": "Écrire des fichiers",
			"downloads.write": "Enregistrer des téléchargements",
			"network.https": "Effectuer des requêtes HTTPS",
		},
		items: {
			"rich-text": {
				description:
					"Structurez notes, décisions et savoir d’équipe dans des pages.",
				about:
					"Créez des notes avec titres, listes, liens et mise en forme. Gardez-les avec le reste du contenu de votre espace.",
			},
			kanban: {
				description:
					"Planifiez en colonnes et faites avancer les tâches dans votre processus.",
				about:
					"Organisez les tâches en colonnes, ajoutez des détails et faites avancer le travail à chaque étape de votre processus.",
			},
			file: {
				description:
					"Gardez vos références à portée de main et prévisualisez les formats pris en charge.",
				about:
					"Importez, organisez, prévisualisez les formats compatibles et téléchargez les fichiers de votre espace.",
			},
			excalidraw: {
				description:
					"Esquissez vos idées et dessinez des diagrammes sur un canevas partagé.",
				about:
					"Créez ensemble des dessins et diagrammes sur un canevas Excalidraw dans Lunaris.",
			},
			spreadsheet: {
				description:
					"Utilisez tableaux et formules, avec collaboration hors ligne et formats portables.",
				about:
					"Travaillez avec tableaux et formules dans des classeurs collaboratifs. Prend en charge l’édition hors ligne et les formats de fichiers portables.",
			},
			"mini-app": {
				description:
					"Exécutez des applications HTML autonomes dans votre espace.",
				about:
					"Importez une application HTML autonome et utilisez son interface interactive à côté de vos notes. Incluez scripts, styles et données dans le fichier.",
			},
			exporter: {
				description:
					"Choisissez, ordonnez et mettez en forme le contenu pour un PDF.",
				about:
					"Choisissez les contenus compatibles, ordonnez-les et réglez la mise en page et la typographie avant de télécharger un PDF.",
			},
			demo: {
				description:
					"Un exemple pour développeurs avec un tableau de bord en lecture seule.",
				about:
					"Un exemple pour développeurs avec un type de ressource, un stockage clé-valeur et un tableau de bord en lecture seule. Explorez les possibilités d’une extension.",
			},
		},
	},
	de: {
		nav: "Erweiterungen",
		homeTitle: "Die Demo ist erst der Anfang.",
		homeDescription:
			"Ergänze die Werkzeuge, die dein Team braucht, mit Erweiterungen für jeden Workspace.",
		homeTools: {
			spreadsheet: "Tabellen",
			"mini-app": "Mini-Apps",
			exporter: "PDF-Export",
		},
		explore: "Erweiterungen entdecken",
		manage: "Erweiterungen verwalten",
		build: "Deine erste Erweiterung bauen",
		contributeTitle: "Hilf bei der nächsten Erweiterung mit",
		contributeDescription:
			"Wähle einen offenen Vorschlag oder teile eine Idee, die die Community umsetzen kann.",
		contribute: "Erweiterungsvorschläge ansehen",
		description:
			"Entdecke Werkzeuge für deinen Workspace. Installiere und verwalte sie in Lunaris.",
		searchLabel: "Erweiterungen suchen",
		searchPlaceholder: "Nach Name, Werkzeug oder Stichwort suchen…",
		clearSearch: "Suche löschen",
		all: "Alle",
		catalog: "Katalog",
		builtIn: "Integriert",
		filterLabel: "Erweiterungen filtern",
		resultOne: "{count} Erweiterung",
		resultMany: "{count} Erweiterungen",
		emptyTitle: "Keine Erweiterungen gefunden",
		emptyDescription:
			"Versuche einen anderen Namen oder ein Stichwort oder entferne die Filter.",
		clearFilters: "Filter löschen",
		viewDetails: "Details ansehen",
		detailsLabel: "Details",
		typeLabel: "Typ",
		developer: "Entwickler",
		version: "Version",
		api: "Plugin-API",
		permissionsLabel: "Berechtigungen",
		screenshotsLabel: "Screenshots",
		screenshotFull: "Screenshot in voller Größe ansehen",
		source: "Quellcode",
		website: "Website",
		about: "Über diese Erweiterung",
		open: "Lunaris öffnen",
		installTitle: "Diese Erweiterung nutzen",
		builtInNote:
			"In Lunaris enthalten. Aktiviere oder deaktiviere sie unter Erweiterungen verwalten für jeden Workspace.",
		catalogNote:
			"Öffne Erweiterungen verwalten in deinem Workspace, suche diese Erweiterung und installiere eine kompatible Version.",
		allExtensions: "Alle Erweiterungen",
		updated: "Katalog aktualisiert",
		metaTitle: "Erweiterungen — Lunaris",
		metaDescription:
			"Entdecke Werkzeuge für deinen Workspace. Installiere und verwalte sie in Lunaris.",
		permissions: {
			"content.read": "Workspace-Inhalte lesen",
			"content.write": "Workspace-Inhalte bearbeiten",
			"files.read": "Dateien lesen",
			"files.write": "Dateien schreiben",
			"downloads.write": "Downloads speichern",
			"network.https": "HTTPS-Anfragen senden",
		},
		items: {
			"rich-text": {
				description:
					"Halte Notizen, Entscheidungen und Teamwissen in strukturierten Seiten fest.",
				about:
					"Erstelle Notizen mit Überschriften, Listen, Links und Formatierung. Bewahre sie zusammen mit den anderen Inhalten deines Workspaces auf.",
			},
			kanban: {
				description:
					"Plane in Spalten und bewege Aufgaben durch euren Prozess.",
				about:
					"Ordne Aufgaben in Spalten, ergänze Details und bewege die Arbeit durch die einzelnen Schritte deines Workflows.",
			},
			file: {
				description:
					"Behalte Referenzdateien im Workspace und zeige unterstützte Formate direkt an.",
				about:
					"Lade Dateien hoch, organisiere sie, sieh unterstützte Formate an und lade sie aus deinem Workspace herunter.",
			},
			excalidraw: {
				description:
					"Skizziert Ideen und zeichnet Diagramme auf einer gemeinsamen Fläche.",
				about:
					"Erstellt gemeinsam Zeichnungen und Diagramme auf einer Excalidraw-Zeichenfläche in Lunaris.",
			},
			spreadsheet: {
				description:
					"Arbeite mit Tabellen und Formeln, Offline-Zusammenarbeit und portablen Dateiformaten.",
				about:
					"Arbeite mit Tabellen und Formeln in gemeinsamen Arbeitsmappen. Unterstützt Offline-Bearbeitung und portable Dateiformate.",
			},
			"mini-app": {
				description: "Führe eigenständige HTML-Apps in deinem Workspace aus.",
				about:
					"Lade eine eigenständige HTML-App hoch und nutze ihre interaktive Oberfläche neben deinen Notizen. Skripte, Stile und Daten gehören in die Datei.",
			},
			exporter: {
				description: "Wähle, ordne und gestalte Workspace-Inhalte für ein PDF.",
				about:
					"Wähle unterstützte Inhalte aus, ordne sie an und lege Seitenlayout und Typografie fest, bevor du ein PDF herunterlädst.",
			},
			demo: {
				description:
					"Ein Entwicklerbeispiel mit schreibgeschütztem Workspace-Dashboard.",
				about:
					"Ein Entwicklerbeispiel mit Ressourcentyp, Schlüssel-Wert-Speicher und einem schreibgeschützten Dashboard. Erkunde, was eine Erweiterung beitragen kann.",
			},
		},
	},
	"pt-BR": {
		nav: "Extensões",
		homeTitle: "A demo é só o começo.",
		homeDescription:
			"Adicione as ferramentas que sua equipe precisa com extensões, espaço por espaço.",
		homeTools: {
			spreadsheet: "Planilhas",
			"mini-app": "Mini apps",
			exporter: "Exportar PDF",
		},
		explore: "Explore as extensões",
		manage: "Como gerenciar extensões",
		build: "Crie sua primeira extensão",
		contributeTitle: "Ajude a criar a próxima extensão",
		contributeDescription:
			"Escolha uma proposta aberta ou compartilhe uma ideia para a comunidade desenvolver.",
		contribute: "Ver propostas de extensões",
		description:
			"Explore ferramentas para seu espaço. Instale e gerencie no Lunaris.",
		searchLabel: "Buscar extensões",
		searchPlaceholder: "Buscar por nome, ferramenta ou palavra-chave…",
		clearSearch: "Limpar busca",
		all: "Todas",
		catalog: "Catálogo",
		builtIn: "Integradas",
		filterLabel: "Filtrar extensões",
		resultOne: "{count} extensão",
		resultMany: "{count} extensões",
		emptyTitle: "Nenhuma extensão encontrada",
		emptyDescription: "Tente outro nome ou palavra-chave, ou limpe os filtros.",
		clearFilters: "Limpar filtros",
		viewDetails: "Ver detalhes",
		detailsLabel: "Detalhes",
		typeLabel: "Tipo",
		developer: "Desenvolvedor",
		version: "Versão",
		api: "API de plugins",
		permissionsLabel: "Permissões",
		screenshotsLabel: "Capturas de tela",
		screenshotFull: "Ver captura em tamanho real",
		source: "Código-fonte",
		website: "Site",
		about: "Sobre",
		open: "Abrir Lunaris",
		installTitle: "Usar esta extensão",
		builtInNote:
			"Incluída no Lunaris. Ative ou desative em Gerenciar extensões para cada espaço.",
		catalogNote:
			"No seu espaço, abra Gerenciar extensões, encontre esta extensão e instale uma versão compatível.",
		allExtensions: "Todas as extensões",
		updated: "Catálogo atualizado",
		metaTitle: "Extensões — Lunaris",
		metaDescription:
			"Explore ferramentas para seu espaço. Instale e gerencie no Lunaris.",
		permissions: {
			"content.read": "Ler conteúdo do espaço",
			"content.write": "Editar conteúdo do espaço",
			"files.read": "Ler arquivos",
			"files.write": "Gravar arquivos",
			"downloads.write": "Salvar downloads",
			"network.https": "Fazer solicitações HTTPS",
		},
		items: {
			"rich-text": {
				description:
					"Organize notas, decisões e conhecimento da equipe em páginas estruturadas.",
				about:
					"Crie notas com títulos, listas, links e formatação. Mantenha tudo junto ao restante do conteúdo do seu espaço.",
			},
			kanban: {
				description:
					"Planeje em colunas e mova tarefas pelo processo da equipe.",
				about:
					"Organize tarefas em colunas, adicione detalhes e avance por cada etapa do seu fluxo de trabalho.",
			},
			file: {
				description:
					"Mantenha referências por perto e visualize os formatos compatíveis no próprio espaço.",
				about:
					"Envie, organize, visualize formatos compatíveis e baixe arquivos do seu espaço.",
			},
			excalidraw: {
				description:
					"Esbocem ideias e desenhem diagramas juntos em uma tela compartilhada.",
				about:
					"Crie desenhos e diagramas em equipe em uma tela do Excalidraw dentro do Lunaris.",
			},
			spreadsheet: {
				description:
					"Trabalhe com tabelas e fórmulas, colaboração offline e formatos portáteis.",
				about:
					"Trabalhe com tabelas e fórmulas em pastas colaborativas. Oferece edição offline e formatos de arquivo portáveis.",
			},
			"mini-app": {
				description:
					"Execute aplicativos HTML independentes dentro do seu espaço.",
				about:
					"Envie um app HTML independente e use sua interface interativa ao lado das notas. Inclua scripts, estilos e dados no próprio arquivo.",
			},
			exporter: {
				description:
					"Escolha, ordene e formate o conteúdo do espaço para um PDF.",
				about:
					"Escolha conteúdos compatíveis, organize a ordem e ajuste o layout e a tipografia antes de baixar um PDF.",
			},
			demo: {
				description:
					"Um exemplo para desenvolvedores com um painel somente leitura.",
				about:
					"Um exemplo para desenvolvedores com tipo de recurso, armazenamento chave-valor e painel somente leitura. Explore o que uma extensão pode oferecer.",
			},
		},
	},
};
