import { type Language, TextStats } from "@lunarisapp/stats";
import { topWordStopWords } from "@/lib/top-word-stop-words";

export const MAX_TEXT_LENGTH = 500_000;
export const MAIN_THREAD_TEXT_LIMIT = 50_000;
export const MIN_READABILITY_WORDS = 100;

export const analysisLanguages = [
	"en_US",
	"es",
	"fr",
	"de_DE",
	"pt_BR",
] as const satisfies readonly Language[];

export type AnalysisLanguage = (typeof analysisLanguages)[number];

export type TopWord = {
	count: number;
	word: string;
};

export type TextMetrics = {
	averageCharactersPerWord: number;
	averageWordsPerSentence: number;
	characters: number;
	charactersWithoutSpaces: number;
	longWords: number;
	readingTimeSeconds: number;
	sentences: number;
	topWords: TopWord[];
	words: number;
};

const averageReadingSpeed = 225;

const statsByLanguage = new Map<AnalysisLanguage, TextStats>();
const wordPattern = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;

function getStats(language: AnalysisLanguage) {
	const existing = statsByLanguage.get(language);
	if (existing) return existing;

	const stats = new TextStats({ cache: false, lang: language });
	statsByLanguage.set(language, stats);
	return stats;
}

function getTopWords(text: string, language: AnalysisLanguage): TopWord[] {
	const counts = new Map<string, { count: number; firstIndex: number }>();
	let firstIndex = 0;

	for (const match of text.matchAll(wordPattern)) {
		const word = match[0].normalize("NFKC").replaceAll("’", "'").toLowerCase();
		if (topWordStopWords[language].has(word)) {
			firstIndex += 1;
			continue;
		}

		const existing = counts.get(word);

		if (existing) {
			existing.count += 1;
		} else {
			counts.set(word, { count: 1, firstIndex });
		}

		firstIndex += 1;
	}

	return [...counts.entries()]
		.sort(
			([, left], [, right]) =>
				right.count - left.count || left.firstIndex - right.firstIndex,
		)
		.slice(0, 3)
		.map(([word, { count }]) => ({ count, word }));
}

export function analyzeText(
	text: string,
	language: AnalysisLanguage,
): TextMetrics {
	const stats = getStats(language);
	const words = stats.wordCount(text);
	const sentences = stats.sentenceCount(text);
	const characters = stats.charCount(text, false);
	const charactersWithoutSpaces = stats.charCount(text, true);

	return {
		averageCharactersPerWord: words ? charactersWithoutSpaces / words : 0,
		averageWordsPerSentence: sentences ? words / sentences : 0,
		characters,
		charactersWithoutSpaces,
		longWords: stats.longWordCount(text, 10),
		readingTimeSeconds: words
			? Math.max(1, Math.ceil((words / averageReadingSpeed) * 60))
			: 0,
		sentences,
		topWords: getTopWords(text, language),
		words,
	};
}

export function localeToAnalysisLanguage(locale: string): AnalysisLanguage {
	switch (locale) {
		case "de":
			return "de_DE";
		case "es":
			return "es";
		case "fr":
			return "fr";
		case "pt-BR":
			return "pt_BR";
		default:
			return "en_US";
	}
}

export function lengthBucket(wordCount: number) {
	if (wordCount < 50) return "1–49";
	if (wordCount < 250) return "50–249";
	if (wordCount < 1000) return "250–999";
	return "1000+";
}
