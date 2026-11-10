// Manage team's People: each person's Save shows only once their name or role is changed (and goes again if it's put
// back), the list's rows line up on a computer, and the page reads People (with Add a person at its foot), Who's using the
// site, End of season.
import { managePage } from "./pages.mjs";

const row = (t, email) => t.page.locator("tr", { hasText: email });
const saveShows = (t, email) => row(t, email).locator("[data-save]").isVisible();
const sideways = (t) => t.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

export const scenarios = [
	{
		name: "manage: Save shows only when a person's name or role changes, and posts the change",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/manage", managePage);
			await t.page.goto(`${t.harness.url}/manage`);
			const order = await t.page.evaluate(() => ["#people", ".people", "#addperson", "#who-h", "#season-pack"]
				.map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1));
			t.check(order.every((top, i) => top >= 0 && (i === 0 || top > order[i - 1])), `People, its list, Add a person under it, Who's using the site, End of season, in that order (${order.join(", ")})`);
			const addRow = await t.page.evaluate(() => {
				const f = document.querySelector("#addperson");
				const labels = [...f.querySelectorAll("label")].map((l) => l.getBoundingClientRect());
				const button = f.querySelector("button").getBoundingClientRect();
				return { labels: labels.length, fits: f.scrollWidth <= f.clientWidth + 1, text: f.querySelector("button").textContent, rows: new Set([...labels, button].map((r) => Math.round(r.bottom))).size };
			});
			t.check(addRow.labels === 3 && addRow.text === "Add a person" && addRow.fits, `Add a person: email, name and role with its button, nothing clipped (${JSON.stringify(addRow)})`);
			for (const email of ["dani@example.com", "dev@example.com"]) t.check(!(await saveShows(t, email)), `${email}: no Save before anything changes`);
			const name = row(t, "dani@example.com").locator('input[name="name"]');
			await name.fill("Danielle");
			await t.until(() => saveShows(t, "dani@example.com"), "Save to show once the name changes");
			t.check(!(await saveShows(t, "dev@example.com")), "only that person's Save shows");
			await name.fill("Dani");
			await t.until(async () => !(await saveShows(t, "dani@example.com")), "Save to go once the name is put back");
			await row(t, "dev@example.com").locator('select[name="role"]').selectOption("manager");
			await t.until(() => saveShows(t, "dev@example.com"), "Save to show once the role changes");
			await row(t, "dev@example.com").locator("[data-save]").click();
			await t.until(() => t.harness.calls("POST /members/3").length === 1, "Save to post the change");
			const sent = new URLSearchParams(t.harness.calls("POST /members/3")[0].body.toString());
			t.check(sent.get("role") === "manager" && sent.get("name") === "Dev", `the name and new role are sent (${sent})`);
		},
	},
	{
		name: "manage: the People list lines up on a computer and never scrolls sideways on a phone",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/manage", managePage);
			for (const width of [null, 1280]) {
				const where = width ? `${width} px wide` : "on the phone";
				if (width) await t.page.setViewportSize({ width, height: 900 });
				await t.page.goto(`${t.harness.url}/manage`);
				t.check(!(await sideways(t)), `${where}: the page doesn't scroll sideways`);
				await row(t, "dev@example.com").locator("details.confirm > summary").click();
				await t.until(() => row(t, "dev@example.com").locator(".confirmpanel .btn.danger").isVisible(), `${where}: Remove's question to open`);
				t.check(!(await sideways(t)), `${where}: with Remove's question open, the page doesn't scroll sideways`);
			}
			await t.page.reload();
			const cells = await t.page.evaluate(() => [...document.querySelectorAll(".people tbody tr")].map((tr) =>
				[...tr.children].every((td) => getComputedStyle(td).display === "table-cell" && Math.abs(td.getBoundingClientRect().height - tr.getBoundingClientRect().height) < 2)));
			t.check(cells.length === 4 && cells.every(Boolean), `on a computer each row's cells are as tall as the row, so the lines meet (${cells})`);
			await t.page.setViewportSize({ width: 1024, height: 900 });
			const fits = await t.page.evaluate(() => [...document.querySelectorAll(".people tbody tr")].map((tr) => {
				const select = tr.querySelector(".m-role select");
				const save = tr.querySelector("[data-save]").getBoundingClientRect();
				const remove = tr.querySelector("details.confirm > summary")?.getBoundingClientRect();
				return select.scrollWidth <= select.clientWidth + 1 && (!remove || Math.abs(save.top - remove.top) < save.height);
			}));
			t.check(fits.every(Boolean), `on a 1024 px computer the role shows in full and Save sits beside Remove (${fits})`);
		},
	},
];
