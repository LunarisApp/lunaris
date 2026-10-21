import type { CatalogExtension } from "@/data/extension-types";
import type { ExtensionsCopy } from "@/data/extensions";

export type ExtensionFilter = "all" | "catalog" | "built-in";

function normalize(value: string) {
	return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function filterExtensions(
	extensions: readonly CatalogExtension[],
	query: string,
	filter: ExtensionFilter,
	copy: ExtensionsCopy,
) {
	const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
	return extensions.filter((extension) => {
		if (filter === "built-in" && !extension.builtIn) return false;
		if (filter === "catalog" && extension.builtIn) return false;
		const text = normalize(
			[
				extension.name,
				extension.developer,
				extension.description,
				copy.items[extension.slug]?.description,
				...extension.keywords,
			].join(" "),
		);
		return terms.every((term) => text.includes(term));
	});
}
