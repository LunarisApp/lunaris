import type { Dictionary } from "./types";

const ptBR = {
	meta: {
		title: "Lunaris — Um espaço de escrita que combina com seu trabalho",
		description:
			"Escreva offline, colabore em tempo real, escolha onde seus dados ficam e molde cada espaço com extensões públicas ou privadas.",
	},
	accessibility: {
		demoVideoDescription:
			"Demonstração sem áudio: a barra lateral de um espaço de trabalho mostra Visão geral, Roteiro, Quadro branco e pastas. A visão geral contém texto formatado. O roteiro agrupa cartões de tarefas por status; um cartão é movido entre colunas. O quadro branco mostra formas conectadas. Por fim, o roteiro e a visão geral aparecem lado a lado, e a visão geral é rolada.",
		switchLanguage: "Alterar idioma",
		openMenu: "Abrir menu",
		closeMenu: "Fechar menu",
		switchTheme: "Alterar tema",
		lightTheme: "Claro",
		darkTheme: "Escuro",
		systemTheme: "Sistema",
		demoVideo: "Demonstração em vídeo do espaço de trabalho Lunaris",

		skipToContent: "Ir para o conteúdo principal",
		primaryNavigation: "Navegação principal",
		footerNavigation: "Navegação do rodapé",
	},
	nav: {
		pricing: "Preços",
		docs: "Documentação",
		mcp: "MCP",
		contact: "Contato",
	},
	hero: {
		mcpAnnouncement: {
			badge: "Novo",
			label: "Conecte suas ferramentas de IA ao MCP",
		},
		headline: "Um espaço de escrita que você pode fazer do seu jeito.",
		subheadline: {
			beforeHighlight: "Comece com o",
			highlight: "essencial.",
			betweenHighlights: "Adicione",
			secondHighlight: "extensões conforme seu trabalho evolui.",
			afterHighlight: " Trabalhe offline ou colabore em tempo real.",
		},
	},
	problems: {
		headline: "Por que se adaptar ao seu organização?",
		subheadline:
			"Ferramentas completas demais sobrecarregam cada espaço de trabalho com a mesma bagunça, os mesmos limites e o mesmo fluxo.",
		items: {
			featureBloat: {
				headline: "Excesso de recursos",
				subheadline:
					"Cada recurso integrado adiciona outro menu, mesmo que seu espaço de trabalho nunca precise dele.",
			},
			vendorLockIn: {
				headline: "Dependência do fornecedor",
				subheadline:
					"Acesso apenas pela nuvem e sistemas proprietários decidem quando e onde seu trabalho fica disponível.",
			},
			rigidWorkflows: {
				headline: "Fluxos de trabalho rígidos",
				subheadline:
					"Um romance, uma base de conhecimento e uma ferramenta interna não deveriam caber no mesmo molde.",
			},
		},
	},
	bentoFeatures: {
		headline: "Comece pela escrita. Molde todo o resto ao redor.",
		subheadline:
			"Mantenha o núcleo focado. Adicione colaboração, IA e extensões nos seus termos.",
		items: {
			dataOwnership: {
				headline: "Seus dados são seus",
				subheadline:
					"Mantenha espaços de trabalho sensíveis no dispositivo ou escolha onde os dados sincronizados ficam.",
			},
			offlineFirst: {
				headline: "Offline em primeiro lugar",
				subheadline:
					"Continue escrevendo sem conexão. Sincronize quando voltar a ficar online, se quiser.",
			},
			extensions: {
				headline: "Extensões",
				subheadline:
					"Instale ferramentas da comunidade ou crie extensões privadas para o fluxo exato da sua equipe.",
			},
			collaboration: {
				headline: "Colaboração",
				subheadline:
					"Edite em conjunto em tempo real, compartilhe espaços de trabalho e gerencie o acesso da sua equipe.",
			},
			aiReady: {
				headline: "Pronto para IA",
				subheadline:
					"Conecte ferramentas de IA pelo MCP e escolha quando elas entram no seu fluxo de trabalho.",
			},
			fastLightweight: {
				headline: "Rápido e leve",
				subheadline:
					"Abre rápido e continua responsivo para nunca atrapalhar o seu trabalho.",
			},
			crossPlatform: {
				headline: "Multiplataforma",
				subheadline:
					"Alterne entre web e desktop sem precisar aprender uma organização diferente.",
			},
		},
	},
	faqs: {
		headline: "Tem dúvidas? Comece por aqui.",
		items: {
			openPlatform: {
				question: "O que torna o Lunaris uma plataforma aberta?",
				answer:
					"O Lunaris começa com um núcleo focado na escrita. Extensões da comunidade adicionam ferramentas especializadas, enquanto equipes podem criar extensões privadas para fluxos internos, sem transformar cada espaço em um pacote completo.",
			},
			free: {
				question: "Posso usar gratuitamente?",
				answer:
					"Sim. O Free inclui sincronização na nuvem, espaços de trabalho ilimitados, até 25 itens, até 3 membros e 250 MB de armazenamento por organização, com limite de 25 MB por arquivo. Não é preciso informar dados de pagamento. Veja os {pricingLink}.",
			},
			offline: {
				question: "Funciona offline?",
				answer:
					"Sim, você pode escrever offline em todos os planos. Seu trabalho é sincronizado com a nuvem quando você fica online, para acessar de qualquer dispositivo e colaborar. Você também pode desativar a sincronização na nuvem e usar o aplicativo totalmente offline, se preferir.",
			},
			security: {
				question: "O que vocês oferecem em Segurança e Conformidade?",
				answer:
					"Seus textos são seus. Você escolhe onde são armazenados, nos EUA ou na UE, e tudo é criptografado em trânsito e em repouso. Equipes Enterprise recebem controles adicionais como funções personalizadas, SSO & SCIM e garantias de SLA. Visite nossa {trustCenterLink} para saber mais.",
			},
			fileStorage: {
				question: "O que conta no armazenamento de arquivos?",
				answer:
					"Arquivos enviados e anexos compartilham o armazenamento entre todos os espaços de trabalho da organização. Arquivos na lixeira contam até serem excluídos permanentemente. Arquivos apenas locais não usam armazenamento na nuvem. Usamos unidades decimais: 1 MB = 1.000.000 bytes; 1 GB = 1.000 MB.",
			},
			storageFull: {
				question: "O que acontece se o armazenamento da organização acabar?",
				answer:
					"Os arquivos existentes continuam disponíveis para leitura, download e exclusão, mesmo após mudar para um plano menor ou remover membros. Envios que aumentam o uso de armazenamento ficam pausados até você liberar espaço ou melhorar o plano. Você pode substituir arquivos por versões menores dentro do limite por arquivo do seu plano. Envios rejeitados permanecem no seu dispositivo.",
			},
			aiTraining: {
				question: "Meus textos são usados para treinar modelos de IA?",
				answer: "Não.",
			},
		},
	},
	pricing: {
		headline: "Preços simples para cada organização.",
		plans: {
			free: {
				name: "Free",
				subheadline: "Para trabalho pessoal e pequenos espaços compartilhados.",
				features: [
					"Até 25 itens",
					"Até 3 membros",
					"Espaços de trabalho ilimitados",
					"Sincronização na nuvem",
					"Extensões básicas",
					"250 MB de armazenamento por organização",
					"25 MB por arquivo",
				],
				ctaLabel: "Começar grátis",
			},
			plus: {
				name: "Plus",
				subheadline: "Para espaços ativos com mais conteúdo ou membros.",
				features: [
					"Tudo no Free",
					"Itens ilimitados",
					"Até 10 membros",
					"Espaços de trabalho ilimitados",
					"10 GB por organização",
					"500 MB por arquivo",
				],
				ctaLabel: "Escolher Plus",
			},
			business: {
				name: "Business",
				subheadline:
					"Para equipes em crescimento que precisam de todas as extensões e membros ilimitados.",
				features: [
					"Tudo no Plus",
					"Membros ilimitados",
					"Todas as extensões",
					"Suporte prioritário",
					"100 GB por organização",
					"5 GB por arquivo",
				],
				ctaLabel: "Escolher Business",
			},
			enterprise: {
				name: "Enterprise",
				subheadline:
					"Para organizações que precisam de segurança, acesso e suporte sob medida.",
				features: [
					"Tudo no Business",
					"Funções e permissões personalizadas",
					"SSO & SCIM",
					"SOC 2",
					"Acompanhamento de SLA",
					"1 TB; limites personalizados disponíveis",
					"5 GB por arquivo",
				],
				ctaLabel: "Falar conosco",
			},
		},
	},
	pricingPage: {
		title: "Preços do Lunaris — Comece grátis e atualize ao crescer",
		description:
			"Comece grátis, sem dados de pagamento. Cada espaço do Lunaris tem seu próprio plano, então você só atualiza os que precisam de mais itens, membros ou extensões.",
		headline: "Comece grátis. Atualize cada espaço quando ele crescer.",
		subheadline:
			"Crie um espaço sincronizado sem dados de pagamento. Cada espaço tem seu próprio plano, então você só atualiza os que precisam de mais itens ou membros.",
		options: { monthly: "Mensal", yearly: "Anual (Economize 20%)" },
		labels: {
			perMemberMonth: "/membro/mês",
			save20: "Economize 20%",
			unlimited: "Ilimitados",
			included: "Incluído",
			notIncluded: "Não incluído",
		},
		billingNote:
			"Os planos pagos são calculados por membro aceito em cada espaço. O proprietário conta como membro. Os planos anuais são cobrados uma vez por ano.",
		storage: {
			poolLabel: "Armazenamento de arquivos da organização",
			fileLabel: "Tamanho máximo por arquivo",
			note: "O armazenamento é compartilhado entre todos os espaços de trabalho da organização, incluindo os privados. Os limites são fixos por plano e não mudam com o número de membros.",
			pools: {
				free: "250 MB no total",
				plus: "10 GB / organização",
				business: "100 GB / organização",
				enterprise: "1 TB; personalizável",
			},
			files: {
				free: "25 MB",
				plus: "500 MB",
				business: "5 GB",
				enterprise: "5 GB",
			},
		},
		comparisonTable: {
			heading: "Comparar planos",
			categories: {
				core: {
					title: "Principal",
					features: {
						workspaces: "Espaços de trabalho",
						items: "Itens",
						members: "Membros (incluindo o proprietário)",
						cloudSync: "Sincronização na Nuvem",
					},
				},
				extensions: {
					title: "Extensões",
					features: {
						richTextEditor: "Editor de Texto Rico",
						whiteboard: "Lousa",
						kanbanBoard: "Quadro Kanban",
						compiler: "Exportação",
						allOther: "Todos os outros",
					},
				},
				support: {
					title: "Suporte",
					features: {
						community: "Suporte da comunidade",
						priority: "Suporte prioritário",
						dedicated: "Gerente dedicado",
					},
				},
				securityCompliance: {
					title: "Segurança e Conformidade",
					features: {
						customRoles: "Funções e permissões personalizadas",
						sla: "Acompanhamento de SLA",
						sso: "SSO & SCIM",
						soc2: "SOC 2",
					},
				},
			},
		},
		details: [
			{
				title: "Atualize um espaço de cada vez",
				body: "Passe para o Plus no 26º item ou 4º membro, e para o Business no 11º membro.",
			},
			{
				title: "Pague apenas por membros aceitos",
				body: "Membros aceitos são cobrados; convites pendentes apenas reservam capacidade.",
			},
			{
				title: "Dê a cada espaço seu próprio plano",
				body: "Cada espaço é cobrado separadamente, então um pode ficar no Free enquanto outro usa Plus ou Business.",
			},
			{
				title: "Mantenha seu trabalho ao cancelar",
				body: "Ao cancelar, o espaço volta ao Free sem excluir nem bloquear o conteúdo existente. Você não pode adicionar mais enquanto um limite do Free for excedido.",
			},
			{
				title: "Gerencie a cobrança no Lunaris",
				body: "Proprietários mudam de plano no Lunaris e gerenciam cancelamentos ou formas de pagamento no portal Polar.",
			},
			{
				title: "Crie e participe de vários espaços",
				body: "Crie vários espaços ou participe dos espaços de outras pessoas. Cada espaço que você possui mantém seu próprio plano.",
			},
		],
		ctaHeadline: "Crie seu primeiro organização.",
		ctaLabel: "Criar um espaço",
		ctaSuffix: "começar grátis",
	},
	demoPage: {
		title: "Consultoria de organização — Lunaris",
		description:
			"Conte-nos como sua equipe trabalha e ajudaremos a criar o espaço ideal no Lunaris.",
		headline: "Vamos criar o organização ideal para sua equipe.",
		subheadline:
			"Conte-nos como sua equipe escreve, planeja, colabora e gerencia informações. Ajudaremos a criar um espaço no Lunaris em torno dessas necessidades.",
		form: {
			nameLabel: "Nome completo",
			namePlaceholder: "Ada Lovelace",
			emailLabel: "E-mail corporativo",
			emailPlaceholder: "ada@empresa.com",
			companyLabel: "Empresa",
			companyPlaceholder: "Acme Inc.",
			companySizeLabel: "Tamanho da empresa",
			companySizePlaceholder: "Selecionar tamanho",
			companySizeOptions: {
				small: "1–10",
				medium: "11–50",
				large: "51–200",
				xl: "201–1.000",
				xxl: "1.000+",
			},
			messageLabel: "O que seu organização deve ajudar você a fazer?",
			messagePlaceholder:
				"Conte-nos sobre seu fluxo de trabalho, as ferramentas necessárias e onde sua configuração atual atrapalha...",
			submit: "Solicitar consultoria",
			submitting: "Enviando solicitação...",
			successTitle: "Obrigado — recebemos sua solicitação.",
			successBody: "Entraremos em contato em até um dia útil.",
			errorRequired: "Obrigatório",
			errorEmail: "Informe um e-mail válido",
			errorTooLong: "Encurte esta resposta",
			errorGeneric: "Algo deu errado. Tente novamente.",
		},
	},
	mcpPage: {
		title: "Lunaris MCP — Conecte seu cliente MCP",
		description:
			"Conecte qualquer cliente MCP, incluindo Claude Code, Codex e Cursor, ao Lunaris na região de dados escolhida.",
		eyebrow: "Lunaris MCP",
		headline: "Traga seu organização para a conversa.",
		setup: {
			harnessLabel: "Escolha seu cliente MCP",
			regionLabel: "Escolha sua região de dados",
			desktopName: "Aplicativo para desktop",
			desktopDescription:
				"Inclui seus espaços de trabalho com visibilidade local.",
			desktopAuthNote:
				"Mantenha o Lunaris Desktop aberto e aprove a solicitação de pareamento em Configurações → Dados locais.",
			desktopDataNote:
				"Espaços de trabalho com visibilidade local permanecem neste dispositivo.",
			genericName: "Cliente MCP",
			comingSoon: "Em breve",
			available: "Disponível",
			commandLabel: "Execute este comando",
			configLabel: "Adicione esta configuração",
			detailsLabel: "Detalhes do servidor",
			copy: "Copiar",
			copied: "Copiado",
			authNote: "Seu agente solicitará um login seguro na primeira conexão.",
			dataNote: "Os dados do espaço permanecem na região escolhida.",
		},
	},
	linearComparisonPage: {
		title: "Lunaris vs. Linear: documentos feitos para mais",
		description:
			"Compare Lunaris e Linear em organização de documentos, pastas de espaço de trabalho, extensões nativas e ferramentas personalizadas.",
		headline: "Dê um lugar aos documentos, não apenas uma tarefa.",
		subheadline:
			"O Lunaris reúne documentos, pastas e arquivos criados por extensões em uma única árvore de espaço de trabalho. Adapte cada espaço ao trabalho, enquanto o Linear mantém documentos próximos do planejamento de produto.",
		primaryCta: "Comece a escrever grátis",
		table: {
			heading: "Compare o essencial",
			lunaris: "Lunaris",
			linear: "Linear",
			categories: {
				organization: {
					title: "Gestão de documentos",
					features: {
						structure: "Organização de documentos",
						navigation: "Localização de conteúdo do espaço de trabalho",
					},
				},
				content: {
					title: "Conteúdo",
					features: {
						resources: "Além do texto",
						workspaceScope: "O que um espaço de trabalho contém",
					},
				},
				extensions: {
					title: "Extensões",
					features: {
						customization: "Expansão do espaço",
						customTools: "Criação de ferramentas próprias",
					},
				},
			},
			values: {
				nestedFolders:
					"Aninhe documentos e arquivos em pastas de espaço de trabalho",
				attachedDocuments:
					"Anexe documentos a espaços de trabalho, iniciativas, equipes, tarefas ou ciclos",
				workspaceTree: "Explore e reordene o conteúdo em uma única árvore",
				workContext: "Explore documentos pelo contexto de trabalho relacionado",
				mixedContent: "Reúna texto rico, quadros brancos, quadros e arquivos",
				richTextDocuments: "Documentos colaborativos usam o editor do Linear",
				workspaceContent:
					"Espaços de trabalho podem conter pastas e arquivos criados por extensões",
				productPlanning:
					"Espaços de trabalho combinam tarefas e documentos opcionais",
				nativeExtensions:
					"Extensões da comunidade adicionam ferramentas ao espaço",
				integrations: "Integrações conectam o Linear a aplicativos externos",
				privateExtensions: "Crie extensões privadas para o fluxo da sua equipe",
				apiApps:
					"Crie aplicativos externos com a API e o SDK TypeScript do Linear",
			},
		},
		sources: {
			intro:
				"Os dados do Linear se baseiam na documentação pública, revisada em agosto de 2026. Os recursos podem mudar.",
			documents: "Documentos",
			workspaces: "Espaços de trabalho",
			integrations: "Diretório de integrações",
			api: "SDK para desenvolvedores",
		},
		cta: {
			headline:
				"Faça cada espaço de trabalho ser mais que uma lista de tarefas.",
			subheadline:
				"Comece a escrever grátis. Organize o conteúdo em pastas e adicione os tipos de arquivo e ferramentas de que precisa.",
		},
	},
	obsidianComparisonPage: {
		title: "Lunaris vs. Obsidian: colaboração offline-first",
		description:
			"Compare Lunaris e Obsidian em colaboração ao vivo, permissões de equipe, edição offline e extensões.",
		eyebrow: "Lunaris vs. Obsidian",
		headline: "Trabalhe offline sem trabalhar sozinho.",
		subheadline:
			"Lunaris leva colaboração em tempo real a um espaço offline-first. Edite documentos compartilhados com a equipe, convide pessoas com funções definidas e continue escrevendo quando a conexão cair.",
		primaryCta: "Comece a escrever grátis",
		secondaryCta: "Ver preços",
		fit: {
			lunaris: {
				label: "Lunaris foi feito para você que quer",
				items: [
					"Editar documentos compartilhados em conjunto, sem revezamento",
					"Convidar a equipe e gerenciar o acesso dentro do espaço",
					"Continuar offline e combinar as mudanças de todos com segurança",
				],
			},
			obsidian: {
				label: "Onde o Obsidian pode atrapalhar",
				items: [
					"Cofres compartilhados não permitem edição ao vivo no mesmo arquivo",
					"Você não vê o cursor ou as mudanças de outra pessoa antes da sincronização",
					"Cada colaborador precisa do Sync e recebe as mesmas permissões",
				],
			},
		},
		table: {
			heading: "Compare o essencial",
			lunaris: "Lunaris",
			obsidian: "Obsidian",
			categories: {
				collaboration: {
					title: "Colaboração",
					features: {
						sameDocument: "Edição em conjunto",
						concurrentChanges: "Edições simultâneas",
					},
				},
				teamwork: {
					title: "Trabalho em equipe",
					features: {
						teamAccess: "Convites para a equipe",
						permissions: "Permissões",
					},
				},
				foundation: {
					title: "Trabalho offline e extensões",
					features: {
						offlineModel: "Trabalho offline",
						organizationShape: "Expansão do espaço",
					},
				},
			},
			values: {
				sharedEditing: "Edite documentos compartilhados em tempo real",
				noLiveEditing: "Sem edição colaborativa ao vivo no mesmo arquivo",
				crdtMerge:
					"Todos veem as mudanças em tempo real em um documento compartilhado",
				syncMerge:
					"As mudanças das outras pessoas aparecem só depois da sincronização",
				organizationInvite: "Convide a equipe diretamente para o espaço",
				syncSubscription: "Cada colaborador precisa do Obsidian Sync",
				organizationRoles: "Atribua funções e permissões no espaço",
				samePermissions: "Todos recebem as mesmas permissões do cofre",
				offlineOrganization:
					"Continue editando offline; sincronize ao se conectar",
				localVault: "Cofre Markdown local; sincronização opcional",
				extensionOrganization: "Editor focado com extensões nativas",
				markdownPlugins: "Cofre Markdown com extensões da comunidade",
			},
		},
		differences: {
			eyebrow: "Por que Lunaris",
			headline: "Colaboração sem abrir mão do trabalho offline.",
			items: [
				{
					headline: "Escrevam juntos, não por turnos",
					body: "Trabalhem no mesmo documento sem tratar cada edição simultânea como um evento de sincronização que precisa ser combinado depois.",
				},
				{
					headline: "Traga a equipe para o espaço",
					body: "Convide membros e dê o acesso necessário. A colaboração faz parte do espaço, não de uma configuração de sincronização separada para cada pessoa.",
				},
				{
					headline: "Continue produtivo offline",
					body: "Continue editando sem conexão. Ao voltar, as mudanças convergem no documento compartilhado para a equipe seguir com uma única fonte.",
				},
			],
		},
		sources: {
			intro:
				"Os detalhes do Obsidian se baseiam na documentação pública, revisada em agosto de 2026. Os recursos podem mudar.",
			collaboration: "Colaboração em cofres compartilhados",
			teams: "Sync para equipes",
			plans: "Planos e limites do Sync",
		},
		cta: {
			headline: "Leve suas notas para um espaço compartilhado.",
			subheadline:
				"Comece a escrever grátis. Continue offline e convide sua equipe quando chegar a hora de colaborar.",
		},
	},
	notionComparisonPage: {
		title: "Lunaris vs. Notion: espaços offline-first",
		description:
			"Compare Lunaris e Notion em acesso offline, espaços de trabalho locais, residência de dados, extensões e acesso de agentes.",
		eyebrow: "Lunaris vs. Notion",
		headline: "Trabalhe offline. Adicione só o que seu espaço precisa.",
		subheadline:
			"Lunaris começa com um editor focado e offline-first. Mantenha espaços de trabalho sensíveis no seu dispositivo, escolha uma região de sincronização e adicione extensões da comunidade ou privadas quando precisar de mais.",
		primaryCta: "Comece a escrever grátis",
		secondaryCta: "Ver preços",
		fit: {
			lunaris: {
				label: "Lunaris foi feito para você se quiser",
				items: [
					"Moldar cada espaço com extensões nativas",
					"Adicionar quadros brancos, painéis e fluxos especializados só quando precisar",
					"Manter espaços de trabalho locais ou sincronizá-los por uma região escolhida",
				],
			},
			notion: {
				label: "Onde o Notion pode atrapalhar",
				items: [
					"Um amplo conjunto tudo em um adiciona mais menus e decisões desde o início",
					"O trabalho offline depende de páginas baixadas nos aplicativos desktop ou móvel",
					"Os espaços de trabalho ficam em um espaço na nuvem, não em um espaço somente local",
				],
			},
		},
		table: {
			heading: "Compare o essencial",
			lunaris: "Lunaris",
			notion: "Notion",
			categories: {
				access: {
					title: "Acesso offline",
					features: {
						offlineModel: "Trabalho offline",
						localOnly: "Espaços de trabalho mantidos no dispositivo",
					},
				},
				control: {
					title: "Controle",
					features: {
						dataLocation: "Escolha da localização dos dados",
						organizationShape: "Adição de ferramentas ao espaço",
					},
				},
				connections: {
					title: "Extensões e acesso de agentes",
					features: {
						customization: "Expansão do espaço",
						agentAccess: "Conexão de agentes externos",
					},
				},
			},
			values: {
				offlineFirst: "Trabalhe nos seus espaços de trabalho sem conexão",
				downloadedPages: "Trabalhe offline em páginas baixadas nos aplicativos",
				localWorkspaces:
					"Mantenha espaços de trabalho sensíveis neste dispositivo",
				cloudOrganization: "Espaço na nuvem com opções de exportação",
				deviceOrRegion:
					"Mantenha espaços de trabalho locais ou escolha uma região de sincronização",
				enterpriseResidency:
					"Nuvem; residência regional para espaços Enterprise qualificados",
				extensionLed: "Núcleo focado; adicione extensões quando precisar",
				allInOne: "Amplo conjunto de recursos desde o início",
				nativeExtensions: "Extensões da comunidade e privadas dentro do espaço",
				integrations: "Conecte ferramentas externas por APIs e integrações",
				mcp: "Acesso MCP aprovado, inclusive a espaços de trabalho locais",
				api: "O acesso da API segue as permissões da página",
			},
		},
		differences: {
			eyebrow: "Por que Lunaris",
			headline: "Um núcleo focado. Extensões nos seus termos.",
			items: [
				{
					headline: "Construa o espaço, não um improviso",
					body: "Instale extensões nativas para quadros brancos, painéis e fluxos especializados. Cada espaço recebe as ferramentas necessárias sem carregar todos os recursos.",
				},
				{
					headline: "Offline sem preparativos",
					body: "Seu espaço foi criado para continuar útil quando a rede desaparece. Continue trabalhando e sincronize depois se a nuvem estiver ativa.",
				},
				{
					headline: "Uma opção local de verdade",
					body: "Escolha visibilidade local para espaços de trabalho que devem ficar em um dispositivo ou uma região de sincronização quando colaboração importar.",
				},
			],
		},
		sources: {
			intro:
				"Os detalhes do Notion usam a documentação pública, revisada em agosto de 2026. Os recursos podem mudar.",
			offline: "Uso offline",
			backup: "Backups e exportações",
			residency: "Residência de dados",
			api: "Conexões de API",
		},
		cta: {
			headline: "Crie o espaço de que seu trabalho realmente precisa.",
			subheadline:
				"Comece a escrever grátis. Mantenha espaços de trabalho locais, sincronize pela região escolhida e adicione extensões quando precisar de mais.",
		},
	},
	cta: {
		headline: "Crie o espaço que seu trabalho realmente precisa.",
		subheadline:
			"Escreva grátis. Mantenha espaços de trabalho locais ou sincronize com sua equipe e adicione extensões quando precisar.",
		label: "Criar um espaço",
		suffix: "grátis",
	},
	footer: {
		compare: "Comparar",
		linearComparison: "Lunaris vs. Linear",
		obsidianComparison: "Lunaris vs. Obsidian",
		notionComparison: "Lunaris vs. Notion",
		tool: "Ferramentas",
		wordCounter: "Contador de palavras",
		resources: "Recursos",
		trustCenter: "Central de confiança",
		mcp: "MCP para agentes",
		contact: "Contato",
		legal: "Jurídico",
		privacyPolicy: "Política de Privacidade",
		cookiePolicy: "Política de cookies",
		cookieSettings: "Configurações de cookies",
		termsOfService: "Termos de Serviço",
		subprocessors: "Subprocessadores",
		fineprint: "© 2026 Lunaris",
	},
	notFound: {
		headline: "Página não encontrada",
		subheadline:
			"Desculpe, mas a página que você procurava não pôde ser encontrada.",
		cta: "Voltar ao início",
	},
} satisfies Dictionary;

export default ptBR;
