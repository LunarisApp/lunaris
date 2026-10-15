import { describe, expect, test } from "bun:test";
import { analyzeEnglishReadability } from "./readability-analysis";

describe("analyzeEnglishReadability", () => {
	test("returns an interpreted Flesch result", () => {
		const result = analyzeEnglishReadability(
			"The sun was warm. The path was clear. We walked home before dinner.",
		);

		expect(result).not.toBeNull();
		expect(result?.score).toBeGreaterThan(60);
		expect(result?.grade).toBeGreaterThanOrEqual(0);
	});

	test("rejects unreadable formula output", () => {
		expect(analyzeEnglishReadability("")).toBeNull();
	});

	test("keeps displayed scores within their stated scales", () => {
		const easy = analyzeEnglishReadability("The cat sat.");
		const dense = analyzeEnglishReadability(
			"Internationalization constitutionalization incomprehensibility.",
		);

		expect(easy).toMatchObject({ grade: 0, score: 100 });
		expect(dense).toMatchObject({ grade: 18, score: 0 });
	});
});
