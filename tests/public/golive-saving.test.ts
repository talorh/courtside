import { describe, expect, it } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { savingPanel } from "../../public/golive-saving.js";

// Go live's Saving panel (public/golive-saving.js) after End game, on a stand-in card: what it says while the last of the
// recording goes up. With minutes still only on this phone, the site waits 12 hours for them (recording-save-service.ts),
// so a closed page can still send them; with none, it's just to keep the page open.
function panel() {
	const text = { innerHTML: "", textContent: "" }, bar = { max: 0, value: 0, hidden: false };
	const box = { hidden: true, scrollIntoView() {}, querySelector: () => bar };
	const card = { querySelector: (sel: string) => (sel === "[data-saving]" ? box : text) };
	return { saving: savingPanel(card), text };
}

describe("the Saving panel's words", () => {
	it("minutes still on this phone: keep the page open, and if it closes, Go live on this phone within 12 hours of End game sends them", () => {
		const { saving, text } = panel();
		saving.progress({ totalParts: 40, uploadedParts: 20, waitingBytes: 200_000_000 });
		expect(text.innerHTML).toBe("<b>Saving the video…</b> Keep this page open until it says Saved: about 10 minutes of the game are still only on this phone. 200 MB to go. On Wi-Fi it's quicker. Page closed before then? Open Go live on this phone again within 12 hours of End game and tap <b>Save what was recorded</b>: they're sent first.");
	});
	it("sending keeping up: just keep the page open", () => {
		const { saving, text } = panel();
		saving.progress({ totalParts: 40, uploadedParts: 39, waitingBytes: 8_000_000 });
		expect(text.innerHTML).toBe("<b>Saving the video…</b> Keep this page open. 8 MB to go.");
	});
	it("after Carry on: what an earlier part still has to send counts in what's to go", () => {
		const { saving, text } = panel();
		saving.progress({ totalParts: 40, uploadedParts: 40, waitingBytes: 0, earlierBytes: 12_000_000 });
		expect(text.innerHTML).toBe("<b>Saving the video…</b> Keep this page open. 12 MB to go.");
	});
});
