import {
	type AnalysisLanguage,
	analyzeText,
	type TextMetrics,
} from "@/lib/word-analysis";

type CoreAnalysisWorkerRequest = {
	id: number;
	language: AnalysisLanguage;
	text: string;
};

type CoreAnalysisWorkerResponse = {
	id: number;
	result: TextMetrics;
};

type WorkerScope = {
	addEventListener(
		type: "message",
		listener: (event: MessageEvent<CoreAnalysisWorkerRequest>) => void,
	): void;
	postMessage(message: CoreAnalysisWorkerResponse): void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
	workerScope.postMessage({
		id: event.data.id,
		result: analyzeText(event.data.text, event.data.language),
	});
});
