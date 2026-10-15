import { defaultLocale, type Locale } from "./config";
import type { Dictionary } from "./dictionaries/types";

const dictionaries: Record<Locale, () => Promise<{ default: Dictionary }>> = {
	en: () => import("./dictionaries/en"),
	es: () => import("./dictionaries/es"),
	fr: () => import("./dictionaries/fr"),
	de: () => import("./dictionaries/de"),
	"pt-BR": () => import("./dictionaries/pt-BR"),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
	const loader = dictionaries[locale] ?? dictionaries[defaultLocale];
	const mod = await loader();
	return mod.default;
}
