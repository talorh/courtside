import { describe, expect, it } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { buttonRunner, plainError } from "../../public/golive-run.js";

const goLive = { textContent: "\n Go live ", disabled: false };

describe("plainError (Go live's buttons)", () => {
	it("a request that never got through says so in plain words, in every browser's wording", () => {
		const words = "Couldn't reach the site: the signal may be weak. Check you have signal, then tap Go live again.";
		for (const message of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
			expect(plainError(new TypeError(message), goLive)).toBe(words);
		}
		expect(plainError(new DOMException("The operation timed out.", "TimeoutError"), goLive)).toBe(words);
	});

	it("anything else keeps its own words, a slip in the page's code included", () => {
		expect(plainError(new Error("This game is already being filmed from another phone or tab."), goLive)).toBe("This game is already being filmed from another phone or tab.");
		expect(plainError(new TypeError("undefined is not a function"), goLive)).toBe("undefined is not a function");
	});
});

describe("buttonRunner", () => {
	it("disables the button while it works, then says what went wrong and frees the button", async () => {
		const said: string[] = [];
		const run = buttonRunner((text: string) => said.push(text));
		const seen: boolean[] = [];
		await run(goLive, async () => { seen.push(goLive.disabled); throw new TypeError("Load failed"); });
		expect(seen).toEqual([true]);
		expect(goLive.disabled).toBe(false);
		expect(said).toEqual(["Couldn't reach the site: the signal may be weak. Check you have signal, then tap Go live again."]);
	});
});
