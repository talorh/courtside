// npm run docs: writes docs/admin/ (the admin area's Documentation as Markdown, scripts/docs-markdown.mjs) and
// src/features/admin/views/agent-setup-text.ts (docs/agent-setup.md as a constant the Documentation page shows).
// Run after a change to either, and commit the result; tests/features/admin/docs-export.test.ts fails while it's stale.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentSetupModule } from "./agent-setup-text.mjs";
import { docsFiles } from "./docs-markdown.mjs";

writeFileSync("src/features/admin/views/agent-setup-text.ts", agentSetupModule(readFileSync("docs/agent-setup.md", "utf8")));
// The views are TypeScript: this script runs under node --experimental-strip-types (package.json), as the browser suite does.
const { GROUPS } = await import("../src/features/admin/views/docs-groups.ts");
const { CLUB } = await import("../src/club.ts");
const out = "docs/admin";
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith(".md")) rmSync(join(out, f));
const files = docsFiles(GROUPS, CLUB.siteName);
for (const [name, body] of files) writeFileSync(join(out, name), body);
console.log(`docs: ${files.size - 1} sections written to ${out}/, and the agent instructions to src/features/admin/views/agent-setup-text.ts`);
