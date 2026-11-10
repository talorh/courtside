import { describe, expect, it } from "vitest";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

describe("Ask Virtual Sam", () => {
	it("comes first on the Help page", async () => {
		const page = await (await makeClient(createTestDeps())("/help")).text();
		expect(page).toContain('<h2 id="ask-h">Ask Virtual Sam</h2>');
		expect(page).toContain("<p>Ask anything about using the site.</p>");
		expect(page).toContain('<script type="module" src="/ask.js"></script>');
		expect(page.indexOf(">Ask Virtual Sam</h2>")).toBeLessThan(page.indexOf("What is the aim here?"));
	});
	it("is on Help, the oval Help button at the top of every page", async () => {
		const page = await (await makeClient(createTestDeps())("/games")).text();
		expect(page).toMatch(/<a class="helpbtn" href="\/help" aria-label="Help, and Ask Virtual Sam"><svg[^]*?<\/svg>Help<\/a>/);
	});
	it("answers any member from the Help page's text, as plain text", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Sam Parent', 'watcher')").bind(deps.team.id).run();
		const res = await makeClient(deps, "p@x.com")("/api/ask", jsonBody({ question: "  How do I watch?  " }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, data: { answer: "Tap Watch games and choose a game." } });
		const [{ system, question }] = deps.ai.asked;
		expect(question).toBe("How do I watch?");
		// The Help page goes in as plain text: questions, steps, no markup.
		expect(system).toContain("Q: How do I watch on the TV?");
		expect(system).toContain("31 December 2027");
		expect(system).toContain("The real Sam is the team manager, and you answer for them.");
		expect(system).not.toMatch(/<\/?(b|li|details|summary|img)\b|&amp;|&#39;/);
	});
	it("knows the iPhone fix for choosing the video sitting there: save to Files, then Choose File; and adds no fixes of its own", async () => {
		const deps = createTestDeps();
		await makeClient(deps)("/api/ask", jsonBody({ question: "iPhone photo picker just sits there" }));
		const [{ system }] = deps.ai.asked;
		expect(system).toMatch(/Q: The upload won't work\. What can I do\?\nA:\s+iPhone, and choosing the video just sits there/);
		expect(system).toContain("Save to Files → On My iPhone → Save");
		expect(system).toContain("Choose File (not Photo Library)");
		expect(system).toContain("Never add fixes of your own, such as restarting the phone");
	});
	it("knows how to install it as an app, for the asker's own phone, without the mock screens' bits", async () => {
		const deps = createTestDeps();
		const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
		const ask = (ua?: string) => makeClient(deps)("/api/ask", { ...jsonBody({ question: "How do I install it as an app?" }), headers: { "Content-Type": "application/json", ...(ua ? { "User-Agent": ua } : {}) } });
		await ask(IPHONE);
		const [{ system }] = deps.ai.asked;
		expect(system).toMatch(/Q: How to install as an app\nA:\s+Put saints\.example on your Home Screen/);
		expect(system).toMatch(/iPhone\n+- Open saints\.example in Safari and sign in\./);
		expect(system).toContain("- Scroll down and tap Add to Home Screen.");
		expect(system).toMatch(/Android\n+- Open saints\.example in Chrome and sign in\./);
		expect(system).toContain("- Tap Install app (some phones say Add to Home screen).");
		expect(system).toContain("The person asking is using an iPhone or iPad.");
		expect(system).toContain("give the ones for the asker's device");
		// The mock screens and the Install box are pictures and phone-filled bits, not words to answer from.
		expect(system).not.toMatch(/Add to Favourites|1 Video Selected|Families can watch|Install the app\n|m-row|aria-label/);
		await ask("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36");
		expect(deps.ai.asked[1]?.system).toContain("The person asking is using an Android phone.");
		await ask();
		expect(deps.ai.asked[2]?.system).not.toContain("The person asking is using");
	});
	it("says Virtual Sam can't answer just now when the AI can't, and turns away empty or huge questions", async () => {
		const deps = createTestDeps();
		deps.ai.down = true;
		const ask = (question: string) => makeClient(deps)("/api/ask", jsonBody({ question }));
		expect(((await (await ask("Where's the video?")).json()) as { data: { answer: string } }).data.answer).toContain("Virtual Sam can't answer just now.");
		expect((await ask(" ")).status).toBe(400);
		expect((await ask("x".repeat(301))).status).toBe(400);
	});
	it("takes 20 questions a day from each member, so nobody can use up the team's AI allowance", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Sam Parent', 'watcher')").bind(deps.team.id).run();
		const ask = (client: ReturnType<typeof makeClient>) => client("/api/ask", jsonBody({ question: "How do I watch?" }));
		const sam = makeClient(deps, "p@x.com");
		for (let i = 0; i < 20; i++) expect((await ask(sam)).status).toBe(200);
		const over = await ask(sam);
		expect(over.status).toBe(429);
		expect(await over.json()).toMatchObject({ ok: false, error: { message: expect.stringContaining("ask again tomorrow") } });
		expect(deps.ai.asked).toHaveLength(20);
		// Someone else, and Sam the next day, can still ask.
		expect((await ask(makeClient(deps))).status).toBe(200);
		expect((await ask(makeClient({ ...deps, now: () => new Date("2026-10-16T00:00:00Z") }, "p@x.com"))).status).toBe(200);
	});
	it("is for members only and same-site only", async () => {
		const deps = createTestDeps();
		expect((await makeClient(deps, "stranger@x.com")("/api/ask", jsonBody({ question: "Hi" }))).status).toBe(403);
		expect((await makeClient(deps)("/api/ask", { ...jsonBody({ question: "Hi" }), headers: { Origin: "https://evil.test" } })).status).toBe(403);
	});
});

describe("the helper reads the asker's own Help (one Help page, each role's topics)", () => {
	it("reads a team manager's own questions when a team manager asks, and points them to the support form when it doesn't know", async () => {
		const deps = createTestDeps();
		await makeClient(deps)("/api/ask", jsonBody({ question: "How do I add a player?" }));
		const [{ system }] = deps.ai.asked;
		expect(system).toContain("You are Virtual Sam");
		expect(system).toContain("Q: Adding the squad");
		expect(system).toContain("suggest the support form at the bottom of the Help page");
		expect(system).not.toContain("guide");
	});

	it("points only a team manager to the support form when it doesn't know; a coach asks the team manager", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'c@x.com', 'Chris', 'coach')").bind(deps.team.id).run();
		await makeClient(deps, "c@x.com")("/api/ask", jsonBody({ question: "Who do I ask about the site?" }));
		expect(deps.ai.asked[0]?.system).not.toContain("support form");
		expect(deps.ai.asked[0]?.system).toContain("suggest asking the real Sam at training");
		await makeClient(deps)("/api/ask", jsonBody({ question: "Who do I ask about the site?" }));
		expect(deps.ai.asked[1]?.system).toContain("suggest the support form at the bottom of the Help page");
	});

	it("gives Watch only its own Help (no team manager's questions, no recording), and the team's own helper elsewhere", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Sam Parent', 'watcher')").bind(deps.team.id).run();
		await makeClient(deps, "p@x.com")("/api/ask", jsonBody({ question: "How do I add a player?" }));
		const [{ system }] = deps.ai.asked;
		expect(system).not.toContain("Q: Adding the squad");
		expect(system).not.toContain("support form");
		expect(system).not.toContain("Q: Recording and uploading a game: iPhone");
		expect(system).toContain("Q: How do I watch on the TV?");
		await deps.db.prepare("INSERT INTO teams (id, name, code, season_start, status) VALUES ('g14.5-2026', 'Saints U14 Girls 14.5', 'g14.5', 2026, 'active')").run();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES ('g14.5-2026', 'jane@x.com', 'Jane', 'manager')").run();
		await makeClient(deps, { email: "jane@x.com", team: "g14.5-2026" })("/api/ask", jsonBody({ question: "How do I add a player?" }));
		const jane = deps.ai.asked[1]!.system;
		expect(jane).toContain("You are Virtual Team Manager");
		expect(jane).toContain("Saints U14 Girls 14.5");
		expect(jane).not.toMatch(/\bSam\b/);
		expect(jane).toContain("Q: Adding the squad");
	});
});
