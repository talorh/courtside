// npm run e2e: the browser tests (tests/e2e/) inside the Playwright image, so WebKit (the iPhone's engine) runs on this
// Fedora box too. The repo is mounted read-only; screenshots of failures go to e2e-out/ (git-ignored).
// `npm run e2e -- upright` runs the scenarios whose names have that word; PHONES=iphone npm run e2e picks phones.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const VERSION = "1.56.1";
const IMAGE = `mcr.microsoft.com/playwright:v${VERSION}-noble`;
const repo = resolve(import.meta.dirname, "..");
// The browsers come from the image and the driver from node_modules: they must be the same Playwright release.
const installed = JSON.parse(readFileSync(resolve(repo, "node_modules/playwright/package.json"), "utf8")).version;
if (installed !== VERSION) {
	console.error(`e2e: node_modules has playwright ${installed} but the image is ${VERSION}. Run npm install, or change both together.`);
	process.exit(1);
}
const out = resolve(repo, "e2e-out");
mkdirSync(out, { recursive: true });
const env = process.env.PHONES ? ["-e", `PHONES=${process.env.PHONES}`] : [];
const run = spawnSync("podman", [
	"run", "--rm", "--init", "--shm-size=1g", ...env, "-v", `${repo}:/repo:ro,z`, "-v", `${out}:/out:z`, "-w", "/repo", IMAGE,
	"node", "--no-warnings", "tests/e2e/run.mjs", ...process.argv.slice(2),
], { stdio: "inherit" });
if (run.error) console.error(`e2e: couldn't start podman: ${run.error.message}`);
process.exit(run.status ?? 1);
