import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The scripts are plain Node, run by hand or by npm run release: nothing else imports them, so a slip in one (a name
// declared twice, say) would first show when a release runs. Node parses each here.
describe("the scripts parse", () => {
	for (const file of readdirSync("scripts").filter((f) => f.endsWith(".mjs"))) {
		it(`scripts/${file}`, () => {
			expect(() => execFileSync("node", ["--check", `scripts/${file}`], { stdio: "pipe" })).not.toThrow();
		});
	}
});
