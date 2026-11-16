import { afterEach, describe, expect, it, vi } from "vitest";

// "Are you sure" (public/confirm.js): Keep it closes the question; Yes posts once, however many taps; it works again
// after Back; and a question put on the page after it loaded (a photo swiped to) works like any other.

type Happening = { target: unknown; preventDefault: () => void };
type Listener = (e: Happening) => void;
type Heard = Record<string, Listener[]>;
const hear = (heard: Heard) => (type: string, fn: Listener) => { (heard[type] ??= []).push(fn); };

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.resetModules();
});

/** A question as confirmButton() renders it: its details, its form, and the form's Yes and Keep it. */
function makeQuestion() {
	const details = { open: true };
	const dataset: Record<string, string> = {};
	const yes = { disabled: false, heard: {} as Heard, closest: (q: string): unknown => (q === ".confirm form" ? form : null) };
	const keep = { disabled: false, heard: {} as Heard, addEventListener(type: string, fn: Listener) { hear(keep.heard)(type, fn); },
		closest: (q: string): unknown => (q === ".confirm [data-keep]" ? keep : q === "details" ? details : q === ".confirm form" ? form : null) };
	const form = { dataset, heard: {} as Heard, addEventListener(type: string, fn: Listener) { hear(form.heard)(type, fn); },
		querySelectorAll: (q: string) => (q.includes(":not([data-keep])") ? [yes] : [yes, keep]), closest: (q: string): unknown => (q === ".confirm form" ? form : null) };
	return { details, form, yes, keep };
}

/** A page standing in for the browser's: what happens on an element goes to its own listeners, then up to the document's. */
async function open(questionsAtLoad = 1) {
	const onDocument: Heard = {}, onWindow: Heard = {};
	const questions: Array<ReturnType<typeof makeQuestion>> = [];
	const question = () => { const made = makeQuestion(); questions.push(made); return made; };
	const all = (q: string) => (q === ".confirm form" ? questions.map((x) => x.form) : q === ".confirm [data-keep]" ? questions.map((x) => x.keep) : []);
	vi.stubGlobal("document", { querySelectorAll: all, addEventListener: hear(onDocument) });
	vi.stubGlobal("window", { addEventListener: hear(onWindow) });
	for (let i = 0; i < questionsAtLoad; i++) question();
	vi.useFakeTimers();
	vi.resetModules();
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	await import("../../public/confirm.js");
	/** `type` happens on `target`: true when something stopped it (a post that isn't sent). */
	const fire = (type: string, target: { heard?: Heard }) => {
		const e = { target, preventDefault: vi.fn() };
		for (const fn of [...(target.heard?.[type] ?? []), ...(onDocument[type] ?? [])]) fn(e);
		vi.runAllTimers();
		return e.preventDefault.mock.calls.length > 0;
	};
	return { question, first: questions[0]!, fire, back: (persisted: boolean) => (onWindow.pageshow ?? []).forEach((fn) => fn({ persisted } as unknown as Happening)) };
}

describe("the confirm question", () => {
	it("posts once, however many taps, greying out Yes", async () => {
		const page = await open();
		expect(page.fire("submit", page.first.form)).toBe(false);
		expect([page.first.yes.disabled, page.first.keep.disabled]).toEqual([true, false]);
		expect(page.fire("submit", page.first.form)).toBe(true);
	});
	it("Keep it closes the question and posts nothing", async () => {
		const page = await open();
		expect(page.fire("click", page.first.keep)).toBe(false);
		expect([page.first.details.open, page.first.form.dataset.sent]).toEqual([false, undefined]);
	});
	it("works again when Back brings the page from the browser's cache", async () => {
		const page = await open();
		page.fire("submit", page.first.form);
		page.back(false);
		expect(page.first.yes.disabled).toBe(true);
		page.back(true);
		expect([page.first.yes.disabled, page.first.form.dataset.sent]).toEqual([false, undefined]);
		expect(page.fire("submit", page.first.form)).toBe(false);
	});
	it("a question put on the page after it loaded works the same: Keep it closes it, Yes posts once", async () => {
		const page = await open();
		const later = page.question();
		expect(page.fire("click", later.keep)).toBe(false);
		expect(later.details.open).toBe(false);
		expect(page.fire("submit", later.form)).toBe(false);
		expect(later.yes.disabled).toBe(true);
		expect(page.fire("submit", later.form)).toBe(true);
		// Each question keeps its own count: the first hasn't been answered.
		expect(page.fire("submit", page.first.form)).toBe(false);
	});
	it("on a page with no question at first, one added later still works", async () => {
		const page = await open(0);
		const later = page.question();
		page.fire("click", later.keep);
		expect(later.details.open).toBe(false);
		expect([page.fire("submit", later.form), page.fire("submit", later.form)]).toEqual([false, true]);
	});
	it("leaves every other form and button alone, and a tap that lands on no element", async () => {
		const page = await open();
		const other = { heard: {} as Heard, dataset: {} as Record<string, string>, closest: () => null };
		expect([page.fire("submit", other), page.fire("submit", other), page.fire("click", other), page.fire("click", {})]).toEqual([false, false, false, false]);
		expect(other.dataset.sent).toBeUndefined();
		// A tap on Yes itself isn't Keep it.
		page.fire("click", page.first.yes);
		expect(page.first.details.open).toBe(true);
	});
});
