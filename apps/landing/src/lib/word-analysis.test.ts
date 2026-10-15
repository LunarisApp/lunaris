import { describe, expect, test } from "bun:test";
import {
	analyzeText,
	lengthBucket,
	localeToAnalysisLanguage,
} from "./word-analysis";

describe("analyzeText", () => {
	test("returns core counts and reading time", () => {
		const metrics = analyzeText(
			"Clear writing helps people. Short sentences make ideas easier to follow.",
			"en_US",
		);

		expect(metrics.words).toBe(11);
		expect(metrics.sentences).toBe(2);
		expect(metrics.characters).toBe(72);
		expect(metrics.charactersWithoutSpaces).toBe(62);
		expect(metrics.readingTimeSeconds).toBe(3);
		expect(metrics.averageWordsPerSentence).toBe(5.5);
	});

	test("returns the top three words with case-insensitive counts", () => {
		const metrics = analyzeText(
			"The Lunaris helps writing. Writing stays clear. The Lunaris writing helps.",
			"en_US",
		);

		expect(metrics.topWords).toEqual([
			{ word: "writing", count: 3 },
			{ word: "lunaris", count: 2 },
			{ word: "helps", count: 2 },
		]);
	});

	test("ignores function words while preserving negations", () => {
		const metrics = analyzeText(
			"El texto y la idea. El texto, una idea nunca nunca.",
			"es",
		);

		expect(metrics.topWords).toEqual([
			{ word: "texto", count: 2 },
			{ word: "idea", count: 2 },
			{ word: "nunca", count: 2 },
		]);
	});

	test("ignores common English pronoun contractions", () => {
		const metrics = analyzeText(
			"She's here and that's where there is writing.",
			"en_US",
		);

		expect(metrics.topWords).toEqual([
			{ word: "here", count: 1 },
			{ word: "writing", count: 1 },
		]);
	});

	test("uses language-specific stop words without removing negations", () => {
		const cases = [
			["en_US", "the is to not signal", ["not", "signal"]],
			["es", "el es para no señal", ["no", "señal"]],
			["fr", "le est pour pas signal", ["pas", "signal"]],
			["de_DE", "der ist für nicht signal", ["nicht", "signal"]],
			["pt_BR", "o é para não sinal", ["não", "sinal"]],
		] as const;

		for (const [language, text, expectedWords] of cases) {
			expect(analyzeText(text, language).topWords.map(({ word }) => word)).toEqual(
				[...expectedWords],
			);
		}
	});

	test("handles empty input", () => {
		expect(analyzeText("", "en_US")).toMatchObject({
			words: 0,
			sentences: 0,
			characters: 0,
			readingTimeSeconds: 0,
			topWords: [],
		});
	});
});

describe("analysis helpers", () => {
	test("maps landing locales to supported text-tools languages", () => {
		expect(localeToAnalysisLanguage("de")).toBe("de_DE");
		expect(localeToAnalysisLanguage("pt-BR")).toBe("pt_BR");
		expect(localeToAnalysisLanguage("unknown")).toBe("en_US");
	});

	test("uses privacy-safe analytics buckets", () => {
		expect(lengthBucket(1)).toBe("1–49");
		expect(lengthBucket(50)).toBe("50–249");
		expect(lengthBucket(250)).toBe("250–999");
		expect(lengthBucket(1000)).toBe("1000+");
	});
});
