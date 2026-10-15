import { analyzeEnglishReadability } from "@/lib/readability-analysis";
import { analyzeSyllables } from "@/lib/syllable-analysis";
import type { AnalysisLanguage } from "@/lib/word-analysis";

type ReadabilityWorkerRequest = {
	id: number;
	includeReadability: boolean;
	language: AnalysisLanguage;
	text: string;
};

type ReadabilityWorkerResponse = {
	id: number;
	result: {
		readability: ReturnType<typeof analyzeEnglishReadability>;
		syllables: ReturnType<typeof analyzeSyllables>;
	};
};

type WorkerScope = {
	addEventListener(
		type: "message",
		listener: (event: MessageEvent<ReadabilityWorkerRequest>) => void,
	): void;
	postMessage(message: ReadabilityWorkerResponse): void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
	workerScope.postMessage({
		id: event.data.id,
		result: {
			readability: event.data.includeReadability
				? analyzeEnglishReadability(event.data.text)
				: null,
			syllables: analyzeSyllables(event.data.text, event.data.language),
		},
	});
});
