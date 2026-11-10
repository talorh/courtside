// "Are you sure" before every delete (every delete and remove): Delete opens the
// question in place; Keep it closes it and posts nothing; Yes posts once, however many taps.
import { photoPageManager, PHOTO } from "./pages.mjs";

const ALL = ["android", "iphone", "firefox"];
const DELETE = `POST /photos/${PHOTO.id}/delete`;

export const scenarios = [
	{
		name: "confirm: Delete asks, Keep it closes the question and deletes nothing",
		phones: ALL,
		async run(t) {
			t.harness.page("/photo", () => photoPageManager());
			await t.page.goto(`${t.harness.url}/photo`);
			await t.page.click("details.confirm > summary");
			await t.until(() => t.page.locator(".confirmpanel").isVisible(), "the question");
			t.check((await t.text(".confirmpanel p")).startsWith("Delete this photo?"), "the question and what it means");
			await t.page.click(".confirmpanel [data-keep]");
			await t.until(async () => !(await t.page.locator(".confirmpanel").isVisible()), "the question to close");
			t.check(t.harness.calls(DELETE).length === 0, "nothing posted");
		},
	},
	{
		name: "confirm: Yes deletes, once, however many taps",
		phones: ALL,
		async run(t) {
			t.harness.page("/photo", () => photoPageManager());
			t.harness.page("/photos", () => "<!doctype html><h1>Photos</h1>");
			// The site is slow to answer (a weak signal), and the second tap comes while the first is on its way.
			t.harness.answer(DELETE, () => ({ delayMs: 1500, then: { status: 303, location: "/photos" } }));
			await t.page.goto(`${t.harness.url}/photo`);
			await t.page.click("details.confirm > summary");
			await t.page.evaluate(async () => {
				const yes = document.querySelector(".confirmpanel .btn.danger");
				yes.click();
				await new Promise((resolve) => setTimeout(resolve, 200));
				yes.click();
			});
			await t.until(async () => (await t.text("h1")) === "Photos", "the Photos page after the delete");
			t.check(t.harness.calls(DELETE).length === 1, `one post (${t.harness.calls(DELETE).length})`);
			t.check(new URLSearchParams(t.harness.calls(DELETE)[0].body.toString()).get("confirm") === "yes", "sent with confirm=yes");
		},
	},
];
