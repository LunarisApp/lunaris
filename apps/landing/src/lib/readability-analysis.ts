import { TextReadability } from "@lunarisapp/readability";

export type ReadabilityBand =
	| "veryEasy"
	| "easy"
	| "fairlyEasy"
	| "standard"
	| "fairlyDifficult"
	| "difficult"
	| "veryDifficult";

export type ReadabilityResult = {
	band: ReadabilityBand;
	grade: number;
	score: number;
};

function readabilityBand(score: number): ReadabilityBand {
	if (score >= 90) return "veryEasy";
	if (score >= 80) return "easy";
	if (score >= 70) return "fairlyEasy";
	if (score >= 60) return "standard";
	if (score >= 50) return "fairlyDifficult";
	if (score >= 30) return "difficult";
	return "veryDifficult";
}

const readability = new TextReadability({ cache: true, lang: "en_US" });

export function analyzeEnglishReadability(
	text: string,
): ReadabilityResult | null {
	if (!text.trim()) return null;

	const score = readability.fleschReadingEase(text);
	const grade = readability.fleschKincaidGrade(text);

	if (!(Number.isFinite(score) && Number.isFinite(grade))) return null;

	return {
		band: readabilityBand(score),
		grade: Math.min(18, Math.max(0, grade)),
		score: Math.min(100, Math.max(0, score)),
	};
}
