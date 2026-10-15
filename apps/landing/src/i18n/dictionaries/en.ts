const en = {
	meta: {
		title: "Lunaris — A writing organization that fits your work",
		description:
			"Write offline, collaborate in real time, control where your data lives, and shape each organization with community or private extensions.",
	},
	accessibility: {
		demoVideoDescription:
			"Silent walkthrough: a workspace sidebar lists Overview, Roadmap, Whiteboard, and folders. The overview contains formatted writing. The roadmap groups task cards by status; a card is moved between columns. The whiteboard shows connected shapes. Finally, the roadmap and overview appear side by side, and the overview is scrolled.",
		switchLanguage: "Switch language",
		openMenu: "Open menu",
		closeMenu: "Close menu",
		switchTheme: "Switch theme",
		lightTheme: "Light",
		darkTheme: "Dark",
		systemTheme: "System",
		demoVideo: "Lunaris workspace video demonstration",

		skipToContent: "Skip to main content",
		primaryNavigation: "Primary navigation",
		footerNavigation: "Footer navigation",
	},
	nav: {
		pricing: "Pricing",
		docs: "Documentation",
		mcp: "MCP",
		contact: "Contact",
	},
	hero: {
		mcpAnnouncement: {
			badge: "New",
			label: "Connect your AI tools with MCP",
		},
		headline: "A writing organization you can make your own.",
		subheadline: {
			beforeHighlight: "Start with the",
			highlight: "essentials.",
			betweenHighlights: "Add",
			secondHighlight: "extensions as your work grows.",
			afterHighlight: " Write offline or collaborate in real time.",
		},
	},
	problems: {
		headline: "Why work around your organization?",
		subheadline:
			"All-in-one tools make every workspace carry the same clutter, limits, and workflow.",
		items: {
			featureBloat: {
				headline: "Feature bloat",
				subheadline:
					"Every built-in feature adds another menu—even when your workspace never needs it.",
			},
			vendorLockIn: {
				headline: "Vendor lock-in",
				subheadline:
					"Cloud-only access and proprietary systems decide when and where your work is available.",
			},
			rigidWorkflows: {
				headline: "Rigid workflows",
				subheadline:
					"A novel, a knowledge base, and an internal tool should not be forced into the same mold.",
			},
		},
	},
	bentoFeatures: {
		headline: "Start with writing. Shape everything around it.",
		subheadline:
			"Keep the core focused. Add collaboration, AI, and extensions on your terms.",
		items: {
			dataOwnership: {
				headline: "Own your data",
				subheadline:
					"Keep sensitive workspaces on your device, or choose where synced data lives.",
			},
			offlineFirst: {
				headline: "Offline-first",
				subheadline:
					"Keep writing without a connection. Sync when you're back online—if you choose.",
			},
			extensions: {
				headline: "Extensions",
				subheadline:
					"Install community tools or build private extensions for your team's exact workflow.",
			},
			collaboration: {
				headline: "Collaboration",
				subheadline:
					"Edit together in real time, share workspaces, and manage access across your team.",
			},
			aiReady: {
				headline: "AI-ready",
				subheadline:
					"Connect AI tools through MCP and choose when they enter your workflow.",
			},
			fastLightweight: {
				headline: "Fast & lightweight",
				subheadline:
					"Opens fast and stays responsive, so your organization never gets in the way.",
			},
			crossPlatform: {
				headline: "Cross-platform",
				subheadline:
					"Move between web and desktop without learning a different organization.",
			},
		},
	},
	faqs: {
		headline: "Questions? Start here.",
		items: {
			openPlatform: {
				question: "What makes Lunaris an open platform?",
				answer:
					"Lunaris starts with a focused writing core. Community extensions add specialized tools, while teams can build private extensions for internal workflows—without turning every organization into an all-in-one suite.",
			},
			free: {
				question: "Can I use it for free?",
				answer:
					"Yes. Free includes cloud sync, unlimited workspaces, up to 25 items, up to 3 members, and 250 MB of file storage per organization, with a 25 MB limit per file. No payment details are required. See {pricingLink}.",
			},
			offline: {
				question: "Does it work offline?",
				answer:
					"Yes, you can write offline on all plans. Your work syncs to the cloud when you go online, so it can be accessed from any device and used for collaboration. You can also disable cloud sync and use the app entirely offline if you prefer.",
			},
			security: {
				question: "What do you have for Security & Compliance?",
				answer:
					"Your writing is yours. You choose where it's stored, in the US or EU, and everything is encrypted in transit and at rest. Enterprise teams get additional controls like custom roles, SSO & SCIM, and SLA guarantees. Visit our {trustCenterLink} to learn more.",
			},
			fileStorage: {
				question: "What counts toward file storage?",
				answer:
					"Uploaded files and attachments share one storage pool across all organization workspaces. Files in trash still count until permanently removed. Local-only files do not use cloud storage. Storage uses decimal units: 1 MB = 1,000,000 bytes; 1 GB = 1,000 MB.",
			},
			storageFull: {
				question: "What happens if my organization runs out of storage?",
				answer:
					"Existing files remain available to read, download, and delete, even after a downgrade or member removal. Uploads that increase storage pause until you free space or upgrade. Smaller replacements are allowed within your plan’s per-file limit. Rejected uploads stay on your device.",
			},
			aiTraining: {
				question: "Is my writing used to train AI models?",
				answer: "No.",
			},
		},
	},
	pricing: {
		headline: "Simple pricing for every organization.",
		plans: {
			free: {
				name: "Free",
				subheadline: "For personal work and small shared organizations.",
				features: [
					"Up to 25 items",
					"Up to 3 members",
					"Unlimited workspaces",
					"Cloud sync",
					"Basic extensions",
					"250 MB organization storage",
					"25 MB per file",
				],
				ctaLabel: "Start free",
			},
			plus: {
				name: "Plus",
				subheadline: "For active organizations with more content or members.",
				features: [
					"Everything in Free",
					"Unlimited items",
					"Up to 10 members",
					"Unlimited workspaces",
					"10 GB storage per organization",
					"500 MB per file",
				],
				ctaLabel: "Choose Plus",
			},
			business: {
				name: "Business",
				subheadline:
					"For growing teams that need every extension and no member limits.",
				features: [
					"Everything in Plus",
					"Unlimited members",
					"All extensions",
					"Priority support",
					"100 GB storage per organization",
					"5 GB per file",
				],
				ctaLabel: "Choose Business",
			},
			enterprise: {
				name: "Enterprise",
				subheadline:
					"For organizations that need tailored security, access, and support.",
				features: [
					"Everything in Business",
					"Custom roles & permissions",
					"SSO & SCIM",
					"SOC 2",
					"SLA tracking",
					"1 TB storage; custom limits available",
					"5 GB per file",
				],
				ctaLabel: "Talk to us",
			},
		},
	},
	pricingPage: {
		title: "Lunaris pricing — Start free, upgrade as you grow",
		description:
			"Start free without payment details. Each Lunaris organization has its own plan, so you only upgrade the ones that need more items, members, or extensions.",
		headline: "Start free. Upgrade each organization as it grows.",
		subheadline:
			"Create a synced organization without payment details. Every organization has its own plan, so you only upgrade the ones that need more items or members.",
		options: { monthly: "Monthly", yearly: "Yearly (Save 20%)" },
		labels: {
			perMemberMonth: "/member/mo",
			save20: "Save 20%",
			unlimited: "Unlimited",
			included: "Included",
			notIncluded: "Not included",
		},
		billingNote:
			"Paid plans are priced per accepted member in each organization. The organization owner counts as a member. Annual plans are billed once a year.",
		storage: {
			poolLabel: "Organization file storage",
			fileLabel: "Maximum file size",
			note: "File storage is shared across all workspaces in an organization, including private workspaces. Storage limits are fixed per plan and do not change with member count.",
			pools: {
				free: "250 MB total",
				plus: "10 GB / organization",
				business: "100 GB / organization",
				enterprise: "1 TB; customizable",
			},
			files: {
				free: "25 MB",
				plus: "500 MB",
				business: "5 GB",
				enterprise: "5 GB",
			},
		},
		comparisonTable: {
			heading: "Compare plans",
			categories: {
				core: {
					title: "Core",
					features: {
						workspaces: "Workspaces",
						items: "Items",
						members: "Members (including owner)",
						cloudSync: "Cloud Sync",
					},
				},
				extensions: {
					title: "Extensions",
					features: {
						richTextEditor: "Rich Text Editor",
						whiteboard: "Whiteboard",
						kanbanBoard: "Kanban Board",
						compiler: "Export",
						allOther: "All other",
					},
				},
				support: {
					title: "Support",
					features: {
						community: "Community support",
						priority: "Priority support",
						dedicated: "Dedicated manager",
					},
				},
				securityCompliance: {
					title: "Security & Compliance",
					features: {
						customRoles: "Custom roles & permissions",
						sla: "SLA tracking",
						sso: "SSO & SCIM",
						soc2: "SOC 2",
					},
				},
			},
		},
		details: [
			{
				title: "Upgrade one organization at a time",
				body: "Move to Plus at item 26 or member 4, and to Business at member 11.",
			},
			{
				title: "Pay only for accepted members",
				body: "Accepted members are billed; pending invitations only reserve capacity.",
			},
			{
				title: "Give every organization its own plan",
				body: "Each organization is priced independently, so one can stay Free while another uses Plus or Business.",
			},
			{
				title: "Keep your work if you cancel",
				body: "Cancellation returns the organization to Free without deleting or locking existing content. You cannot add more while it remains over a Free limit.",
			},
			{
				title: "Manage billing in Lunaris",
				body: "Owners change plans in Lunaris and manage cancellations or payment methods in the Polar portal.",
			},
			{
				title: "Create and join multiple organizations",
				body: "Create multiple organizations or join organizations owned by others. Each organization you own keeps its own plan.",
			},
		],
		ctaHeadline: "Create your first organization.",
		ctaLabel: "Create an organization",
		ctaSuffix: "start free",
	},
	demoPage: {
		title: "Organization consultation — Lunaris",
		description:
			"Tell us how your team works, and we'll help you shape the right Lunaris organization.",
		headline: "Let's build the right organization for your team.",
		subheadline:
			"Tell us how your team writes, plans, collaborates, and manages information. We'll help you shape a Lunaris organization around it.",
		form: {
			nameLabel: "Full name",
			namePlaceholder: "Ada Lovelace",
			emailLabel: "Work email",
			emailPlaceholder: "ada@company.com",
			companyLabel: "Company",
			companyPlaceholder: "Acme Inc.",
			companySizeLabel: "Company size",
			companySizePlaceholder: "Select size",
			companySizeOptions: {
				small: "1–10",
				medium: "11–50",
				large: "51–200",
				xl: "201–1,000",
				xxl: "1,000+",
			},
			messageLabel: "What should your organization help you do?",
			messagePlaceholder:
				"Tell us about your workflow, the tools you need, and where your current setup gets in the way...",
			submit: "Request a consultation",
			submitting: "Sending request...",
			successTitle: "Thanks — we got your request.",
			successBody: "We'll be in touch within one business day.",
			errorRequired: "Required",
			errorEmail: "Enter a valid email address",
			errorTooLong: "Shorten this response",
			errorGeneric: "Something went wrong. Please try again.",
		},
	},
	mcpPage: {
		title: "Lunaris MCP — Connect your MCP client",
		description:
			"Connect any MCP client, including Claude Code, Codex, and Cursor, to Lunaris in your chosen data region.",
		eyebrow: "Lunaris MCP",
		headline: "Bring your organization into the conversation.",
		setup: {
			harnessLabel: "Choose your MCP client",
			regionLabel: "Choose your data region",
			desktopName: "Desktop app",
			desktopDescription: "Includes your workspaces with local visibility.",
			desktopAuthNote:
				"Keep Lunaris Desktop running and approve the pairing request in Settings → Local Data.",
			desktopDataNote:
				"Workspaces with local visibility remain on this device.",
			genericName: "MCP client",
			comingSoon: "Coming soon",
			available: "Available",
			commandLabel: "Run this command",
			configLabel: "Add this configuration",
			detailsLabel: "Server details",
			copy: "Copy",
			copied: "Copied",
			authNote:
				"Your agent will ask you to sign in securely the first time it connects.",
			dataNote: "Organization data stays in the region you choose.",
		},
	},
	linearComparisonPage: {
		title: "Lunaris vs Linear: Documents built for more",
		description:
			"Compare Lunaris and Linear for document organization, workspace folders, native extensions, and custom organization tools.",
		headline: "Give documents a home, not just a work item.",
		subheadline:
			"Lunaris keeps documents, folders, and extension-powered files in one workspace tree. Shape each organization around the work, while Linear keeps documents close to product planning.",
		primaryCta: "Start writing free",
		table: {
			heading: "Compare the essentials",
			lunaris: "Lunaris",
			linear: "Linear",
			categories: {
				organization: {
					title: "Document management",
					features: {
						structure: "Organizing documents",
						navigation: "Finding workspace content",
					},
				},
				content: {
					title: "Content",
					features: {
						resources: "Working beyond text",
						workspaceScope: "What a workspace holds",
					},
				},
				extensions: {
					title: "Extensions",
					features: {
						customization: "Extending the organization",
						customTools: "Building custom tools",
					},
				},
			},
			values: {
				nestedFolders: "Nest documents and files in workspace folders",
				attachedDocuments:
					"Attach documents to workspaces, initiatives, teams, issues, or cycles",
				workspaceTree: "Browse and reorder workspace content in one tree",
				workContext: "Browse documents through their related work context",
				mixedContent: "Keep rich text, whiteboards, boards, and files together",
				richTextDocuments:
					"Collaborative rich-text documents use Linear’s editor",
				workspaceContent:
					"Workspaces can hold folders and extension-powered files",
				productPlanning: "Workspaces combine issues with optional documents",
				nativeExtensions:
					"Community extensions add tools inside the organization",
				integrations: "Integrations connect Linear with external apps",
				privateExtensions: "Build private extensions for your team’s workflow",
				apiApps: "Build external apps with Linear’s API and TypeScript SDK",
			},
		},
		sources: {
			intro:
				"Linear details are based on its public documentation, reviewed August 2026. Product capabilities may change.",
			documents: "Documents",
			workspaces: "Workspaces",
			integrations: "Integration directory",
			api: "Developer SDK",
		},
		cta: {
			headline: "Make every workspace more than a task list.",
			subheadline:
				"Start writing free. Organize workspace content in folders, then add the file types and tools your work needs.",
		},
	},
	obsidianComparisonPage: {
		title: "Lunaris vs Obsidian: Offline-first collaboration",
		description:
			"Compare Lunaris and Obsidian for live collaboration, team permissions, offline editing, and extensions.",
		eyebrow: "Lunaris vs Obsidian",
		headline: "Offline-first, without working alone.",
		subheadline:
			"Lunaris brings real-time collaboration to an offline-first organization. Edit shared documents together, invite teammates with roles, and keep writing when the connection drops.",
		primaryCta: "Start writing free",
		secondaryCta: "View pricing",
		fit: {
			lunaris: {
				label: "Lunaris is built for you when you want to",
				items: [
					"Edit shared documents together without taking turns",
					"Invite teammates and manage access inside the organization",
					"Keep working offline and merge everyone’s changes safely",
				],
			},
			obsidian: {
				label: "Where Obsidian can get in the way",
				items: [
					"Shared vaults do not support live editing in the same file",
					"You cannot see another collaborator’s cursor or edits until sync",
					"Every collaborator needs Sync and receives the same permissions",
				],
			},
		},
		table: {
			heading: "Compare the essentials",
			lunaris: "Lunaris",
			obsidian: "Obsidian",
			categories: {
				collaboration: {
					title: "Collaboration",
					features: {
						sameDocument: "Editing together",
						concurrentChanges: "Concurrent edits",
					},
				},
				teamwork: {
					title: "Teamwork",
					features: {
						teamAccess: "Inviting teammates",
						permissions: "Permissions",
					},
				},
				foundation: {
					title: "Offline and extensions",
					features: {
						offlineModel: "Working offline",
						organizationShape: "Extending the organization",
					},
				},
			},
			values: {
				sharedEditing: "Edit shared documents together in real time",
				noLiveEditing: "No collaborative live editing in the same file",
				crdtMerge:
					"Everyone sees changes as they happen in one shared document",
				syncMerge: "Other collaborators’ edits appear only after sync",
				organizationInvite: "Invite teammates directly to the organization",
				syncSubscription: "Each collaborator needs Obsidian Sync",
				organizationRoles: "Assign organization roles and permissions",
				samePermissions: "All collaborators get the same vault permissions",
				offlineOrganization: "Keep editing offline; sync when connected",
				localVault: "Local Markdown vault; sync is optional",
				extensionOrganization: "Focused editor with native extensions",
				markdownPlugins: "Markdown vault with community extensions",
			},
		},
		differences: {
			eyebrow: "Why Lunaris",
			headline: "Collaboration without giving up offline work.",
			items: [
				{
					headline: "Write together, not in turns",
					body: "Work in the same shared document without treating every simultaneous edit as a sync event that must be merged afterward.",
				},
				{
					headline: "Bring the team into the organization",
					body: "Invite members and give them the access their work requires. Collaboration is part of the organization, not a separate sync setup for every person.",
				},
				{
					headline: "Stay productive offline",
					body: "Keep editing without a connection. When you return online, changes merge into the shared document so the team can continue from one source of truth.",
				},
			],
		},
		sources: {
			intro:
				"Obsidian details are based on its public documentation, reviewed August 2026. Product capabilities may change.",
			collaboration: "Shared vault collaboration",
			teams: "Sync for teams",
			plans: "Sync plans and limits",
		},
		cta: {
			headline: "Bring your notes into a shared organization.",
			subheadline:
				"Start writing free. Keep working offline, then invite teammates when it’s time to collaborate.",
		},
	},
	notionComparisonPage: {
		title: "Lunaris vs Notion: Offline-first organizations",
		description:
			"Compare Lunaris and Notion for offline access, local-only workspaces, data residency, extensions, and agent access.",
		eyebrow: "Lunaris vs Notion",
		headline: "Work offline. Add only what your organization needs.",
		subheadline:
			"Lunaris starts with a focused, offline-first editor. Keep sensitive workspaces on your device, choose a sync region, and add community or private extensions when your work calls for more.",
		primaryCta: "Start writing free",
		secondaryCta: "View pricing",
		fit: {
			lunaris: {
				label: "Lunaris is built for you when you want to",
				items: [
					"Shape each organization with native extensions",
					"Add whiteboards, boards, and specialized workflows only when needed",
					"Keep workspaces local or sync them through a chosen region",
				],
			},
			notion: {
				label: "Where Notion can get in the way",
				items: [
					"A broad all-in-one feature set adds more menus and decisions from the start",
					"Offline work depends on pages downloaded to desktop or mobile apps",
					"Workspaces live in a cloud organization rather than a local-only organization",
				],
			},
		},
		table: {
			heading: "Compare the essentials",
			lunaris: "Lunaris",
			notion: "Notion",
			categories: {
				access: {
					title: "Offline access",
					features: {
						offlineModel: "Working offline",
						localOnly: "Keeping workspaces on-device",
					},
				},
				control: {
					title: "Control",
					features: {
						dataLocation: "Choosing a data location",
						organizationShape: "Adding organization tools",
					},
				},
				connections: {
					title: "Extensions and agent access",
					features: {
						customization: "Extending the organization",
						agentAccess: "Connecting external agents",
					},
				},
			},
			values: {
				offlineFirst: "Work across workspaces without a connection",
				downloadedPages: "Work offline on pages downloaded in the apps",
				localWorkspaces: "Keep sensitive workspaces on this device",
				cloudOrganization: "Cloud organization with export options",
				deviceOrRegion: "Keep workspaces on-device or choose a sync region",
				enterpriseResidency:
					"Cloud; regional data residency for eligible Enterprise organizations",
				extensionLed: "Focused core; add extensions as needed",
				allInOne: "Broad feature set included from the start",
				nativeExtensions:
					"Community and private extensions run in the organization",
				integrations: "Connect external tools through APIs and integrations",
				mcp: "Approved MCP access, including local workspaces",
				api: "API access follows page permissions",
			},
		},
		differences: {
			eyebrow: "Why Lunaris",
			headline: "A focused core. Extensions on your terms.",
			items: [
				{
					headline: "Build the organization, not a workaround",
					body: "Install native extensions for whiteboards, boards, and specialized workflows. Each organization gets the tools it needs without carrying every feature everywhere.",
				},
				{
					headline: "Offline without a checklist",
					body: "Your organization is built to stay useful when the network disappears. Keep working and sync later when cloud sync is enabled.",
				},
				{
					headline: "A real local option",
					body: "Choose local visibility for workspaces that should remain on one device, or select a sync region when collaboration matters.",
				},
			],
		},
		sources: {
			intro:
				"Notion details are based on its public documentation, reviewed August 2026. Product capabilities may change.",
			offline: "Offline use",
			backup: "Backups and exports",
			residency: "Data residency",
			api: "API connections",
		},
		cta: {
			headline: "Build the organization your work actually needs.",
			subheadline:
				"Start writing free. Keep workspaces local, sync through your chosen region, and add extensions when you need more.",
		},
	},
	cta: {
		headline: "Build the organization your work actually needs.",
		subheadline:
			"Write for free. Keep workspaces local or sync with your team, then add extensions when the work calls for them.",
		label: "Create an organization",
		suffix: "start free",
	},
	footer: {
		compare: "Compare",
		linearComparison: "Lunaris vs Linear",
		obsidianComparison: "Lunaris vs Obsidian",
		notionComparison: "Lunaris vs Notion",
		tool: "Tools",
		wordCounter: "Word counter",
		resources: "Resources",
		trustCenter: "Trust Center",
		mcp: "MCP for agents",
		contact: "Contact",
		legal: "Legal",
		privacyPolicy: "Privacy Policy",
		cookiePolicy: "Cookie Policy",
		cookieSettings: "Cookie settings",
		termsOfService: "Terms of Service",
		subprocessors: "Subprocessors",
		fineprint: "© 2026 Lunaris",
	},
	notFound: {
		headline: "Page not found",
		subheadline: "Sorry, but the page you were looking for could not be found.",
		cta: "Go back home",
	},
};

export default en;
