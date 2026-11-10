// Development standards: source files soft cap 140 lines, hard cap 160 (tests, docs, migrations excluded).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "public", "maintenance"];
const SOFT = 140, HARD = 160;
// Copied in as is from elsewhere, not written here.
const VENDORED = new Set([join("public", "stream-sdk.js")]);
// Generated, one long line each (scripts/maintenance-logo.mjs, npm run docs, npm run club -- mark).
const GENERATED = new Set([join("maintenance", "logo.ts"), join("src", "features", "admin", "views", "agent-setup-text.ts"), join("src", "ui", "club-mark-inline.ts")]);
const files = [];
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) { if (name !== "node_modules" && !name.startsWith(".")) walk(path); } // not packages or build output
		else if (/\.(ts|js)$/.test(name) && !name.endsWith(".d.ts") && !VENDORED.has(path) && !GENERATED.has(path)) files.push(path);
	}
};
ROOTS.forEach(walk);

let failed = false;
for (const file of files) {
	const text = readFileSync(file, "utf8");
	// A file ending in a newline has no extra line after it.
	const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
	if (lines > HARD) { console.error(`FAIL ${file}: ${lines} lines (hard cap ${HARD})`); failed = true; }
	else if (lines > SOFT) console.warn(`WARN ${file}: ${lines} lines (soft cap ${SOFT})`);
}
console.log(`check-loc: ${files.length} files checked`);
process.exit(failed ? 1 : 0);
