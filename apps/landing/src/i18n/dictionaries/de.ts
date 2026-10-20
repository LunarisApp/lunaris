import { openSourceCopy } from "@/data/open-source";
import type { Dictionary } from "./types";

const de = {
	meta: {
		title: `Lunaris — ${openSourceCopy.de.headline}`,
		description: openSourceCopy.de.description,
	},
	accessibility: {
		demoVideoDescription:
			"Stummer Rundgang: Die Seitenleiste eines Arbeitsbereichs zeigt Übersicht, Roadmap, Whiteboard und Ordner. Die Übersicht enthält formatierten Text. Die Roadmap gruppiert Aufgabenkarten nach Status; eine Karte wird zwischen Spalten verschoben. Das Whiteboard zeigt verbundene Formen. Zum Schluss stehen Roadmap und Übersicht nebeneinander, und die Übersicht wird gescrollt.",
		switchLanguage: "Sprache wechseln",
		openMenu: "Menü öffnen",
		closeMenu: "Menü schließen",
		switchTheme: "Darstellung wechseln",
		lightTheme: "Hell",
		darkTheme: "Dunkel",
		systemTheme: "System",
		demoVideo: "Videodemonstration des Lunaris-Arbeitsbereichs",

		skipToContent: "Zum Hauptinhalt springen",
		primaryNavigation: "Hauptnavigation",
		footerNavigation: "Fußzeilennavigation",
	},
	nav: {
		pricing: "Preise",
		docs: "Dokumentation",
		mcp: "MCP",
		contact: "Kontakt",
	},
	hero: {
		mcpAnnouncement: {
			badge: "Neu",
			label: "Verbinden Sie Ihre KI-Tools mit MCP",
		},
		headline: openSourceCopy.de.headline,
		subheadline: {
			beforeHighlight: "Beginnen Sie mit dem",
			highlight: "Wesentlichen.",
			betweenHighlights: "Fügen Sie",
			secondHighlight: "Erweiterungen hinzu, wenn Ihre Anforderungen wachsen.",
			afterHighlight: " Arbeiten Sie offline oder in Echtzeit zusammen.",
		},
	},
	problems: {
		headline: "Warum sollten Sie sich nach Ihrem Organisation richten?",
		subheadline:
			"Komplettlösungen belasten jedes Arbeitsbereich mit demselben Ballast, denselben Grenzen und demselben Ablauf.",
		items: {
			featureBloat: {
				headline: "Zu viele Funktionen",
				subheadline:
					"Jede fest eingebaute Funktion bringt ein weiteres Menü mit — selbst wenn Ihr Arbeitsbereich sie nie braucht.",
			},
			vendorLockIn: {
				headline: "Anbieterbindung",
				subheadline:
					"Cloud-Zwang und proprietäre Systeme bestimmen, wann und wo Ihre Arbeit verfügbar ist.",
			},
			rigidWorkflows: {
				headline: "Starre Arbeitsabläufe",
				subheadline:
					"Ein Roman, eine Wissensdatenbank und ein internes Werkzeug sollten nicht in dieselbe Form gezwungen werden.",
			},
		},
	},
	bentoFeatures: {
		headline:
			"Beginnen Sie mit dem Schreiben. Gestalten Sie alles darum herum.",
		subheadline:
			"Halten Sie den Kern fokussiert. Ergänzen Sie Zusammenarbeit, KI und Erweiterungen zu Ihren Bedingungen.",
		items: {
			dataOwnership: {
				headline: "Ihre Daten gehören Ihnen",
				subheadline:
					"Behalten Sie sensible Arbeitsbereiche auf Ihrem Gerät oder wählen Sie den Speicherort synchronisierter Daten.",
			},
			offlineFirst: {
				headline: "Offline-first",
				subheadline:
					"Schreiben Sie ohne Verbindung weiter. Synchronisieren Sie später — wenn Sie möchten.",
			},
			extensions: {
				headline: "Erweiterungen",
				subheadline:
					"Installieren Sie Community-Werkzeuge oder entwickeln Sie private Erweiterungen für die Abläufe Ihres Teams.",
			},
			collaboration: {
				headline: "Zusammenarbeit",
				subheadline:
					"Bearbeiten Sie gemeinsam in Echtzeit, teilen Sie Arbeitsbereiche und verwalten Sie den Zugriff im Team.",
			},
			aiReady: {
				headline: "Bereit für KI",
				subheadline:
					"Verbinden Sie KI-Werkzeuge über MCP und bestimmen Sie, wann sie Teil Ihres Ablaufs werden.",
			},
			fastLightweight: {
				headline: "Schnell und leichtgewichtig",
				subheadline:
					"Startet schnell und bleibt reaktionsschnell, damit Ihr Organisation Sie nie ausbremst.",
			},
			crossPlatform: {
				headline: "Plattformübergreifend",
				subheadline:
					"Wechseln Sie zwischen Web und Desktop, ohne einen anderen Organisation erlernen zu müssen.",
			},
		},
	},
	faqs: {
		headline: "Fragen? Hier finden Sie Antworten.",
		items: {
			openPlatform: {
				question: "Was macht Lunaris zu einer offenen Plattform?",
				answer:
					"Lunaris beginnt mit einem fokussierten Schreibkern. Community-Erweiterungen fügen spezialisierte Werkzeuge hinzu, während Teams private Erweiterungen für interne Abläufe entwickeln können — ohne jede Organisation in eine Komplettlösung zu verwandeln.",
			},
			free: {
				question: "Kann ich es kostenlos nutzen?",
				answer:
					"Ja. Free umfasst Cloud-Synchronisierung, unbegrenzte Arbeitsbereiche, bis zu 25 Elemente, bis zu 3 Mitglieder und 250 MB Dateispeicher pro Organisation mit maximal 25 MB pro Datei. Zahlungsdaten sind nicht erforderlich. Sieh dir die {pricingLink} an.",
			},
			offline: {
				question: "Funktioniert es offline?",
				answer:
					"Ja, Sie können bei allen Plänen offline schreiben. Ihre Arbeit wird mit der Cloud synchronisiert, sobald Sie online gehen, damit Sie von jedem Gerät darauf zugreifen und zusammenarbeiten können. Sie können die Cloud-Synchronisierung auch deaktivieren und die App vollständig offline nutzen.",
			},
			security: {
				question: "Was bieten Sie für Sicherheit und Compliance?",
				answer:
					"Ihre Texte gehören Ihnen. Sie wählen, wo sie gespeichert werden, in den USA oder der EU, und alles ist während der Übertragung und im Ruhezustand verschlüsselt. Enterprise-Teams erhalten zusätzliche Kontrollen wie benutzerdefinierte Rollen, SSO & SCIM und SLA-Garantien. Weitere Informationen finden Sie in unserem {trustCenterLink}.",
			},
			fileStorage: {
				question: "Was zählt zum Dateispeicher?",
				answer:
					"Hochgeladene Dateien und Anhänge teilen sich einen Speicherpool über alle Arbeitsbereiche der Organisation. Dateien im Papierkorb zählen bis zur endgültigen Löschung. Rein lokale Dateien belegen keinen Cloud-Speicher. Es gelten Dezimaleinheiten: 1 MB = 1.000.000 Bytes; 1 GB = 1.000 MB.",
			},
			storageFull: {
				question:
					"Was passiert, wenn der Speicher meiner Organisation voll ist?",
				answer:
					"Vorhandene Dateien bleiben lesbar und können heruntergeladen oder gelöscht werden, auch nach einem Downgrade oder dem Entfernen von Mitgliedern. Uploads, die den Speicherverbrauch erhöhen, pausieren, bis du Platz schaffst oder den Plan erweiterst. Kleinere Ersatzdateien sind innerhalb des Dateigrößenlimits deines Plans möglich. Abgelehnte Uploads bleiben auf deinem Gerät.",
			},
			aiTraining: {
				question:
					"Werden meine Texte zum Trainieren von KI-Modellen verwendet?",
				answer: "Nein.",
			},
		},
	},
	pricing: {
		headline: "Einfache Preise für jede Organisation.",
		plans: {
			free: {
				name: "Free",
				subheadline:
					"Für persönliche Arbeit und kleine gemeinsame Organisationen.",
				features: [
					"Bis zu 25 Elemente",
					"Bis zu 3 Mitglieder",
					"Unbegrenzte Arbeitsbereiche",
					"Cloud-Synchronisierung",
					"Basis-Erweiterungen",
					"250 MB Speicher pro Organisation",
					"25 MB pro Datei",
				],
				ctaLabel: "Kostenlos starten",
			},
			plus: {
				name: "Plus",
				subheadline:
					"Für aktive Organisationen mit mehr Inhalten oder Mitgliedern.",
				features: [
					"Alles in Free",
					"Unbegrenzte Elemente",
					"Bis zu 10 Mitglieder",
					"Unbegrenzte Arbeitsbereiche",
					"10 GB pro Organisation",
					"500 MB pro Datei",
				],
				ctaLabel: "Plus wählen",
			},
			business: {
				name: "Business",
				subheadline:
					"Für wachsende Teams, die alle Erweiterungen ohne Mitgliederlimit benötigen.",
				features: [
					"Alles in Plus",
					"Unbegrenzte Mitglieder",
					"Alle Erweiterungen",
					"Prioritäts-Support",
					"100 GB pro Organisation",
					"5 GB pro Datei",
				],
				ctaLabel: "Business wählen",
			},
			enterprise: {
				name: "Enterprise",
				subheadline:
					"Für Organisationen mit individuellen Anforderungen an Sicherheit, Zugriff und Support.",
				features: [
					"Alles in Business",
					"Benutzerdefinierte Rollen & Berechtigungen",
					"SSO & SCIM",
					"SOC 2",
					"SLA-Tracking",
					"1 TB; individuelle Limits möglich",
					"5 GB pro Datei",
				],
				ctaLabel: "Mit uns sprechen",
			},
		},
	},
	pricingPage: {
		title: "Lunaris Preise — Kostenlos starten, einzeln erweitern",
		description:
			"Starten Sie kostenlos und ohne Zahlungsdaten. Jeder Lunaris-Organisation hat seinen eigenen Plan – Sie erweitern nur die, die mehr Elemente, Mitglieder oder Erweiterungen benötigen.",
		headline: "Kostenlos starten. Organisationen einzeln erweitern.",
		subheadline:
			"Erstellen Sie ohne Zahlungsdaten einen synchronisierten Organisation. Jeder Organisation hat seinen eigenen Plan – Sie erweitern nur, wo mehr Elemente oder Mitglieder nötig sind.",
		options: { monthly: "Monatlich", yearly: "Jährlich (20% sparen)" },
		labels: {
			perMemberMonth: "/Mitglied/Monat",
			save20: "20% sparen",
			unlimited: "Unbegrenzt",
			included: "Enthalten",
			notIncluded: "Nicht enthalten",
		},
		billingNote:
			"Bezahlte Pläne werden pro akzeptiertem Mitglied in jeder Organisation berechnet. Der Eigentümer zählt als Mitglied. Jahrespläne werden einmal jährlich abgerechnet.",
		storage: {
			poolLabel: "Dateispeicher der Organisation",
			fileLabel: "Maximale Dateigröße",
			note: "Der Speicher wird von allen Arbeitsbereichen einer Organisation gemeinsam genutzt, einschließlich privater Arbeitsbereiche. Die Speicherlimits sind pro Tarif festgelegt und unabhängig von der Mitgliederzahl.",
			pools: {
				free: "250 MB insgesamt",
				plus: "10 GB / Organisation",
				business: "100 GB / Organisation",
				enterprise: "1 TB; anpassbar",
			},
			files: {
				free: "25 MB",
				plus: "500 MB",
				business: "5 GB",
				enterprise: "5 GB",
			},
		},
		comparisonTable: {
			heading: "Pläne vergleichen",
			categories: {
				core: {
					title: "Kern",
					features: {
						workspaces: "Arbeitsbereiche",
						items: "Elemente",
						members: "Mitglieder (einschließlich Eigentümer)",
						cloudSync: "Cloud-Synchronisierung",
					},
				},
				extensions: {
					title: "Erweiterungen",
					features: {
						richTextEditor: "Rich-Text-Editor",
						whiteboard: "Whiteboard",
						kanbanBoard: "Kanban-Board",
						compiler: "Export",
						allOther: "Alle anderen",
					},
				},
				support: {
					title: "Support",
					features: {
						community: "Community-Support",
						priority: "Prioritäts-Support",
						dedicated: "Dedizierter Manager",
					},
				},
				securityCompliance: {
					title: "Sicherheit & Compliance",
					features: {
						customRoles: "Benutzerdefinierte Rollen & Berechtigungen",
						sla: "SLA-Tracking",
						sso: "SSO & SCIM",
						soc2: "SOC 2",
					},
				},
			},
		},
		details: [
			{
				title: "Organisationen einzeln erweitern",
				body: "Ab dem 26. Element oder 4. Mitglied ist Plus erforderlich, ab dem 11. Mitglied Business.",
			},
			{
				title: "Nur akzeptierte Mitglieder bezahlen",
				body: "Akzeptierte Mitglieder werden berechnet; ausstehende Einladungen reservieren nur Kapazität.",
			},
			{
				title: "Jeder Organisation einen Plan geben",
				body: "Jeder Organisation wird unabhängig berechnet. So kann einer Free bleiben, während ein anderer Plus oder Business nutzt.",
			},
			{
				title: "Arbeit bei Kündigung behalten",
				body: "Nach der Kündigung kehrt der Organisation zu Free zurück, ohne bestehende Inhalte zu löschen oder zu sperren. Solange ein Free-Limit überschritten ist, können Sie nichts hinzufügen.",
			},
			{
				title: "Abrechnung in Lunaris verwalten",
				body: "Eigentümer wechseln Pläne in Lunaris und verwalten Kündigungen oder Zahlungsmethoden im Polar-Portal.",
			},
			{
				title: "Organisationen erstellen und beitreten",
				body: "Erstellen Sie mehrere Organisationen oder treten Sie denen anderer bei. Jeder eigene Organisation behält seinen Plan.",
			},
		],
		ctaHeadline: "Erstellen Sie Ihren ersten Organisation.",
		ctaLabel: "Organisation erstellen",
		ctaSuffix: "kostenlos starten",
	},
	demoPage: {
		title: "Organisation-Beratung — Lunaris",
		description:
			"Erzählen Sie uns, wie Ihr Team arbeitet. Wir helfen Ihnen, den passenden Lunaris-Organisation zu gestalten.",
		headline: "Gestalten wir den passendie Organisation für Ihr Team.",
		subheadline:
			"Erzählen Sie uns, wie Ihr Team schreibt, plant, zusammenarbeitet und Informationen verwaltet. Wir gestalten mit Ihnen einen passenden Lunaris-Organisation.",
		form: {
			nameLabel: "Vollständiger Name",
			namePlaceholder: "Ada Lovelace",
			emailLabel: "Geschäftliche E-Mail",
			emailPlaceholder: "ada@unternehmen.com",
			companyLabel: "Unternehmen",
			companyPlaceholder: "Acme Inc.",
			companySizeLabel: "Unternehmensgröße",
			companySizePlaceholder: "Größe auswählen",
			companySizeOptions: {
				small: "1–10",
				medium: "11–50",
				large: "51–200",
				xl: "201–1.000",
				xxl: "1.000+",
			},
			messageLabel: "Wobei soll Ihr Organisation Sie unterstützen?",
			messagePlaceholder:
				"Beschreiben Sie Ihren Arbeitsablauf, die benötigten Werkzeuge und die Grenzen Ihrer aktuellen Lösung...",
			submit: "Beratung anfragen",
			submitting: "Anfrage wird gesendet...",
			successTitle: "Danke — wir haben Ihre Anfrage erhalten.",
			successBody: "Wir melden uns innerhalb eines Werktags.",
			errorRequired: "Erforderlich",
			errorEmail: "Gültige E-Mail-Adresse eingeben",
			errorTooLong: "Antwort kürzen",
			errorGeneric: "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
		},
	},
	mcpPage: {
		title: "Lunaris MCP — MCP-Client verbinden",
		description:
			"Verbinden Sie jeden MCP-Client, einschließlich Claude Code, Codex und Cursor, mit Lunaris in Ihrer gewählten Datenregion.",
		eyebrow: "Lunaris MCP",
		headline: "Bringen Sie Ihren Organisation ins Gespräch.",
		setup: {
			harnessLabel: "MCP-Client auswählen",
			regionLabel: "Datenregion auswählen",
			desktopName: "Desktop-App",
			desktopDescription:
				"Umfasst Ihre Arbeitsbereiche mit lokaler Sichtbarkeit.",
			desktopAuthNote:
				"Lassen Sie Lunaris Desktop geöffnet und genehmigen Sie die Kopplungsanfrage unter Einstellungen → Lokale Daten.",
			desktopDataNote:
				"Arbeitsbereiche mit lokaler Sichtbarkeit bleiben auf diesem Gerät.",
			genericName: "MCP-Client",
			comingSoon: "Demnächst",
			available: "Verfügbar",
			commandLabel: "Diesen Befehl ausführen",
			configLabel: "Diese Konfiguration hinzufügen",
			detailsLabel: "Serverdetails",
			copy: "Kopieren",
			copied: "Kopiert",
			authNote:
				"Ihr Agent fordert Sie bei der ersten Verbindung zur sicheren Anmeldung auf.",
			dataNote: "Organisationsdaten bleiben in der von Ihnen gewählten Region.",
		},
	},
	linearComparisonPage: {
		title: "Lunaris vs. Linear: Dokumente für mehr",
		description:
			"Vergleichen Sie Lunaris und Linear bei Dokumentorganisation, Arbeitsbereichsordnern, nativen Erweiterungen und eigenen Werkzeugen.",
		headline: "Geben Sie Dokumenten ein Zuhause, nicht nur eine Aufgabe.",
		subheadline:
			"Lunaris bündelt Dokumente, Ordner und erweiterungsbasierte Dateien in einem Arbeitsbereichsbaum. Gestalten Sie jede Organisation passend zur Arbeit, während Linear Dokumente nah an der Produktplanung hält.",
		primaryCta: "Kostenlos schreiben",
		table: {
			heading: "Das Wichtigste im Vergleich",
			lunaris: "Lunaris",
			linear: "Linear",
			categories: {
				organization: {
					title: "Dokumentenverwaltung",
					features: {
						structure: "Dokumente organisieren",
						navigation: "Arbeitsbereichsinhalte finden",
					},
				},
				content: {
					title: "Inhalte",
					features: {
						resources: "Mehr als Text",
						workspaceScope: "Inhalte eines Arbeitsbereichs",
					},
				},
				extensions: {
					title: "Erweiterungen",
					features: {
						customization: "Organisation erweitern",
						customTools: "Eigene Werkzeuge entwickeln",
					},
				},
			},
			values: {
				nestedFolders:
					"Dokumente und Dateien in Arbeitsbereichsordnern verschachteln",
				attachedDocuments:
					"Dokumente an Arbeitsbereiche, Initiativen, Teams, Aufgaben oder Zyklen anhängen",
				workspaceTree:
					"Arbeitsbereichsinhalte in einem Baum durchsuchen und sortieren",
				workContext: "Dokumente über ihren Arbeitskontext durchsuchen",
				mixedContent:
					"Rich Text, Whiteboards, Boards und Dateien zusammen verwalten",
				richTextDocuments:
					"Gemeinsam bearbeitete Rich-Text-Dokumente nutzen den Linear-Editor",
				workspaceContent:
					"Arbeitsbereiche können Ordner und erweiterungsbasierte Dateien enthalten",
				productPlanning:
					"Arbeitsbereiche verbinden Aufgaben mit optionalen Dokumenten",
				nativeExtensions:
					"Community-Erweiterungen ergänzen Werkzeuge in der Organisation",
				integrations: "Integrationen verbinden Linear mit externen Apps",
				privateExtensions:
					"Private Erweiterungen für den Ablauf Ihres Teams entwickeln",
				apiApps: "Externe Apps mit Linears API und TypeScript-SDK entwickeln",
			},
		},
		sources: {
			intro:
				"Die Angaben zu Linear basieren auf der öffentlichen Dokumentation, geprüft im August 2026. Funktionen können sich ändern.",
			documents: "Dokumente",
			workspaces: "Arbeitsbereiche",
			integrations: "Integrationsverzeichnis",
			api: "Entwickler-SDK",
		},
		cta: {
			headline:
				"Machen Sie aus jedem Arbeitsbereich mehr als eine Aufgabenliste.",
			subheadline:
				"Schreiben Sie kostenlos. Ordnen Sie Arbeitsbereichsinhalte in Ordnern und ergänzen Sie die Dateitypen und Werkzeuge, die Ihre Arbeit braucht.",
		},
	},
	obsidianComparisonPage: {
		title: "Lunaris vs. Obsidian: Offline-First-Zusammenarbeit",
		description:
			"Vergleiche Lunaris und Obsidian bei Live-Zusammenarbeit, Teamberechtigungen, Offline-Bearbeitung und Erweiterungen.",
		eyebrow: "Lunaris vs. Obsidian",
		headline: "Offline-first, ohne allein zu arbeiten.",
		subheadline:
			"Lunaris bringt Zusammenarbeit in Echtzeit in einen Offline-first-Organisation. Bearbeite gemeinsame Dokumente zusammen, lade Teammitglieder mit passenden Rollen ein und schreibe weiter, wenn die Verbindung abbricht.",
		primaryCta: "Kostenlos losschreiben",
		secondaryCta: "Preise ansehen",
		fit: {
			lunaris: {
				label: "Lunaris passt zu dir, wenn du",
				items: [
					"Gemeinsame Dokumente zusammen statt abwechselnd bearbeiten willst",
					"Teammitglieder einladen und Zugriffe in der Organisation verwalten willst",
					"Offline weiterarbeiten und Änderungen sicher zusammenführen willst",
				],
			},
			obsidian: {
				label: "Wo Obsidian im Weg stehen kann",
				items: [
					"Geteilte Vaults unterstützen keine Live-Bearbeitung derselben Datei",
					"Cursor und Änderungen anderer erscheinen erst nach der Synchronisierung",
					"Alle Beteiligten benötigen Sync und erhalten dieselben Berechtigungen",
				],
			},
		},
		table: {
			heading: "Das Wesentliche im Vergleich",
			lunaris: "Lunaris",
			obsidian: "Obsidian",
			categories: {
				collaboration: {
					title: "Zusammenarbeit",
					features: {
						sameDocument: "Gemeinsam bearbeiten",
						concurrentChanges: "Gleichzeitige Bearbeitung",
					},
				},
				teamwork: {
					title: "Teamarbeit",
					features: {
						teamAccess: "Teammitglieder einladen",
						permissions: "Berechtigungen",
					},
				},
				foundation: {
					title: "Offline und Erweiterungen",
					features: {
						offlineModel: "Offline arbeiten",
						organizationShape: "Organisation erweitern",
					},
				},
			},
			values: {
				sharedEditing: "Gemeinsame Dokumente in Echtzeit bearbeiten",
				noLiveEditing: "Keine gemeinsame Live-Bearbeitung derselben Datei",
				crdtMerge: "Alle sehen Änderungen sofort im gemeinsamen Dokument",
				syncMerge:
					"Änderungen anderer erscheinen erst nach der Synchronisierung",
				organizationInvite: "Teammitglieder direkt zur Organisation einladen",
				syncSubscription: "Alle Beteiligten benötigen Obsidian Sync",
				organizationRoles: "Organisation-Rollen und Berechtigungen zuweisen",
				samePermissions:
					"Alle Beteiligten erhalten dieselben Vault-Berechtigungen",
				offlineOrganization:
					"Offline weiterschreiben; bei Verbindung synchronisieren",
				localVault: "Lokaler Markdown-Vault; Sync optional",
				extensionOrganization: "Fokussierter Editor mit nativen Erweiterungen",
				markdownPlugins: "Markdown-Vault mit Community-Erweiterungen",
			},
		},
		differences: {
			eyebrow: "Warum Lunaris",
			headline: "Zusammenarbeiten, ohne Offline-Arbeit aufzugeben.",
			items: [
				{
					headline: "Gemeinsam statt abwechselnd schreiben",
					body: "Arbeitet im selben Dokument, ohne jede gleichzeitige Bearbeitung als später zusammenzuführendes Sync-Ereignis zu behandeln.",
				},
				{
					headline: "Das Team in die Organisation holen",
					body: "Lade Mitglieder ein und gib ihnen den nötigen Zugriff. Zusammenarbeit gehört zur Organisation, statt für jede Person einen eigenen Sync einzurichten.",
				},
				{
					headline: "Offline produktiv bleiben",
					body: "Bearbeite ohne Verbindung weiter. Danach fließen die Änderungen ins gemeinsame Dokument, damit das Team mit einer einzigen Quelle weiterarbeitet.",
				},
			],
		},
		sources: {
			intro:
				"Obsidian-Angaben basieren auf der öffentlichen Dokumentation, geprüft im August 2026. Funktionen können sich ändern.",
			collaboration: "Zusammenarbeit in geteilten Vaults",
			teams: "Sync für Teams",
			plans: "Sync-Tarife und Limits",
		},
		cta: {
			headline: "Bring deine Notizen in einen gemeinsamen Organisation.",
			subheadline:
				"Schreib kostenlos los. Arbeite offline weiter und lade dein Team ein, wenn Zusammenarbeit gefragt ist.",
		},
	},
	notionComparisonPage: {
		title: "Lunaris vs. Notion: Offline-First-Organisationen",
		description:
			"Vergleichen Sie Lunaris und Notion bei Offline-Zugriff, lokalen Arbeitsbereichen, Datenresidenz, Erweiterungen und Agent-Zugriff.",
		eyebrow: "Lunaris vs. Notion",
		headline: "Arbeiten Sie offline. Ergänzen Sie nur, was Sie brauchen.",
		subheadline:
			"Lunaris beginnt mit einem fokussierten Offline-First-Editor. Behalten Sie sensible Arbeitsbereiche auf Ihrem Gerät, wählen Sie eine Synchronisierungsregion und ergänzen Sie Community- oder private Erweiterungen, wenn Ihre Arbeit mehr verlangt.",
		primaryCta: "Kostenlos losschreiben",
		secondaryCta: "Preise ansehen",
		fit: {
			lunaris: {
				label: "Lunaris ist für Sie gemacht, wenn Sie",
				items: [
					"Jede Organisation mit nativen Erweiterungen gestalten möchten",
					"Whiteboards, Boards und spezielle Abläufe nur bei Bedarf hinzufügen möchten",
					"Arbeitsbereiche lokal behalten oder über eine gewählte Region synchronisieren möchten",
				],
			},
			notion: {
				label: "Wo Notion im Weg stehen kann",
				items: [
					"Ein breiter All-in-one-Funktionsumfang bringt von Anfang an mehr Menüs und Entscheidungen",
					"Offline-Arbeit hängt von heruntergeladenen Seiten in Desktop- oder Mobil-Apps ab",
					"Arbeitsbereiche liegen in einem Cloud-Organisation statt in einem rein lokalen Organisation",
				],
			},
		},
		table: {
			heading: "Das Wesentliche im Vergleich",
			lunaris: "Lunaris",
			notion: "Notion",
			categories: {
				access: {
					title: "Offline-Zugriff",
					features: {
						offlineModel: "Offline arbeiten",
						localOnly: "Arbeitsbereiche auf dem Gerät behalten",
					},
				},
				control: {
					title: "Kontrolle",
					features: {
						dataLocation: "Datenspeicherort wählen",
						organizationShape: "Werkzeuge ergänzen",
					},
				},
				connections: {
					title: "Erweiterungen und Agent-Zugriff",
					features: {
						customization: "Organisation erweitern",
						agentAccess: "Externe Agents verbinden",
					},
				},
			},
			values: {
				offlineFirst: "Arbeitsbereichsübergreifend ohne Verbindung arbeiten",
				downloadedPages: "Offline auf heruntergeladenen App-Seiten arbeiten",
				localWorkspaces: "Sensible Arbeitsbereiche auf diesem Gerät behalten",
				cloudOrganization: "Cloud-Organisation mit Exportoptionen",
				deviceOrRegion:
					"Arbeitsbereiche lokal behalten oder eine Sync-Region wählen",
				enterpriseResidency:
					"Cloud; regionale Datenresidenz für berechtigte Enterprise-Organisationen",
				extensionLed: "Fokussierter Kern; Erweiterungen nach Bedarf",
				allInOne: "Breiter Funktionsumfang von Anfang an",
				nativeExtensions:
					"Community- und private Erweiterungen laufen in der Organisation",
				integrations: "Externe Werkzeuge über APIs und Integrationen verbinden",
				mcp: "Genehmigter MCP-Zugriff, auch auf lokale Arbeitsbereiche",
				api: "API-Zugriff folgt den Seitenberechtigungen",
			},
		},
		differences: {
			eyebrow: "Warum Lunaris",
			headline: "Ein fokussierter Kern. Erweiterungen nach Ihren Regeln.",
			items: [
				{
					headline: "Die Organisation bauen, keine Umwege",
					body: "Installieren Sie native Erweiterungen für Whiteboards, Boards und spezielle Abläufe. Jeder Organisation erhält genau die benötigten Werkzeuge.",
				},
				{
					headline: "Offline ohne Checkliste",
					body: "Ihr Organisation bleibt nützlich, wenn die Verbindung ausfällt. Arbeiten Sie weiter und synchronisieren Sie später, wenn Cloud-Synchronisierung aktiviert ist.",
				},
				{
					headline: "Eine echte lokale Option",
					body: "Wählen Sie lokale Sichtbarkeit für Arbeitsbereiche, die auf einem Gerät bleiben sollen, oder eine Synchronisierungsregion für Zusammenarbeit.",
				},
			],
		},
		sources: {
			intro:
				"Die Angaben zu Notion basieren auf der öffentlichen Dokumentation, geprüft im August 2026. Produktfunktionen können sich ändern.",
			offline: "Offline-Nutzung",
			backup: "Sicherungen und Exporte",
			residency: "Datenresidenz",
			api: "API-Verbindungen",
		},
		cta: {
			headline: "Bauen Sie die Organisation, den Ihre Arbeit wirklich braucht.",
			subheadline:
				"Schreiben Sie kostenlos los. Behalten Sie Arbeitsbereiche lokal, synchronisieren Sie über Ihre gewählte Region und ergänzen Sie Erweiterungen nach Bedarf.",
		},
	},
	cta: {
		headline:
			"Gestalten Sie die Organisation, den Ihre Arbeit wirklich braucht.",
		subheadline:
			"Schreiben Sie kostenlos. Behalten Sie Arbeitsbereiche lokal oder synchronisieren Sie im Team und ergänzen Sie Erweiterungen nach Bedarf.",
		label: "Organisation erstellen",
		suffix: "kostenlos",
	},
	footer: {
		compare: "Vergleichen",
		linearComparison: "Lunaris vs. Linear",
		obsidianComparison: "Lunaris vs. Obsidian",
		notionComparison: "Lunaris vs. Notion",
		tool: "Werkzeuge",
		wordCounter: "Wortzähler",
		resources: "Ressourcen",
		trustCenter: "Trust Center",
		mcp: "MCP für Agents",
		contact: "Kontakt",
		legal: "Rechtliches",
		privacyPolicy: "Datenschutzrichtlinie",
		cookiePolicy: "Cookie-Richtlinie",
		cookieSettings: "Cookie-Einstellungen",
		termsOfService: "Nutzungsbedingungen",
		subprocessors: "Unterauftragsverarbeiter",
		fineprint: "© 2026 Lunaris",
	},
	notFound: {
		headline: "Seite nicht gefunden",
		subheadline:
			"Entschuldigung, aber die gesuchte Seite konnte nicht gefunden werden.",
		cta: "Zurück zur Startseite",
	},
} satisfies Dictionary;

export default de;
