import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** public/_headers as { path pattern: its header lines }. */
function rules(): Map<string, string[]> {
	const out = new Map<string, string[]>();
	let current: string[] | null = null;
	for (const line of readFileSync("public/_headers", "utf8").split("\n")) {
		if (!line.trim() || line.startsWith("#")) continue;
		if (/^\s/.test(line)) current?.push(line.trim());
		else out.set(line.trim(), (current = []));
	}
	return out;
}

describe("the static files' headers", () => {
	it("every file is marked never to be indexed and never to be read as another type, as pages are", () => {
		expect(rules().get("/*")).toEqual(expect.arrayContaining(["X-Robots-Tag: noindex, nofollow", "X-Content-Type-Options: nosniff"]));
	});
	it("no file is opened up to other sites", () => {
		for (const lines of rules().values()) expect(lines.filter((l) => /^Access-Control-/i.test(l))).toEqual([]);
	});
});
