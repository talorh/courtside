import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The setup runbook's cf commands send infra/'s files with their placeholders filled in by sed: a placeholder a
// command leaves would reach Cloudflare as it is.
const runbook = readFileSync("docs/runbooks/cloudflare-setup.md", "utf8");
const commands = runbook.split("\n").filter((line) => /\$\((sed|cat) [^)]*\.json\)/.test(line));

describe("the setup runbook's cf commands", () => {
	it("are there to check", () => {
		expect(commands.length).toBeGreaterThan(10);
	});

	for (const line of commands) {
		const file = /(?:\$d\/|infra\/)([\w/-]+\.json)/.exec(line)![0].replace("$d/", "infra/zone/");
		it(`${file}: every placeholder it holds is filled in`, () => {
			const placeholders = new Set(readFileSync(file, "utf8").match(/<[a-z][^<>"]*>/g) ?? []);
			for (const p of placeholders) expect(line, `${p} in ${file}`).toContain(`s/${p}/`);
		});
	}
});
