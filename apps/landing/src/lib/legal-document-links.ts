export const legalDocumentAliases = {
	privacy: "privacy-policy",
	cookies: "cookie-policy",
	terms: "terms-of-service",
} as const;

export const legalDocumentPaths = {
	privacy: `/${legalDocumentAliases.privacy}`,
	cookies: `/${legalDocumentAliases.cookies}`,
	terms: `/${legalDocumentAliases.terms}`,
	subprocessors: "/subprocessors",
} as const;

export const legalDocumentUrls = {
	privacy: `https://trust.lunaris.app/documents/${legalDocumentAliases.privacy}`,
	subprocessors: "https://trust.lunaris.app/subprocessors",
	cookies: `https://trust.lunaris.app/documents/${legalDocumentAliases.cookies}`,
	terms: `https://trust.lunaris.app/documents/${legalDocumentAliases.terms}`,
} as const;
