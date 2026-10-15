import { TextStatsSyllables } from "@lunarisapp/stats/syllables";
import type { AnalysisLanguage } from "@/lib/word-analysis";

export type SyllableMetrics = {
	averageSyllablesPerWord: number;
	polysyllableCount: number;
	syllables: number;
};

const statsByLanguage = new Map<AnalysisLanguage, TextStatsSyllables>();

function getStats(language: AnalysisLanguage) {
	const existing = statsByLanguage.get(language);
	if (existing) return existing;

	const stats = new TextStatsSyllables({ cache: true, lang: language });
	statsByLanguage.set(language, stats);
	return stats;
}

export function analyzeSyllables(
	text: string,
	language: AnalysisLanguage,
): SyllableMetrics {
	if (!text.trim()) {
		return {
			averageSyllablesPerWord: 0,
			polysyllableCount: 0,
			syllables: 0,
		};
	}

	const stats = getStats(language);

	return {
		averageSyllablesPerWord: stats.avgSyllablesPerWord(text),
		polysyllableCount: stats.polysyllableCount(text),
		syllables: stats.syllableCount(text),
	};
}
