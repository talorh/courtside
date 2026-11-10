// Development standards, the mechanical ones (scripts/rules.mjs), over src/ and the page scripts in public/. Run by
// `npm run check`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { commentProblems, scriptProblems, sourceProblems } from "./rules.mjs";

const walk = (dir, wanted, files = []) => {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name.startsWith(".")) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, wanted, files);
		else if (wanted(name)) files.push(relative(".", path));
	}
	return files;
};
const sources = walk("src", (name) => name.endsWith(".ts") && !name.endsWith(".d.ts"));
const scripts = walk("public", (name) => name.endsWith(".js"));
// Every file of code, tests, scripts and migrations, for its comments.
const code = ["src", "public", "scripts", "tests", "migrations", "maintenance"].flatMap((dir) =>
	walk(dir, (name) => /\.(ts|js|mjs|css|sql)$/.test(name) && !name.endsWith(".d.ts") && name !== "stream-sdk.js"));
const problems = [
	...sources.flatMap((path) => sourceProblems(path, readFileSync(path, "utf8"))),
	...scripts.flatMap((path) => scriptProblems(path, readFileSync(path, "utf8"))),
	...code.flatMap((path) => commentProblems(path, readFileSync(path, "utf8"))),
];
for (const p of problems) console.error(`FAIL ${p}`);
console.log(`check-rules: ${sources.length} source files and ${scripts.length} page scripts checked`);
process.exit(problems.length ? 1 : 0);
