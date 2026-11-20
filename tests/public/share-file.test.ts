import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

/** share-file.js on an iPhone whose share menu answers `answer` (throws it, when it's an error). */
async function shareMenu(answer: () => Promise<void>) {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", maxTouchPoints: 5, share: answer });
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	vi.stubGlobal("window", { addEventListener: () => {} });
	vi.stubGlobal("document", { getElementById: () => null });
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	return (await import("../../public/share-file.js")) as { share: (file: File) => Promise<string> };
}
const photo = () => new File([new Uint8Array([1])], "photo.jpg", { type: "image/jpeg" });
const refused = (name: string) => async () => { throw new DOMException("refused", name); };

describe("the share menu, for saving to an iPhone's Photos", () => {
	it("a share while the menu is still open (a second tap) is left be, not shown as trouble getting the photo", async () => {
		const { share } = await shareMenu(refused("InvalidStateError"));
		expect(await share(photo())).toBe("open");
	});

	it("says whether it was shared, closed, or needs another tap, and passes on anything else", async () => {
		expect(await (await shareMenu(async () => {})).share(photo())).toBe("shared");
		vi.resetModules();
		expect(await (await shareMenu(refused("AbortError"))).share(photo())).toBe("closed");
		vi.resetModules();
		expect(await (await shareMenu(refused("NotAllowedError"))).share(photo())).toBe("tap again");
		vi.resetModules();
		await expect((await shareMenu(refused("DataError"))).share(photo())).rejects.toMatchObject({ name: "DataError" });
	});
});
