import type { Locale } from "@/i18n/config";

type Benefit = { title: string; description: string };

type HomepageCopy = {
	metaTitle: string;
	metaDescription: string;
	headline: string;
	headlineEnd: string;
	description: string;
	start: string;
	open: string;
	freeNote: string;
	watch: string;
	tour: string;
	chapters: [string, string, string];
	benefits: [Benefit, Benefit];
	ownershipTitle: string;
	ownershipDescription: string;
	selfHost: string;
	source: string;
	faqTitle: string;
	faqDescription: string;
	faqs: [Benefit, Benefit, Benefit, Benefit];
	pricing: string;
	closingTitle: string;
	closingDescription: string;
};

export const homepageCopy: Record<Locale, HomepageCopy> = {
	en: {
		metaTitle: "Lunaris — A home for your team’s knowledge",
		metaDescription:
			"Bring notes, knowledge bases, and projects together in an offline-first workspace. Collaborate in real time, add extensions, and choose where your data lives.",
		headline: "A home for your",
		headlineEnd: "team’s knowledge.",
		description:
			"Bring notes, knowledge bases, and projects together. Choose each workspace’s tools with extensions. Keep working offline.",
		start: "Start free",
		open: "Open Lunaris",
		freeNote: "Free for up to 3 members. No credit card needed.",
		watch: "See it in action",
		tour: "Explore the workspace demo",
		chapters: ["Notes", "Boards", "Whiteboards"],
		benefits: [
			{
				title: "Give knowledge a home.",
				description:
					"Keep meeting notes, decisions, and reference material together. Give your team one place to look, and a shared place to think.",
			},
			{
				title: "Move work forward together.",
				description:
					"Edit in real time, share workspaces, and manage access. Work on your own or bring the whole team onto the same page.",
			},
		],
		ownershipTitle: "Your workspace. Your terms.",
		ownershipDescription:
			"Keep working without a connection. Choose local-only storage, sync with Lunaris Cloud, or host Community Edition on your own server.",
		selfHost: "Explore self-hosting",
		source: "View source on GitHub",
		faqTitle: "A few things to know.",
		faqDescription: "Start small. Make it your team’s own.",
		faqs: [
			{
				title: "Can we start for free?",
				description:
					"Yes. Free includes up to 3 members, 25 resources, unlimited workspaces, cloud sync, and 250 MB of storage per organization. No payment details required.",
			},
			{
				title: "Does it work offline?",
				description:
					"Yes. Keep working in your workspace without a connection. Synced work catches up when you’re back online. You can also keep work local to your device.",
			},
			{
				title: "What can we add with extensions?",
				description:
					"Boards, whiteboards, spreadsheets, and other tools can live alongside your notes. Choose community extensions or build private tools for your team’s workflow.",
			},
			{
				title: "Can I use Lunaris on my own?",
				description:
					"Of course. Keep your personal notes, ideas, and writing in your own workspace. Invite others when you want to share the work.",
			},
		],
		pricing: "Compare plans",
		closingTitle: "Make room for your team’s next idea.",
		closingDescription:
			"Start with a note. Build a shared home for what comes next.",
	},
	es: {
		metaTitle: "Lunaris — Un hogar para el conocimiento de tu equipo",
		metaDescription:
			"Reúne notas, bases de conocimiento y proyectos en un espacio que funciona sin conexión. Colabora en tiempo real, añade extensiones y decide dónde guardar tus datos.",
		headline: "Un hogar para el",
		headlineEnd: "conocimiento de tu equipo.",
		description:
			"Reúne notas, bases de conocimiento y proyectos. Elige las herramientas de cada espacio con extensiones. Sigue trabajando sin conexión.",
		start: "Empieza gratis",
		open: "Abrir Lunaris",
		freeNote: "Gratis para hasta 3 miembros. Sin tarjeta de crédito.",
		watch: "Ver en acción",
		tour: "Explora la demostración del espacio de trabajo",
		chapters: ["Notas", "Tableros", "Pizarras"],
		benefits: [
			{
				title: "Dale un hogar al conocimiento.",
				description:
					"Reúne notas de reuniones, decisiones y material de referencia. Un lugar donde tu equipo pueda buscar y pensar en conjunto.",
			},
			{
				title: "Avanzad juntos.",
				description:
					"Edita en tiempo real, comparte espacios y gestiona el acceso. Trabaja por tu cuenta o reúne a todo el equipo en la misma página.",
			},
		],
		ownershipTitle: "Tu espacio. Tus condiciones.",
		ownershipDescription:
			"Sigue trabajando sin conexión. Guarda tu trabajo solo en tu dispositivo, sincroniza con Lunaris Cloud o aloja Community Edition en tu servidor.",
		selfHost: "Explorar el autoalojamiento",
		source: "Ver el código en GitHub",
		faqTitle: "Lo que conviene saber.",
		faqDescription: "Empieza poco a poco. Hazlo vuestro.",
		faqs: [
			{
				title: "¿Podemos empezar gratis?",
				description:
					"Sí. El plan gratuito incluye hasta 3 miembros, 25 recursos, espacios ilimitados, sincronización y 250 MB de almacenamiento por organización. Sin datos de pago.",
			},
			{
				title: "¿Funciona sin conexión?",
				description:
					"Sí. Sigue trabajando sin conexión. Los cambios se sincronizan cuando vuelves a conectarte. También puedes mantener tu trabajo solo en tu dispositivo.",
			},
			{
				title: "¿Qué podemos añadir con extensiones?",
				description:
					"Tableros, pizarras, hojas de cálculo y otras herramientas junto a tus notas. Elige extensiones de la comunidad o crea herramientas privadas para tu equipo.",
			},
			{
				title: "¿Puedo usar Lunaris por mi cuenta?",
				description:
					"Claro. Guarda tus notas personales, ideas y textos en tu propio espacio. Invita a otros cuando quieras compartir el trabajo.",
			},
		],
		pricing: "Comparar planes",
		closingTitle: "Haz sitio para la próxima idea de tu equipo.",
		closingDescription:
			"Empieza con una nota. Crea un hogar compartido para lo que viene.",
	},
	fr: {
		metaTitle: "Lunaris — Un espace pour le savoir de votre équipe",
		metaDescription:
			"Réunissez notes, bases de connaissances et projets dans un espace utilisable hors ligne. Collaborez en temps réel, ajoutez des extensions et choisissez où stocker vos données.",
		headline: "Un espace pour le",
		headlineEnd: "savoir de votre équipe.",
		description:
			"Réunissez notes, bases de connaissances et projets. Choisissez les outils de chaque espace grâce aux extensions. Continuez hors ligne.",
		start: "Commencer gratuitement",
		open: "Ouvrir Lunaris",
		freeNote: "Gratuit jusqu’à 3 membres. Sans carte bancaire.",
		watch: "Voir en action",
		tour: "Explorer la démonstration de l’espace de travail",
		chapters: ["Notes", "Tableaux", "Tableaux blancs"],
		benefits: [
			{
				title: "Donnez un espace au savoir.",
				description:
					"Réunissez comptes rendus, décisions et références. Offrez à votre équipe un endroit où chercher et réfléchir ensemble.",
			},
			{
				title: "Avancez ensemble.",
				description:
					"Éditez en temps réel, partagez des espaces et gérez les accès. Travaillez en solo ou réunissez toute l’équipe sur la même page.",
			},
		],
		ownershipTitle: "Votre espace. Vos conditions.",
		ownershipDescription:
			"Continuez sans connexion. Gardez vos données sur votre appareil, synchronisez avec Lunaris Cloud ou hébergez Community Edition sur votre serveur.",
		selfHost: "Découvrir l’auto-hébergement",
		source: "Voir le code sur GitHub",
		faqTitle: "Quelques repères pour commencer.",
		faqDescription: "Commencez simplement. Faites-en votre espace.",
		faqs: [
			{
				title: "Peut-on commencer gratuitement ?",
				description:
					"Oui. Le forfait gratuit comprend jusqu’à 3 membres, 25 ressources, des espaces illimités, la synchronisation et 250 Mo de stockage par organisation. Aucune carte requise.",
			},
			{
				title: "Est-ce utilisable hors ligne ?",
				description:
					"Oui. Continuez à travailler sans connexion. Les modifications se synchronisent à votre retour en ligne. Vous pouvez aussi garder votre travail sur votre appareil uniquement.",
			},
			{
				title: "Que peut-on ajouter avec les extensions ?",
				description:
					"Tableaux, tableaux blancs, feuilles de calcul et autres outils peuvent côtoyer vos notes. Choisissez des extensions de la communauté ou créez des outils privés pour votre équipe.",
			},
			{
				title: "Puis-je utiliser Lunaris en solo ?",
				description:
					"Bien sûr. Gardez vos notes, idées et textes dans votre propre espace. Invitez d’autres personnes quand vous souhaitez partager votre travail.",
			},
		],
		pricing: "Comparer les forfaits",
		closingTitle: "Faites place à la prochaine idée de votre équipe.",
		closingDescription:
			"Commencez par une note. Créez un espace partagé pour la suite.",
	},
	de: {
		metaTitle: "Lunaris — Ein Zuhause für das Wissen deines Teams",
		metaDescription:
			"Notizen, Wissensdatenbanken und Projekte in einem Workspace, der offline funktioniert. Gemeinsam in Echtzeit arbeiten, Erweiterungen hinzufügen und den Speicherort selbst wählen.",
		headline: "Ein Zuhause für das",
		headlineEnd: "Wissen deines Teams.",
		description:
			"Vereine Notizen, Wissensdatenbanken und Projekte. Wähle die Werkzeuge jedes Workspaces mit Erweiterungen. Arbeite auch offline weiter.",
		start: "Kostenlos starten",
		open: "Lunaris öffnen",
		freeNote: "Kostenlos für bis zu 3 Mitglieder. Ohne Kreditkarte.",
		watch: "In Aktion ansehen",
		tour: "Workspace-Demo erkunden",
		chapters: ["Notizen", "Boards", "Whiteboards"],
		benefits: [
			{
				title: "Gib Wissen ein Zuhause.",
				description:
					"Halte Besprechungsnotizen, Entscheidungen und Referenzen zusammen. Ein gemeinsamer Ort zum Nachschlagen und Nachdenken.",
			},
			{
				title: "Bringt die Arbeit gemeinsam voran.",
				description:
					"Bearbeitet Inhalte in Echtzeit, teilt Workspaces und verwaltet Zugriffe. Arbeite allein oder mit dem ganzen Team an derselben Seite.",
			},
		],
		ownershipTitle: "Dein Workspace. Deine Regeln.",
		ownershipDescription:
			"Arbeite ohne Verbindung weiter. Speichere nur auf deinem Gerät, synchronisiere mit Lunaris Cloud oder betreibe Community Edition auf deinem Server.",
		selfHost: "Self-Hosting entdecken",
		source: "Quellcode auf GitHub ansehen",
		faqTitle: "Gut zu wissen.",
		faqDescription: "Klein anfangen. Gemeinsam gestalten.",
		faqs: [
			{
				title: "Können wir kostenlos starten?",
				description:
					"Ja. Kostenlos enthalten sind bis zu 3 Mitglieder, 25 Ressourcen, unbegrenzte Workspaces, Cloud-Sync und 250 MB Speicher pro Organisation. Keine Zahlungsdaten nötig.",
			},
			{
				title: "Funktioniert Lunaris offline?",
				description:
					"Ja. Arbeite ohne Verbindung weiter. Änderungen werden synchronisiert, sobald du wieder online bist. Du kannst deine Arbeit auch ausschließlich auf deinem Gerät speichern.",
			},
			{
				title: "Was können wir mit Erweiterungen ergänzen?",
				description:
					"Boards, Whiteboards, Tabellen und weitere Tools neben deinen Notizen. Wähle Community-Erweiterungen oder entwickle private Tools für dein Team.",
			},
			{
				title: "Kann ich Lunaris allein nutzen?",
				description:
					"Natürlich. Sammle persönliche Notizen, Ideen und Texte in deinem eigenen Workspace. Lade andere ein, wenn du deine Arbeit teilen möchtest.",
			},
		],
		pricing: "Tarife vergleichen",
		closingTitle: "Platz für die nächste Idee deines Teams.",
		closingDescription:
			"Beginnt mit einer Notiz. Schafft ein gemeinsames Zuhause für alles Weitere.",
	},
	"pt-BR": {
		metaTitle: "Lunaris — Um lar para o conhecimento da sua equipe",
		metaDescription:
			"Reúna notas, bases de conhecimento e projetos em um espaço que funciona offline. Colabore em tempo real, adicione extensões e escolha onde seus dados ficam.",
		headline: "Um lar para o",
		headlineEnd: "conhecimento da sua equipe.",
		description:
			"Reúna notas, bases de conhecimento e projetos. Escolha as ferramentas de cada espaço com extensões. Continue trabalhando offline.",
		start: "Comece grátis",
		open: "Abrir Lunaris",
		freeNote: "Grátis para até 3 membros. Sem cartão de crédito.",
		watch: "Veja em ação",
		tour: "Explore a demonstração do espaço de trabalho",
		chapters: ["Notas", "Quadros", "Lousas"],
		benefits: [
			{
				title: "Dê um lar ao conhecimento.",
				description:
					"Reúna notas de reuniões, decisões e materiais de referência. Um lugar para sua equipe encontrar respostas e pensar junto.",
			},
			{
				title: "Avancem juntos.",
				description:
					"Edite em tempo real, compartilhe espaços e gerencie o acesso. Trabalhe por conta própria ou reúna toda a equipe na mesma página.",
			},
		],
		ownershipTitle: "Seu espaço. Suas condições.",
		ownershipDescription:
			"Continue trabalhando sem conexão. Mantenha os dados só no dispositivo, sincronize com Lunaris Cloud ou hospede Community Edition no seu servidor.",
		selfHost: "Explore a hospedagem própria",
		source: "Veja o código no GitHub",
		faqTitle: "Bom saber antes de começar.",
		faqDescription: "Comece pequeno. Deixe com a cara da equipe.",
		faqs: [
			{
				title: "Podemos começar grátis?",
				description:
					"Sim. O plano gratuito inclui até 3 membros, 25 recursos, espaços ilimitados, sincronização e 250 MB de armazenamento por organização. Sem dados de pagamento.",
			},
			{
				title: "Funciona offline?",
				description:
					"Sim. Continue trabalhando sem conexão. As alterações são sincronizadas quando você volta a ficar online. Também é possível manter o trabalho só no dispositivo.",
			},
			{
				title: "O que podemos adicionar com extensões?",
				description:
					"Quadros, lousas, planilhas e outras ferramentas ao lado das suas notas. Escolha extensões da comunidade ou crie ferramentas privadas para sua equipe.",
			},
			{
				title: "Posso usar o Lunaris sozinho?",
				description:
					"Claro. Guarde suas notas, ideias e textos no seu próprio espaço. Convide outras pessoas quando quiser compartilhar o trabalho.",
			},
		],
		pricing: "Compare os planos",
		closingTitle: "Abra espaço para a próxima ideia da sua equipe.",
		closingDescription:
			"Comece com uma nota. Crie um lar compartilhado para o que vem depois.",
	},
};
