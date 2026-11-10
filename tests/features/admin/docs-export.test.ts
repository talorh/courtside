import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: plain JS scripts (scripts/), tested here on their own.
import { agentSetupModule } from "../../../scripts/agent-setup-text.mjs";
// @ts-expect-error: plain JS scripts (scripts/), tested here on their own.
import { docsFiles, sectionMarkdown } from "../../../scripts/docs-markdown.mjs";
import { CLUB } from "../../../src/club.ts";
import { GROUPS } from "../../../src/features/admin/views/docs-groups.ts";

describe("the admin Documentation as Markdown (docs/admin/, npm run docs)", () => {
	it("turns the page's blocks into Markdown: headings, paragraphs, lists, tables, commands and diagrams in words", () => {
		const html = '<h3>Two <code>things</code></h3><p>A <b>bold</b> word &amp; a <code>name</code>.</p><ul class="docs-points"><li>One</li><li>Two</li></ul>'
			+ '<div class="tablewrap"><table class="docs-table"><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody><tr><th scope="row">x</th><td>y | z</td></tr></tbody></table></div>'
			+ '<pre class="docs-cmd"><code>npm run check\ncf auth whoami</code></pre>'
			+ '<figure class="dg"><div class="dgscroll"><svg><title id="t">The flow</title><desc id="d">What happens.</desc></svg></div><figcaption>A caption.</figcaption></figure>';
		expect(sectionMarkdown(html)).toBe([
			"### Two `things`", "A **bold** word & a `name`.", "- One\n- Two", "| A | B |\n| --- | --- |\n| x | y \\| z |",
			"```\nnpm run check\ncf auth whoami\n```", "> **The flow.** What happens. A caption.",
		].join("\n\n"));
	});

	it("is on disk as npm run docs last wrote it: every section, numbered as the page numbers them, and the index", () => {
		const files = docsFiles(GROUPS, CLUB.siteName) as Map<string, string>;
		expect(files.size).toBe(GROUPS.reduce((n, g) => n + g.sections.length, 0) + 1);
		const onDisk = readdirSync("docs/admin").filter((f) => f.endsWith(".md")).sort();
		expect(onDisk).toEqual([...files.keys()].sort());
		for (const [name, body] of files) expect(readFileSync(`docs/admin/${name}`, "utf8"), `${name} is stale: run npm run docs`).toBe(body);
		expect(files.get("README.md")).toContain("[Environments and releases](");
	});

	it("carries the agent instructions into the Documentation page as a generated constant, current with the file", () => {
		expect(existsSync("src/features/admin/views/agent-setup-text.ts")).toBe(true);
		expect(readFileSync("src/features/admin/views/agent-setup-text.ts", "utf8")).toBe(agentSetupModule(readFileSync("docs/agent-setup.md", "utf8")));
	});
});
