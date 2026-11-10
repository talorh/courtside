import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: plain JS scripts (scripts/), tested here on their own.
import { agentSetupModule } from "../../../scripts/agent-setup-text.mjs";
// @ts-expect-error: plain JS scripts (scripts/), tested here on their own.
import { diagramStyle, docsFiles, sectionMarkdown } from "../../../scripts/docs-markdown.mjs";
import { CLUB } from "../../../src/club.ts";
import { GROUPS } from "../../../src/features/admin/views/docs-groups.ts";

const FIGURE = '<figure class="dg"><div class="dgscroll"><svg viewBox="0 0 100 50" width="100" height="50" role="img" aria-labelledby="dg-x-t dg-x-d" class="dg-w600">'
	+ '<title id="dg-x-t">The flow</title><desc id="dg-x-d">What happens.</desc><g class="dg-box k-worker"><rect x="1" y="1" width="20" height="10"/></g></svg></div><figcaption>A caption.</figcaption></figure>';

describe("the admin Documentation as Markdown (docs/admin/, npm run docs)", () => {
	it("turns the page's blocks into Markdown: headings, paragraphs, lists, tables, commands, and a diagram in words when it has nowhere to put a file", () => {
		const html = '<h3>Two <code>things</code></h3><p>A <b>bold</b> word &amp; a <code>name</code>.</p><ul class="docs-points"><li>One</li><li>Two</li></ul>'
			+ '<div class="tablewrap"><table class="docs-table"><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody><tr><th scope="row">x</th><td>y | z</td></tr></tbody></table></div>'
			+ `<pre class="docs-cmd"><code>npm run check\ncf auth whoami</code></pre>${FIGURE}`;
		expect(sectionMarkdown(html)).toBe([
			"### Two `things`", "A **bold** word & a `name`.", "- One\n- Two", "| A | B |\n| --- | --- |\n| x | y \\| z |",
			"```\nnpm run check\ncf auth whoami\n```", "> **The flow.** What happens. A caption.",
		].join("\n\n"));
	});

	it("writes each diagram as its own SVG, styled as the page styles it in the club's colours, and shows it in the Markdown", () => {
		const files = new Map<string, string>();
		const style = diagramStyle(".dg text{font-family:var(--body)}\n.k-worker rect{fill:var(--bar);stroke:var(--club)}\n.dg{margin:4px}\n", { bar: "#111111", button: "#222222", soft: "#333333" });
		expect(style).toBe(".dg text{font-family:system-ui, -apple-system, 'Segoe UI', sans-serif}\n.k-worker rect{fill:#111111;stroke:#222222}");
		const md = sectionMarkdown(`<p>Before.</p>${FIGURE}`, { dir: "diagrams", prefix: "07", style, files });
		expect(md).toBe("Before.\n\n![The flow](diagrams/07-1.svg)\n\n*A caption.*");
		const svg = files.get("diagrams/07-1.svg")!;
		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"')).toBe(true);
		expect(svg).toContain(' class="dg"');
		expect(svg).toContain(`<style>${style}</style>`);
		expect(svg).toContain('<rect width="100" height="50" fill="#FFFFFF"/>');
		expect(svg).toContain('<g class="dg-box k-worker">');
	});

	it("is on disk as npm run docs last wrote it: every section, numbered as the page numbers them, the index and the diagrams", () => {
		const files = docsFiles(GROUPS, CLUB.siteName, readFileSync("public/docs.css", "utf8"), CLUB.colors.light) as Map<string, string>;
		const sections = GROUPS.reduce((n, g) => n + g.sections.length, 0);
		expect([...files.keys()].filter((k) => k.endsWith(".md"))).toHaveLength(sections + 1);
		expect([...files.keys()].filter((k) => k.endsWith(".svg")).length).toBeGreaterThan(10);
		const onDisk = [...readdirSync("docs/admin").filter((f) => f.endsWith(".md")), ...readdirSync("docs/admin/diagrams").map((f) => `diagrams/${f}`)].sort();
		expect(onDisk).toEqual([...files.keys()].sort());
		for (const [name, body] of files) expect(readFileSync(`docs/admin/${name}`, "utf8"), `${name} is stale: run npm run docs`).toBe(body);
		expect(files.get("README.md")).toContain("[Environments and releases](");
	});

	it("carries the agent instructions into the Documentation page as a generated constant, current with the file", () => {
		expect(existsSync("src/features/admin/views/agent-setup-text.ts")).toBe(true);
		expect(readFileSync("src/features/admin/views/agent-setup-text.ts", "utf8")).toBe(agentSetupModule(readFileSync("docs/agent-setup.md", "utf8")));
	});
});
