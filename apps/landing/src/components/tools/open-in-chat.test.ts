import { describe, expect, test } from "bun:test";
import {
	MAX_CHAT_URL_LENGTH,
	openInChatQueryExceedsLimit,
} from "./open-in-chat";

describe("openInChatQueryExceedsLimit", () => {
	test("allows short text", () => {
		expect(openInChatQueryExceedsLimit("Help me improve this paragraph.")).toBe(
			false,
		);
	});

	test("rejects encoded URLs over the interoperability limit", () => {
		expect(openInChatQueryExceedsLimit("a".repeat(MAX_CHAT_URL_LENGTH))).toBe(
			true,
		);
		expect(openInChatQueryExceedsLimit("😀".repeat(700))).toBe(true);
	});
});
