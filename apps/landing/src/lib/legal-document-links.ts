export const trustCenterUrl = "https://trust.lunaris.app";

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
	privacy: `${trustCenterUrl}/documents/${legalDocumentAliases.privacy}`,
	subprocessors: `${trustCenterUrl}${legalDocumentPaths.subprocessors}`,
	cookies: `${trustCenterUrl}/documents/${legalDocumentAliases.cookies}`,
	terms: `${trustCenterUrl}/documents/${legalDocumentAliases.terms}`,
} as const;
