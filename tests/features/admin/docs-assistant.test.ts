import { describe, expect, it } from "vitest";
import { DOCS_DAILY_QUESTIONS, pickSections } from "../../../src/features/admin/docs-assistant.ts";
import { docSections } from "../../../src/features/admin/docs-knowledge.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { addMember } from "../../helpers/two-teams.ts";

const ask = (question: string) => jsonBody({ question });

describe("what the Documentation AI assistant knows", () => {
	it("is every section of the Documentation, numbered as the page numbers them, as plain text", () => {
		const all = docSections();
		expect(all).toHaveLength(29);
		expect(all.map((s) => s.n)).toEqual(all.map((_, i) => i + 1));
		const fixture = all.find((s) => s.id === "fixture")!;
		expect(fixture).toMatchObject({ n: 9, title: "The fixture and PlayHQ" });
		expect(fixture.text).toContain("api.playhq.com/graphql");
		// A table's rows stay rows; a diagram is its description and caption.
		expect(fixture.text).toContain("The league (VJBL) | every 8 hours |");
		expect(fixture.text).toContain("A PlayHQ team link is read from PlayHQ's feed");
		// No markup left (the Documentation's own placeholders, such as <account id>, are words).
		for (const s of all) expect(s.text, s.id).not.toMatch(/<\/?(p|li|ul|ol|table|tr|td|th|h\d|code|b|svg|div|figure|figcaption|span|a|section|nav)\b|&(amp|lt|gt|quot|#39);/);
	});
});

describe("choosing the sections to answer from", () => {
	it("finds the sections a question is about", () => {
		expect(pickSections("How does PlayHQ keep the fixture up to date?")[0]!.id).toBe("fixture");
		expect(pickSections("What happens on the roster when a family is away injured?")[0]!.id).toBe("roster");
		expect(pickSections("Where does the exchange rate for costs come from?").map((s) => s.id)).toContain("admin");
		expect(pickSections("How do I restore last night's backup?").map((s) => s.id)).toContain("recovery");
		// "set" finds Setting up a computer, and "broken" finds When something goes wrong.
		expect(pickSections("How do I set up a new computer to work on the site?").map((s) => s.id)).toContain("setup");
		expect(pickSections("A deploy has broken the live site. What should I do?").map((s) => s.id)).toContain("recovery");
		expect(pickSections("What is the branching strategy?").map((s) => s.id)).toContain("releases");
	});
	it("takes a few sections at most, and none for a question about nothing it covers", () => {
		expect(pickSections("PlayHQ fixture roster costs photos video sign in backup").length).toBeLessThanOrEqual(4);
		expect(pickSections("zzzz qqqq")).toEqual([]);
	});
});

describe("asking the Documentation AI assistant", () => {
	it("answers an admin from the sections it picked, in plain text, and names them", async () => {
		const deps = createTestDeps();
		deps.ai.reply = "PlayHQ is read **every 8 hours** — and hourly while a tournament is on.";
		const res = await makeClient(deps)("/admin/docs/ask", ask("How often is PlayHQ checked?"));
		expect(res.status).toBe(200);
		const { data } = await res.json() as { data: { answer: string; sources: Array<{ id: string; n: number; title: string }> } };
		expect(data.answer).toBe("PlayHQ is read every 8 hours, and hourly while a tournament is on.");
		expect(data.sources[0]).toEqual({ id: "fixture", n: 9, title: "The fixture and PlayHQ" });
		const [asked] = deps.ai.explained;
		expect(asked!.question).toBe("How often is PlayHQ checked?");
		expect(asked!.system).toContain("Documentation AI assistant");
		expect(asked!.system).toContain("9. The fixture and PlayHQ");
		expect(asked!.system).toContain("api.playhq.com/graphql");
	});
	it("says when the documentation doesn't cover it, without asking the AI", async () => {
		const deps = createTestDeps();
		const { data } = await (await makeClient(deps)("/admin/docs/ask", ask("zzzz qqqq"))).json() as { data: { answer: string; sources: unknown[] } };
		expect(data.sources).toEqual([]);
		expect(data.answer).toMatch(/doesn't cover that/);
		expect(deps.ai.explained).toHaveLength(0);
	});
	it("is for site admins only", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "parent@x.com", "manager", "Pat");
		expect((await makeClient(deps, "parent@x.com")("/admin/docs/ask", ask("How often is PlayHQ checked?"))).status).toBe(404);
	});
	it(`takes ${DOCS_DAILY_QUESTIONS} questions an admin a day, refuses an empty one, and says so kindly when the AI is down`, async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		expect((await client("/admin/docs/ask", ask(""))).status).toBe(400);
		for (let i = 0; i < DOCS_DAILY_QUESTIONS; i++) expect((await client("/admin/docs/ask", ask("How often is PlayHQ checked?"))).status).toBe(200);
		expect((await client("/admin/docs/ask", ask("How often is PlayHQ checked?"))).status).toBe(429);
		const fresh = createTestDeps();
		fresh.ai.down = true;
		const { data } = await (await makeClient(fresh)("/admin/docs/ask", ask("How often is PlayHQ checked?"))).json() as { data: { answer: string } };
		expect(data.answer).toMatch(/can't answer just now/);
	});
	it("sits at the top of the Documentation, with its own script", async () => {
		const page = await (await makeClient(createTestDeps())("/admin/docs")).text();
		expect(page).toContain('<section class="panel docs-ai" aria-labelledby="docs-ai-h"><h2 id="docs-ai-h">Documentation AI assistant</h2>');
		expect(page).toContain('<script type="module" src="/docs-ask.js"></script>');
		expect(page.indexOf('class="panel docs-ai"')).toBeLessThan(page.indexOf('class="panel docsec"'));
	});
});

describe("the AI coding agent's instructions", () => {
	it("are the repository's docs/agent-setup.md, word for word, so the page and the file can't drift apart", async () => {
		const { readFileSync } = await import("node:fs");
		const page = await (await makeClient(createTestDeps())("/admin/docs")).text();
		const shown = /<pre class="docs-cmd docs-agent" id="agent-md"><code>([\s\S]*?)<\/code><\/pre>/.exec(page)![1]!
			.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
		expect(shown).toBe(readFileSync("docs/agent-setup.md", "utf8"));
	});
});
