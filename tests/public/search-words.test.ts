import { describe, expect, it } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { firstAt, forms, hasEvery, marker } from "../../public/search-words.js";

describe("what a search box's words match (Help and the Documentation)", () => {
	it("finds the singular when the plural was typed", () => {
		expect(hasEvery("The joiner runs in a Cloudflare Container.", ["containers"])).toBe(true);
		expect(hasEvery("Each family has one sign-in.", ["families"])).toBe(true);
		expect(hasEvery("The match day message", ["matches"])).toBe(true);
		expect(hasEvery("One video per game", ["videos", "games"])).toBe(true);
	});
	it("still wants every word, in any case", () => {
		expect(hasEvery("Download a photo", ["DOWNLOAD", "photo"].map((w) => w.toLowerCase()))).toBe(true);
		expect(hasEvery("Download a photo", ["download", "video"])).toBe(false);
	});
	it("leaves words that only happen to end in s alone", () => {
		expect(forms("status")).toEqual(["status"]);
		expect(forms("access")).toEqual(["access"]);
		expect(forms("this")).toEqual(["this"]);
		expect(forms("gas")).toEqual(["gas"]);
		expect(hasEvery("Not live yet", ["notes"])).toBe(false);
	});
	it("says where the first match is, by whichever form matched, and marks the longest form", () => {
		const text = "The video joiner runs in a container, one at a time.";
		expect(firstAt(text.toLowerCase(), ["containers"])).toBe(text.indexOf("container"));
		expect(firstAt(text.toLowerCase(), ["nothing"])).toBe(0);
		expect("Containers and a container".match(marker(["containers"]))).toEqual(["Containers", "container"]);
		expect("a.b and axb".match(marker(["a.b"]))).toEqual(["a.b"]);
	});
});

describe("the question a link names (#watch)", () => {
	it("reads an encoded id, and takes a hash that isn't valid encoding as it is rather than failing", async () => {
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { linkedId } = await import("../../public/search-words.js");
		expect(linkedId("#watch")).toBe("watch");
		expect(linkedId("#g%2Dplus")).toBe("g-plus");
		expect(linkedId("#50%")).toBe("50%");
		expect(linkedId("")).toBe("");
	});
});
