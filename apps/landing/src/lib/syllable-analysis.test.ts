import { describe, expect, test } from "bun:test";
import { analyzeSyllables } from "./syllable-analysis";

describe("analyzeSyllables", () => {
	test("returns syllable metrics for the selected language", () => {
		expect(
			analyzeSyllables(
				"Extraordinary communication improves accessibility.",
				"en_US",
			),
		).toEqual({
			averageSyllablesPerWord: 4.75,
			polysyllableCount: 3,
			syllables: 19,
		});
	});

	test("handles empty input", () => {
		expect(analyzeSyllables("", "en_US")).toEqual({
			averageSyllablesPerWord: 0,
			polysyllableCount: 0,
			syllables: 0,
		});
	});
});
