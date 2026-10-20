import { openSourceCopy } from "@/data/open-source";
import type { Dictionary } from "./types";

const es = {
	meta: {
		title: `Lunaris — ${openSourceCopy.es.headline}`,
		description: openSourceCopy.es.description,
	},
	accessibility: {
		demoVideoDescription:
			"Recorrido sin audio: la barra lateral de un espacio de trabajo muestra Resumen, Hoja de ruta, Pizarra y carpetas. El resumen contiene texto con formato. La hoja de ruta agrupa tarjetas de tareas por estado; una tarjeta se mueve entre columnas. La pizarra muestra formas conectadas. Al final, la hoja de ruta y el resumen aparecen uno junto al otro y se desplaza el resumen.",
		switchLanguage: "Cambiar idioma",
		openMenu: "Abrir menú",
		closeMenu: "Cerrar menú",
		switchTheme: "Cambiar tema",
		lightTheme: "Claro",
		darkTheme: "Oscuro",
		systemTheme: "Sistema",
		demoVideo: "Demostración en vídeo del espacio de trabajo de Lunaris",

		skipToContent: "Saltar al contenido principal",
		primaryNavigation: "Navegación principal",
		footerNavigation: "Navegación del pie de página",
	},
	nav: {
		pricing: "Precios",
		docs: "Documentación",
		mcp: "MCP",
		contact: "Contacto",
	},
	hero: {
		mcpAnnouncement: {
			badge: "Nuevo",
			label: "Conecta tus herramientas de IA con MCP",
		},
		headline: openSourceCopy.es.headline,
		subheadline: {
			beforeHighlight: "Empieza con lo",
			highlight: "esencial.",
			betweenHighlights: "Añade",
			secondHighlight: "extensiones a medida que crece tu trabajo.",
			afterHighlight: " Trabaja sin conexión o colabora en tiempo real.",
		},
	},
	problems: {
		headline: "¿Por qué adaptarte tú a tu organización?",
		subheadline:
			"Las herramientas todo en uno cargan cada espacio de trabajo con el mismo ruido, los mismos límites y el mismo flujo.",
		items: {
			featureBloat: {
				headline: "Exceso de funciones",
				subheadline:
					"Cada función incorporada añade otro menú, aunque tu espacio de trabajo nunca la necesite.",
			},
			vendorLockIn: {
				headline: "Dependencia del proveedor",
				subheadline:
					"El acceso exclusivo en la nube y los sistemas propietarios deciden cuándo y dónde está disponible tu trabajo.",
			},
			rigidWorkflows: {
				headline: "Flujos de trabajo rígidos",
				subheadline:
					"Una novela, una base de conocimiento y una herramienta interna no deberían encajar en el mismo molde.",
			},
		},
	},
	bentoFeatures: {
		headline: "Empieza por escribir. Da forma a todo lo demás.",
		subheadline:
			"Mantén el núcleo enfocado. Añade colaboración, IA y extensiones bajo tus condiciones.",
		items: {
			dataOwnership: {
				headline: "Tus datos son tuyos",
				subheadline:
					"Mantén los espacios de trabajo sensibles en tu dispositivo o elige dónde viven los datos sincronizados.",
			},
			offlineFirst: {
				headline: "Sin conexión por diseño",
				subheadline:
					"Sigue escribiendo sin conexión. Sincroniza cuando vuelvas a estar en línea, si así lo decides.",
			},
			extensions: {
				headline: "Extensiones",
				subheadline:
					"Instala herramientas de la comunidad o crea extensiones privadas para el flujo exacto de tu equipo.",
			},
			collaboration: {
				headline: "Colaboración",
				subheadline:
					"Edita en equipo en tiempo real, comparte espacios de trabajo y gestiona el acceso de tu equipo.",
			},
			aiReady: {
				headline: "Preparado para la IA",
				subheadline:
					"Conecta herramientas de IA mediante MCP y decide cuándo entran en tu flujo de trabajo.",
			},
			fastLightweight: {
				headline: "Rápido y ligero",
				subheadline:
					"Se abre rápido y responde al instante para no interponerse en tu trabajo.",
			},
			crossPlatform: {
				headline: "Multiplataforma",
				subheadline:
					"Pasa de la web al escritorio sin tener que aprender otro organización.",
			},
		},
	},
	faqs: {
		headline: "¿Tienes preguntas? Empieza aquí.",
		items: {
			openPlatform: {
				question: "¿Qué hace que Lunaris sea una plataforma abierta?",
				answer:
					"Lunaris parte de un núcleo enfocado en la escritura. Las extensiones de la comunidad añaden herramientas especializadas, mientras los equipos pueden crear extensiones privadas para flujos internos, sin convertir cada espacio en una suite todo en uno.",
			},
			free: {
				question: "¿Puedo usarlo gratis?",
				answer:
					"Sí. Free incluye sincronización en la nube, espacios de trabajo ilimitados, hasta 25 elementos, hasta 3 miembros y 250 MB de almacenamiento por organización, con un límite de 25 MB por archivo. No necesitas datos de pago. Consulta los {pricingLink}.",
			},
			offline: {
				question: "¿Funciona sin conexión?",
				answer:
					"Sí, puedes escribir sin conexión en todos los planes. Tu trabajo se sincroniza con la nube cuando te conectas, para acceder desde cualquier dispositivo y colaborar. También puedes desactivar la sincronización en la nube y usar la aplicación completamente sin conexión si lo prefieres.",
			},
			security: {
				question: "¿Qué ofrecen en Seguridad y Cumplimiento?",
				answer:
					"Tu escritura es tuya. Tú eliges dónde se almacena, en EE.UU. o la UE, y todo está cifrado en tránsito y en reposo. Los equipos Enterprise obtienen controles adicionales como roles personalizados, SSO & SCIM y garantías de SLA. Visita nuestro {trustCenterLink} para obtener más información.",
			},
			fileStorage: {
				question: "¿Qué cuenta para el límite de almacenamiento?",
				answer:
					"Los archivos subidos y adjuntos comparten el almacenamiento entre todos los espacios de trabajo de la organización. Los archivos en la papelera cuentan hasta su eliminación permanente. Los archivos solo locales no usan almacenamiento en la nube. Usamos unidades decimales: 1 MB = 1.000.000 bytes; 1 GB = 1.000 MB.",
			},
			storageFull: {
				question: "¿Qué pasa si mi organización se queda sin almacenamiento?",
				answer:
					"Los archivos existentes siguen disponibles para leer, descargar y eliminar, incluso al bajar de plan o quitar miembros. Las subidas que aumentan el uso se pausan hasta que liberes espacio o mejores el plan. Puedes sustituir archivos por versiones más pequeñas dentro del límite por archivo de tu plan. Las subidas rechazadas permanecen en tu dispositivo.",
			},
			aiTraining: {
				question: "¿Se usa mi escritura para entrenar modelos de IA?",
				answer: "No.",
			},
		},
	},
	pricing: {
		headline: "Precios sencillos para cada organización.",
		plans: {
			free: {
				name: "Free",
				subheadline: "Para trabajo personal y pequeños espacios compartidos.",
				features: [
					"Hasta 25 elementos",
					"Hasta 3 miembros",
					"Espacios de trabajo ilimitados",
					"Sincronización en la nube",
					"Extensiones básicas",
					"250 MB de almacenamiento por organización",
					"25 MB por archivo",
				],
				ctaLabel: "Empezar gratis",
			},
			plus: {
				name: "Plus",
				subheadline: "Para espacios activos con más contenido o miembros.",
				features: [
					"Todo en Free",
					"Elementos ilimitados",
					"Hasta 10 miembros",
					"Espacios de trabajo ilimitados",
					"10 GB por organización",
					"500 MB por archivo",
				],
				ctaLabel: "Elegir Plus",
			},
			business: {
				name: "Business",
				subheadline:
					"Para equipos en crecimiento que necesitan todas las extensiones y miembros ilimitados.",
				features: [
					"Todo en Plus",
					"Miembros ilimitados",
					"Todas las extensiones",
					"Soporte prioritario",
					"100 GB por organización",
					"5 GB por archivo",
				],
				ctaLabel: "Elegir Business",
			},
			enterprise: {
				name: "Enterprise",
				subheadline:
					"Para organizaciones que necesitan seguridad, acceso y soporte a medida.",
				features: [
					"Todo en Business",
					"Roles y permisos personalizados",
					"SSO & SCIM",
					"SOC 2",
					"Seguimiento de SLA",
					"1 TB; límites personalizados disponibles",
					"5 GB por archivo",
				],
				ctaLabel: "Hablar con nosotros",
			},
		},
	},
	pricingPage: {
		title: "Precios de Lunaris — Empieza gratis y mejora al crecer",
		description:
			"Empieza gratis y sin datos de pago. Cada espacio de Lunaris tiene su propio plan, así que solo mejoras los que necesitan más elementos, miembros o extensiones.",
		headline: "Empieza gratis. Mejora cada espacio cuando crezca.",
		subheadline:
			"Crea un espacio sincronizado sin datos de pago. Cada espacio tiene su propio plan, así que solo mejoras los que necesitan más elementos o miembros.",
		options: { monthly: "Mensual", yearly: "Anual (Ahorra 20%)" },
		labels: {
			perMemberMonth: "/miembro/mes",
			save20: "Ahorra 20%",
			unlimited: "Ilimitados",
			included: "Incluido",
			notIncluded: "No incluido",
		},
		billingNote:
			"Los planes de pago se calculan por miembro aceptado en cada espacio. El propietario cuenta como miembro. Los planes anuales se cobran una vez al año.",
		storage: {
			poolLabel: "Almacenamiento de archivos de la organización",
			fileLabel: "Tamaño máximo por archivo",
			note: "El almacenamiento se comparte entre todos los espacios de trabajo de la organización, incluidos los privados. Los límites son fijos por plan y no cambian con el número de miembros.",
			pools: {
				free: "250 MB en total",
				plus: "10 GB / organización",
				business: "100 GB / organización",
				enterprise: "1 TB; personalizable",
			},
			files: {
				free: "25 MB",
				plus: "500 MB",
				business: "5 GB",
				enterprise: "5 GB",
			},
		},
		comparisonTable: {
			heading: "Comparar planes",
			categories: {
				core: {
					title: "Principal",
					features: {
						workspaces: "Espacios de trabajo",
						items: "Elementos",
						members: "Miembros (incluido el propietario)",
						cloudSync: "Sincronización en la Nube",
					},
				},
				extensions: {
					title: "Extensiones",
					features: {
						richTextEditor: "Editor de Texto Enriquecido",
						whiteboard: "Pizarra",
						kanbanBoard: "Tablero Kanban",
						compiler: "Exportar",
						allOther: "Todos los demás",
					},
				},
				support: {
					title: "Soporte",
					features: {
						community: "Soporte comunitario",
						priority: "Soporte prioritario",
						dedicated: "Gerente dedicado",
					},
				},
				securityCompliance: {
					title: "Seguridad y Cumplimiento",
					features: {
						customRoles: "Roles y permisos personalizados",
						sla: "Seguimiento de SLA",
						sso: "SSO & SCIM",
						soc2: "SOC 2",
					},
				},
			},
		},
		details: [
			{
				title: "Mejora un espacio cada vez",
				body: "Pasa a Plus con el elemento 26 o el miembro 4, y a Business con el miembro 11.",
			},
			{
				title: "Paga solo por miembros aceptados",
				body: "Los miembros aceptados se facturan; las invitaciones pendientes solo reservan capacidad.",
			},
			{
				title: "Da a cada espacio su propio plan",
				body: "Cada espacio se cobra por separado, así uno puede seguir en Free mientras otro usa Plus o Business.",
			},
			{
				title: "Conserva tu trabajo si cancelas",
				body: "Al cancelar, el espacio vuelve a Free sin eliminar ni bloquear el contenido existente. No puedes añadir más mientras supere un límite de Free.",
			},
			{
				title: "Gestiona la facturación en Lunaris",
				body: "Los propietarios cambian de plan en Lunaris y gestionan cancelaciones o métodos de pago en el portal de Polar.",
			},
			{
				title: "Crea espacios y únete a otros",
				body: "Crea varios espacios o únete a los de otras personas. Cada espacio que posees conserva su propio plan.",
			},
		],
		ctaHeadline: "Crea tu primer organización.",
		ctaLabel: "Crear un espacio",
		ctaSuffix: "empezar gratis",
	},
	demoPage: {
		title: "Consultoría de organizaciones — Lunaris",
		description:
			"Cuéntanos cómo trabaja tu equipo y te ayudaremos a crear el espacio de Lunaris adecuado.",
		headline: "Construyamos la organización adecuado para tu equipo.",
		subheadline:
			"Cuéntanos cómo escribe, planifica, colabora y gestiona la información tu equipo. Te ayudaremos a crear un espacio de Lunaris a su medida.",
		form: {
			nameLabel: "Nombre completo",
			namePlaceholder: "Ada Lovelace",
			emailLabel: "Correo corporativo",
			emailPlaceholder: "ada@empresa.com",
			companyLabel: "Empresa",
			companyPlaceholder: "Acme Inc.",
			companySizeLabel: "Tamaño de la empresa",
			companySizePlaceholder: "Seleccionar tamaño",
			companySizeOptions: {
				small: "1–10",
				medium: "11–50",
				large: "51–200",
				xl: "201–1.000",
				xxl: "1.000+",
			},
			messageLabel: "¿Qué debería ayudarte a hacer tu organización?",
			messagePlaceholder:
				"Cuéntanos sobre tu flujo de trabajo, las herramientas que necesitas y dónde falla tu configuración actual...",
			submit: "Solicitar una consulta",
			submitting: "Enviando solicitud...",
			successTitle: "Gracias, hemos recibido tu solicitud.",
			successBody: "Te contactaremos en un día laborable.",
			errorRequired: "Obligatorio",
			errorEmail: "Introduce un correo válido",
			errorTooLong: "Acorta esta respuesta",
			errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
		},
	},
	mcpPage: {
		title: "Lunaris MCP — Conecta tu cliente MCP",
		description:
			"Conecta cualquier cliente MCP, incluidos Claude Code, Codex y Cursor, a Lunaris en la región de datos que elijas.",
		eyebrow: "Lunaris MCP",
		headline: "Lleva tu organización a la conversación.",
		setup: {
			harnessLabel: "Elige tu cliente MCP",
			regionLabel: "Elige tu región de datos",
			desktopName: "Aplicación de escritorio",
			desktopDescription:
				"Incluye tus espacios de trabajo con visibilidad local.",
			desktopAuthNote:
				"Mantén Lunaris Desktop abierto y aprueba la solicitud de vinculación en Ajustes → Datos locales.",
			desktopDataNote:
				"Los espacios de trabajo con visibilidad local permanecen en este dispositivo.",
			genericName: "Cliente MCP",
			comingSoon: "Próximamente",
			available: "Disponible",
			commandLabel: "Ejecuta este comando",
			configLabel: "Añade esta configuración",
			detailsLabel: "Datos del servidor",
			copy: "Copiar",
			copied: "Copiado",
			authNote:
				"Tu agente te pedirá iniciar sesión de forma segura la primera vez que se conecte.",
			dataNote: "Los datos del espacio permanecen en la región que elijas.",
		},
	},
	linearComparisonPage: {
		title: "Lunaris vs. Linear: Documentos para mucho más",
		description:
			"Compara Lunaris y Linear en organización de documentos, carpetas de espacio de trabajo, extensiones nativas y herramientas personalizadas.",
		headline: "Dales un hogar a tus documentos, no solo una tarea.",
		subheadline:
			"Lunaris reúne documentos, carpetas y archivos creados por extensiones en un único árbol de espacio de trabajo. Adapta cada espacio al trabajo mientras Linear mantiene los documentos ligados a la planificación de producto.",
		primaryCta: "Empieza a escribir gratis",
		table: {
			heading: "Compara lo esencial",
			lunaris: "Lunaris",
			linear: "Linear",
			categories: {
				organization: {
					title: "Gestión de documentos",
					features: {
						structure: "Organización de documentos",
						navigation: "Búsqueda de contenido del espacio de trabajo",
					},
				},
				content: {
					title: "Contenido",
					features: {
						resources: "Más allá del texto",
						workspaceScope: "Qué contiene un espacio de trabajo",
					},
				},
				extensions: {
					title: "Extensiones",
					features: {
						customization: "Ampliación del espacio",
						customTools: "Creación de herramientas propias",
					},
				},
			},
			values: {
				nestedFolders:
					"Anida documentos y archivos en carpetas de espacio de trabajo",
				attachedDocuments:
					"Adjunta documentos a espacios de trabajo, iniciativas, equipos, tareas o ciclos",
				workspaceTree: "Explora y reordena el contenido en un único árbol",
				workContext: "Explora documentos desde su contexto de trabajo",
				mixedContent: "Reúne texto enriquecido, pizarras, tableros y archivos",
				richTextDocuments:
					"Los documentos colaborativos usan el editor de Linear",
				workspaceContent:
					"Los espacios de trabajo admiten carpetas y archivos creados por extensiones",
				productPlanning:
					"Los espacios de trabajo combinan tareas y documentos opcionales",
				nativeExtensions:
					"Las extensiones de la comunidad añaden herramientas al espacio",
				integrations:
					"Las integraciones conectan Linear con aplicaciones externas",
				privateExtensions:
					"Crea extensiones privadas para el flujo de tu equipo",
				apiApps:
					"Crea aplicaciones externas con la API y el SDK de TypeScript de Linear",
			},
		},
		sources: {
			intro:
				"Los datos de Linear se basan en su documentación pública, revisada en agosto de 2026. Las funciones pueden cambiar.",
			documents: "Documentos",
			workspaces: "Espacios de trabajo",
			integrations: "Directorio de integraciones",
			api: "SDK para desarrolladores",
		},
		cta: {
			headline:
				"Haz que cada espacio de trabajo sea más que una lista de tareas.",
			subheadline:
				"Empieza a escribir gratis. Organiza el contenido en carpetas y añade los tipos de archivo y herramientas que necesitas.",
		},
	},
	obsidianComparisonPage: {
		title: "Lunaris vs. Obsidian: colaboración offline-first",
		description:
			"Compara Lunaris y Obsidian en colaboración en vivo, permisos de equipo, edición sin conexión y extensiones.",
		eyebrow: "Lunaris vs. Obsidian",
		headline: "Offline-first, sin trabajar a solas.",
		subheadline:
			"Lunaris lleva la colaboración en tiempo real a un espacio offline-first. Edita documentos compartidos con tu equipo, invita personas con roles y sigue escribiendo cuando falla la conexión.",
		primaryCta: "Empieza a escribir gratis",
		secondaryCta: "Ver precios",
		fit: {
			lunaris: {
				label: "Lunaris está hecho para ti si quieres",
				items: [
					"Editar documentos compartidos juntos sin turnarse",
					"Invitar al equipo y gestionar el acceso dentro del espacio",
					"Seguir trabajando sin conexión y combinar los cambios de forma segura",
				],
			},
			obsidian: {
				label: "Dónde Obsidian puede estorbar",
				items: [
					"Las bóvedas compartidas no permiten edición en vivo en el mismo archivo",
					"No ves el cursor ni los cambios de otra persona hasta sincronizar",
					"Cada colaborador necesita Sync y recibe los mismos permisos",
				],
			},
		},
		table: {
			heading: "Compara lo esencial",
			lunaris: "Lunaris",
			obsidian: "Obsidian",
			categories: {
				collaboration: {
					title: "Colaboración",
					features: {
						sameDocument: "Edición en equipo",
						concurrentChanges: "Ediciones simultáneas",
					},
				},
				teamwork: {
					title: "Trabajo en equipo",
					features: {
						teamAccess: "Invitar al equipo",
						permissions: "Permisos",
					},
				},
				foundation: {
					title: "Trabajo offline y extensiones",
					features: {
						offlineModel: "Trabajo sin conexión",
						organizationShape: "Ampliar el espacio",
					},
				},
			},
			values: {
				sharedEditing: "Edita documentos compartidos en tiempo real",
				noLiveEditing: "Sin edición colaborativa en vivo en el mismo archivo",
				crdtMerge:
					"Todos ven los cambios al instante en un documento compartido",
				syncMerge:
					"Los cambios de otras personas aparecen solo después de sincronizar",
				organizationInvite: "Invita al equipo directamente al espacio",
				syncSubscription: "Cada colaborador necesita Obsidian Sync",
				organizationRoles: "Asigna roles y permisos del espacio",
				samePermissions: "Todos reciben los mismos permisos de la bóveda",
				offlineOrganization:
					"Sigue editando sin conexión; sincroniza al volver",
				localVault: "Bóveda Markdown local; sincronización opcional",
				extensionOrganization: "Editor enfocado con extensiones nativas",
				markdownPlugins: "Bóveda Markdown con extensiones de la comunidad",
			},
		},
		differences: {
			eyebrow: "Por qué Lunaris",
			headline: "Colaboración sin renunciar al trabajo offline.",
			items: [
				{
					headline: "Escriban juntos, no por turnos",
					body: "Trabajen en el mismo documento sin tratar cada edición simultánea como un evento de sincronización que debe combinarse después.",
				},
				{
					headline: "Lleva al equipo al espacio",
					body: "Invita miembros y dales el acceso que necesitan. La colaboración forma parte del espacio, no de una configuración de sincronización separada para cada persona.",
				},
				{
					headline: "Sigue produciendo sin conexión",
					body: "Continúa editando sin conexión. Al volver, los cambios convergen en el documento compartido para que el equipo siga desde una única fuente.",
				},
			],
		},
		sources: {
			intro:
				"Los detalles de Obsidian se basan en su documentación pública, revisada en agosto de 2026. Las capacidades pueden cambiar.",
			collaboration: "Colaboración en bóvedas compartidas",
			teams: "Sync para equipos",
			plans: "Planes y límites de Sync",
		},
		cta: {
			headline: "Lleva tus notas a un espacio compartido.",
			subheadline:
				"Empieza a escribir gratis. Sigue trabajando sin conexión e invita a tu equipo cuando toque colaborar.",
		},
	},
	notionComparisonPage: {
		title: "Lunaris vs. Notion: espacios offline-first",
		description:
			"Compara Lunaris y Notion en acceso sin conexión, espacios de trabajo locales, residencia de datos, extensiones y acceso de agentes.",
		eyebrow: "Lunaris vs. Notion",
		headline: "Trabaja sin conexión. Añade solo lo que necesitas.",
		subheadline:
			"Lunaris empieza con un editor enfocado y offline-first. Mantén los espacios de trabajo sensibles en tu dispositivo, elige una región de sincronización y añade extensiones comunitarias o privadas cuando necesites más.",
		primaryCta: "Empieza a escribir gratis",
		secondaryCta: "Ver precios",
		fit: {
			lunaris: {
				label: "Lunaris está hecho para ti si quieres",
				items: [
					"Dar forma a cada espacio con extensiones nativas",
					"Añadir pizarras, tableros y flujos especializados solo cuando hagan falta",
					"Mantener espacios de trabajo locales o sincronizarlos mediante una región elegida",
				],
			},
			notion: {
				label: "Dónde Notion puede estorbar",
				items: [
					"Un conjunto todo en uno añade más menús y decisiones desde el principio",
					"El trabajo sin conexión depende de páginas descargadas en las aplicaciones de escritorio o móvil",
					"Los espacios de trabajo viven en un espacio en la nube, no en uno exclusivamente local",
				],
			},
		},
		table: {
			heading: "Compara lo esencial",
			lunaris: "Lunaris",
			notion: "Notion",
			categories: {
				access: {
					title: "Acceso sin conexión",
					features: {
						offlineModel: "Trabajo sin conexión",
						localOnly: "Mantener espacios de trabajo en el dispositivo",
					},
				},
				control: {
					title: "Control",
					features: {
						dataLocation: "Elegir dónde viven los datos",
						organizationShape: "Añadir herramientas al espacio",
					},
				},
				connections: {
					title: "Extensiones y acceso de agentes",
					features: {
						customization: "Ampliar el espacio",
						agentAccess: "Conectar agentes externos",
					},
				},
			},
			values: {
				offlineFirst: "Trabaja en tus espacios de trabajo sin conexión",
				downloadedPages:
					"Trabaja sin conexión en páginas descargadas en las apps",
				localWorkspaces:
					"Mantén espacios de trabajo sensibles en este dispositivo",
				cloudOrganization: "Espacio en la nube con opciones de exportación",
				deviceOrRegion:
					"Mantén espacios de trabajo locales o elige una región de sincronización",
				enterpriseResidency:
					"Nube; residencia regional para espacios Enterprise elegibles",
				extensionLed: "Núcleo enfocado; añade extensiones cuando hagan falta",
				allInOne: "Amplio conjunto de funciones desde el principio",
				nativeExtensions:
					"Extensiones comunitarias y privadas dentro del espacio",
				integrations:
					"Conecta herramientas externas mediante API e integraciones",
				mcp: "Acceso MCP aprobado, también a espacios de trabajo locales",
				api: "El acceso de la API sigue los permisos de página",
			},
		},
		differences: {
			eyebrow: "Por qué Lunaris",
			headline: "Un núcleo enfocado. Extensiones bajo tus reglas.",
			items: [
				{
					headline: "Construye el espacio, no un apaño",
					body: "Instala extensiones nativas para pizarras, tableros y flujos especializados. Cada espacio recibe las herramientas que necesita sin cargar con todas las funciones.",
				},
				{
					headline: "Sin conexión y sin preparativos",
					body: "Tu espacio está diseñado para seguir siendo útil cuando desaparece la red. Sigue trabajando y sincroniza después si activaste la nube.",
				},
				{
					headline: "Una opción local real",
					body: "Elige visibilidad local para espacios de trabajo que deben quedarse en un dispositivo o una región de sincronización cuando necesites colaborar.",
				},
			],
		},
		sources: {
			intro:
				"Los detalles sobre Notion se basan en su documentación pública, revisada en agosto de 2026. Las funciones pueden cambiar.",
			offline: "Uso sin conexión",
			backup: "Copias de seguridad y exportaciones",
			residency: "Residencia de datos",
			api: "Conexiones API",
		},
		cta: {
			headline: "Crea el espacio que tu trabajo realmente necesita.",
			subheadline:
				"Empieza a escribir gratis. Mantén espacios de trabajo locales, sincroniza en la región que elijas y añade extensiones cuando necesites más.",
		},
	},
	cta: {
		headline: "Crea el espacio que tu trabajo realmente necesita.",
		subheadline:
			"Escribe gratis. Mantén los espacios de trabajo en local o sincronízalos con tu equipo y añade extensiones cuando las necesites.",
		label: "Crear un espacio",
		suffix: "gratis",
	},
	footer: {
		compare: "Comparar",
		linearComparison: "Lunaris vs. Linear",
		obsidianComparison: "Lunaris vs. Obsidian",
		notionComparison: "Lunaris vs. Notion",
		tool: "Herramientas",
		wordCounter: "Contador de palabras",
		resources: "Recursos",
		trustCenter: "Centro de confianza",
		mcp: "MCP para agentes",
		contact: "Contacto",
		legal: "Legal",
		privacyPolicy: "Política de Privacidad",
		cookiePolicy: "Política de cookies",
		cookieSettings: "Configuración de cookies",
		termsOfService: "Términos de Servicio",
		subprocessors: "Subprocesadores",
		fineprint: "© 2026 Lunaris",
	},
	notFound: {
		headline: "Página no encontrada",
		subheadline:
			"Lo sentimos, pero la página que buscabas no se pudo encontrar.",
		cta: "Volver al inicio",
	},
} satisfies Dictionary;

export default es;
