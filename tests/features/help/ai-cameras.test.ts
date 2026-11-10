import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

// Help's section on AI tracking cameras: one can live stream to the site only if its app streams to a custom RTMPS
// server (XbotGo's does and Trackd's doesn't yet, two examples of many at the time of writing), and the steps for streaming from an external app.

describe("Help: AI tracking cameras", () => {
	const help = async (role: string) => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Sam', ?)").bind(deps.team.id, role).run();
		return (await makeClient(deps, "p@x.com")("/help")).text();
	};
	it("tells whoever films that the camera's app must support RTMPS, with XbotGo as one that does and Trackd as one that doesn't yet, at the time of writing", async () => {
		const page = await help("filmer");
		expect(page).toContain('<details class="panel faq" id="ai-cameras"><summary>Filming with an AI tracking camera (XbotGo, Trackd and others)</summary>');
		const section = page.slice(page.indexOf('id="ai-cameras"'), page.indexOf("</details>", page.indexOf('id="ai-cameras"')));
		expect(section).toContain("<b>To live stream, the camera's app must support RTMPS</b>");
		expect(section).toContain("a <b>custom RTMPS server</b> with a <b>stream key</b>");
		expect(section).toContain("<li><b>XbotGo: yes, at the time of writing.</b>");
		expect(section).toContain("two examples of\nmany, as they stood at the time of writing");
		expect(section).toContain("<li><b>Trackd: not yet, at the time of writing.</b> Its app streams only to Trackd's own service; that may change.");
		expect(section).toContain("then use <b>Upload video</b> after the game");
		// The steps, as Go live has them.
		expect(section).toContain("tap the green <b>Use an external app instead</b>");
		expect(section).toContain("Copy the <b>Server</b> and the <b>Stream key</b>");
		expect(section).toContain("tap <b>End game</b>");
		expect(section).toContain("about half a minute behind");
		expect(section).toContain("under a minute");
		// After Live streaming's own sections.
		expect(page.indexOf('id="live-browser"')).toBeLessThan(page.indexOf('id="ai-cameras"'));
		// Go live's link lands on it.
		expect(page).toContain('id="ai-cameras"');
	});
	it("isn't shown to Watch only, who doesn't film; a team manager's own part points to it", async () => {
		expect(await help("watcher")).not.toContain('id="ai-cameras"');
		const manager = await help("manager");
		expect(manager).toContain('id="ai-cameras"');
		expect(manager).toContain('An AI tracking camera? <a href="#ai-cameras">Filming with an AI tracking camera</a> says which can live stream.');
	});
});
