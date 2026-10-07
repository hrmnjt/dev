/**
 * Answer - Extract questions from the last assistant message and answer them interactively
 *
 * Inspired by https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/answer.ts
 *
 * Usage:
 * - When the assistant asks questions in its response, type `/answer` or press `ctrl+.`
 * - Pi extracts the questions and shows an interactive Q&A UI
 * - Navigate with Tab/Shift+Tab or arrow keys (when editor is empty)
 * - Submit with Enter on the last question, cancel with Esc
 */

import type { UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Focusable,
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	truncateToWidth,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

// Structured output format for question extraction
interface ExtractedQuestion {
	question: string;
	context?: string;
}

interface ExtractionResult {
	questions: ExtractedQuestion[];
}

const SYSTEM_PROMPT = `You are a question extractor. Given text from a conversation, extract any questions that need answering.

Output a JSON object with this structure:
{
  "questions": [
    {
      "question": "The question text",
      "context": "Optional context that helps answer the question"
    }
  ]
}

Rules:
- Extract all questions that require user input
- Keep questions in the order they appeared
- Be concise with question text
- Include context only when it provides essential information for answering
- If no questions are found, return {"questions": []}

Example output:
{
  "questions": [
    {
      "question": "What is your preferred database?",
      "context": "We can only configure MySQL and PostgreSQL because of what is implemented."
    },
    {
      "question": "Should we use TypeScript or JavaScript?"
    }
  ]
}`;

export function parseExtractionResult(text: string): ExtractionResult | null {
	if (text.length > 128 * 1024) return null;
	try {
		let jsonStr = text;
		const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonMatch) {
			jsonStr = jsonMatch[1].trim();
		}
		const parsed = JSON.parse(jsonStr);
		if (parsed && Array.isArray(parsed.questions) && parsed.questions.length <= 64) {
			const safeText = (s: unknown): s is string => typeof s === "string" &&
				s.trim().length > 0 && s.length <= 8192 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
			if (!parsed.questions.every((q: unknown) => q && typeof q === "object" &&
				safeText((q as ExtractedQuestion).question) &&
				((q as ExtractedQuestion).context === undefined || safeText((q as ExtractedQuestion).context)))) return null;
			return { questions: parsed.questions.map((q: ExtractedQuestion) => ({
				question: q.question.trim(), ...(q.context === undefined ? {} : { context: q.context.trim() }),
			})) };
		}
		return null;
	} catch {
		return null;
	}
}

type ExtractionOutcome = { kind: "success"; result: ExtractionResult } | { kind: "cancelled" } | { kind: "error"; message: string };

export async function extractQuestions(
	registry: ExtensionContext["modelRegistry"], model: NonNullable<ExtensionContext["model"]>,
	text: string, signal: AbortSignal,
): Promise<ExtractionOutcome> {
	try {
		if (signal.aborted) return { kind: "cancelled" };
		const user: UserMessage = { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
		// The supported runtime resolves provider authentication/headers internally;
		// it supports local models without requiring a nonempty API key here.
		const response = await registry.streamSimple(model, { systemPrompt: SYSTEM_PROMPT, messages: [user] }, { signal }).result();
		if (signal.aborted || response.stopReason === "aborted") return { kind: "cancelled" };
		if (response.stopReason !== "stop") return { kind: "error", message: `Question extraction failed (${response.stopReason}) for ${model.provider}/${model.id}; check model availability, /login and provider connectivity.` };
		const responseText = response.content.filter(c => c.type === "text").map(c => c.text).join("\n");
		const result = parseExtractionResult(responseText);
		return result ? { kind: "success", result } : { kind: "error", message: "Question extraction returned malformed or oversized question JSON; retry /answer." };
	} catch {
		// Do not expose provider exception payloads, which can include credentials.
		return signal.aborted ? { kind: "cancelled" } : { kind: "error", message: `Question extraction failed for ${model.provider}/${model.id}; check model availability, /login and provider connectivity.` };
	}
}

export class QnAComponent implements Component, Focusable {
	get focused(): boolean { return this.editor.focused; }
	set focused(value: boolean) { this.editor.focused = value; this.invalidate(); }
	private questions: ExtractedQuestion[];
	private answers: string[];
	private currentIndex = 0;
	private editor: Editor;
	private tui: TUI;
	private onDone: (result: string | null) => void;
	private showingConfirmation = false;
	private cachedWidth?: number;
	private cachedLines?: string[];

	private dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
	private bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
	private cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
	private green = (s: string) => `\x1b[32m${s}\x1b[0m`;
	private yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
	private gray = (s: string) => `\x1b[90m${s}\x1b[0m`;

	constructor(questions: ExtractedQuestion[], tui: TUI, onDone: (result: string | null) => void) {
		this.questions = questions;
		this.answers = questions.map(() => "");
		this.tui = tui;
		this.onDone = onDone;

		const editorTheme: EditorTheme = {
			borderColor: this.dim,
			selectList: {
				selectedPrefix: this.cyan,
				selectedText: this.cyan,
				description: this.gray,
				scrollInfo: this.dim,
				noMatch: this.dim,
			},
		};

		this.editor = new Editor(tui, editorTheme);
		this.editor.disableSubmit = true;
		this.editor.onChange = () => {
			this.invalidate();
			this.tui.requestRender();
		};
	}

	private saveCurrentAnswer(): void {
		this.answers[this.currentIndex] = this.editor.getText();
	}

	private navigateTo(index: number): void {
		if (index < 0 || index >= this.questions.length) return;
		this.saveCurrentAnswer();
		this.currentIndex = index;
		this.editor.setText(this.answers[index] || "");
		this.invalidate();
	}

	private submit(): void {
		this.saveCurrentAnswer();
		const parts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const q = this.questions[i];
			const a = this.answers[i]?.trim() || "(no answer)";
			parts.push(`Q: ${q.question}`);
			if (q.context) {
				parts.push(`> ${q.context}`);
			}
			parts.push(`A: ${a}`);
			parts.push("");
		}
		this.onDone(parts.join("\n").trim());
	}

	private cancel(): void {
		this.onDone(null);
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	handleInput(data: string): void {
		if (this.showingConfirmation) {
			if (matchesKey(data, Key.enter) || data.toLowerCase() === "y") {
				this.submit();
				return;
			}
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data.toLowerCase() === "n") {
				this.showingConfirmation = false;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			return;
		}

		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.cancel();
			return;
		}

		if (matchesKey(data, Key.tab)) {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, Key.shift("tab"))) {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, Key.up) && this.editor.getText() === "") {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
				return;
			}
		}
		if (matchesKey(data, Key.down) && this.editor.getText() === "") {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
				return;
			}
		}

		if (matchesKey(data, Key.enter) && !matchesKey(data, Key.shift("enter"))) {
			this.saveCurrentAnswer();
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
			} else {
				this.showingConfirmation = true;
			}
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		this.editor.handleInput(data);
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		if (width < 24) {
			return [truncateToWidth("Questions — widen terminal", Math.max(0, width)),
				...this.editor.render(Math.max(1, width)).map(line => truncateToWidth(line, Math.max(0, width)))];
		}
		const lines: string[] = [];
		const boxWidth = Math.min(width - 4, 120);
		const contentWidth = boxWidth - 4;

		const horizontalLine = (count: number) => "─".repeat(count);

		const boxLine = (content: string, leftPad = 2): string => {
			const paddedContent = truncateToWidth(" ".repeat(leftPad) + content, boxWidth - 2);
			const contentLen = visibleWidth(paddedContent);
			const rightPad = Math.max(0, boxWidth - contentLen - 2);
			return this.dim("│") + paddedContent + " ".repeat(rightPad) + this.dim("│");
		};

		const emptyBoxLine = (): string => {
			return this.dim("│") + " ".repeat(boxWidth - 2) + this.dim("│");
		};

		const padToWidth = (line: string): string => {
			const len = visibleWidth(line);
			return line + " ".repeat(Math.max(0, width - len));
		};

		lines.push(padToWidth(this.dim("╭" + horizontalLine(boxWidth - 2) + "╮")));
		const title = `${this.bold(this.cyan("Questions"))} ${this.dim(`(${this.currentIndex + 1}/${this.questions.length})`)}`;
		lines.push(padToWidth(boxLine(title)));
		lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));

		const progressParts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const answered = (this.answers[i]?.trim() || "").length > 0;
			const current = i === this.currentIndex;
			if (current) {
				progressParts.push(this.cyan("●"));
			} else if (answered) {
				progressParts.push(this.green("●"));
			} else {
				progressParts.push(this.dim("○"));
			}
		}
		lines.push(padToWidth(boxLine(progressParts.join(" "))));
		lines.push(padToWidth(emptyBoxLine()));

		const q = this.questions[this.currentIndex];
		const questionText = `${this.bold("Q:")} ${q.question}`;
		const wrappedQuestion = wrapTextWithAnsi(questionText, contentWidth);
		for (const line of wrappedQuestion) {
			lines.push(padToWidth(boxLine(line)));
		}

		if (q.context) {
			lines.push(padToWidth(emptyBoxLine()));
			const contextText = this.gray(`> ${q.context}`);
			const wrappedContext = wrapTextWithAnsi(contextText, contentWidth - 2);
			for (const line of wrappedContext) {
				lines.push(padToWidth(boxLine(line)));
			}
		}

		lines.push(padToWidth(emptyBoxLine()));

		const answerPrefix = this.bold("A: ");
		const editorWidth = contentWidth - 4 - 3;
		const editorLines = this.editor.render(editorWidth);
		for (let i = 1; i < editorLines.length - 1; i++) {
			if (i === 1) {
				lines.push(padToWidth(boxLine(answerPrefix + editorLines[i])));
			} else {
				lines.push(padToWidth(boxLine("   " + editorLines[i])));
			}
		}

		lines.push(padToWidth(emptyBoxLine()));

		if (this.showingConfirmation) {
			lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));
			const confirmMsg = `${this.yellow("Submit all answers?")} ${this.dim("(Enter/y to confirm, Esc/n to cancel)")}`;
			lines.push(padToWidth(boxLine(truncateToWidth(confirmMsg, contentWidth))));
		} else {
			lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));
			const controls = `${this.dim("Tab/Enter")} next · ${this.dim("Shift+Tab")} prev · ${this.dim("Shift+Enter")} newline · ${this.dim("Esc")} cancel`;
			lines.push(padToWidth(boxLine(truncateToWidth(controls, contentWidth))));
		}
		lines.push(padToWidth(this.dim("╰" + horizontalLine(boxWidth - 2) + "╯")));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	let running = false;
	const answerHandler = async (ctx: ExtensionContext) => {
		if (ctx.mode !== "tui" || !ctx.hasUI) {
			ctx.ui.notify("answer requires interactive mode", "error");
			return;
		}

		if (!ctx.model) {
			ctx.ui.notify("No model selected", "error");
			return;
		}

		if (!ctx.isIdle()) {
			ctx.ui.notify("Wait for the current turn to finish before /answer", "error");
			return;
		}
		const model = ctx.model;
		const sessionId = ctx.sessionManager.getSessionId();
		const leafId = ctx.sessionManager.getLeafId();
		const assertCurrent = () => {
			if (ctx.sessionManager.getSessionId() !== sessionId || ctx.sessionManager.getLeafId() !== leafId ||
				ctx.model?.provider !== model.provider || ctx.model?.id !== model.id || !ctx.isIdle())
				throw new Error("Session branch or model changed during /answer; rerun it before submitting.");
		};
		const branch = ctx.sessionManager.getBranch();
		let lastAssistantText: string | undefined;

		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "message") {
				const msg = entry.message;
				if ("role" in msg && msg.role === "assistant") {
					if (msg.stopReason !== "stop") {
						ctx.ui.notify(`Last assistant message incomplete (${msg.stopReason})`, "error");
						return;
					}
					const textParts = msg.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text);
					lastAssistantText = textParts.join("\n");
					break; // Never fall back to older questions after an empty final response.
				}
			}
		}

		if (!lastAssistantText?.trim() || lastAssistantText.length > 128 * 1024) {
			ctx.ui.notify("Latest assistant response has no text or is too large to extract safely", "error");
			return;
		}

		const outcome = await ctx.ui.custom<ExtractionOutcome>((tui, theme, _kb, done) => {
			const loader = new BorderedLoader(tui, theme, `Extracting questions using ${model.id}...`);
			let finished = false;
			const finish = (value: ExtractionOutcome) => { if (!finished) { finished = true; done(value); } };
			loader.onAbort = () => finish({ kind: "cancelled" });
			void extractQuestions(ctx.modelRegistry, model, lastAssistantText!, loader.signal).then(finish);
			return loader;
		});

		if (outcome.kind === "error") {
			ctx.ui.notify(outcome.message, "error");
			return;
		}
		if (outcome.kind === "cancelled") {
			ctx.ui.notify("Cancelled", "info");
			return;
		}

		assertCurrent();
		const extractionResult = outcome.result;
		if (extractionResult.questions.length === 0) {
			ctx.ui.notify("No questions found in the last message", "info");
			return;
		}

		const answersResult = await ctx.ui.custom<string | null>((tui, _theme, _kb, done) => {
			return new QnAComponent(extractionResult.questions, tui, done);
		});

		if (answersResult === null) {
			ctx.ui.notify("Cancelled", "info");
			return;
		}

		assertCurrent();
		pi.sendUserMessage(`I answered your questions:\n\n${answersResult}`);
	};

	pi.registerCommand("answer", {
		description: "Extract questions from last assistant message into interactive Q&A",
		handler: async (_args, ctx) => {
			if (running) { ctx.ui.notify("/answer is already running", "info"); return; }
			running = true;
			try { await answerHandler(ctx); }
			catch (error) {
				// Our own state-guard failures are safe to report; other UI/provider
				// exception payloads may contain sensitive data.
				ctx.ui.notify(error instanceof Error && error.message.startsWith("Session branch or model changed")
					? error.message : "/answer failed; retry after checking the selected model and interactive UI.", "error");
			} finally { running = false; }
		},
	});
}
