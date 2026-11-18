import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The zone's rules (infra/zone/) can sit in a zone the club already uses for its own website, when the site is on a
// subdomain: every rule matches the site's own hostname alone, so the club's other hostnames are never touched.
const rules = (file: string): Array<{ ref: string; description: string; expression: string; action_parameters?: unknown }> =>
	JSON.parse(readFileSync(`infra/zone/${file}`, "utf8")).rules;

describe("the zone rules a club applies", () => {
	for (const file of ["waf-custom-rules.json", "waf-managed.json", "rate-limit-rules.json", "redirect-rules.json", "cache-rules.json"]) {
		it(`${file}: every rule matches the site's own hostname only`, () => {
			for (const rule of rules(file)) expect(rule.expression, rule.description).toMatch(/^\(http\.host eq "<domain>"( and .+)?\)$/);
		});
	}

	it("gives every rule its own ref, so a change to one keeps its id (Terraform and cf alike)", () => {
		const refs = ["waf-custom-rules.json", "waf-managed.json", "rate-limit-rules.json", "redirect-rules.json", "cache-rules.json"].flatMap((f) => rules(f).map((r) => r.ref));
		for (const ref of refs) expect(ref).toMatch(/^<worker>_[a-z_]+$/);
		expect(new Set(refs).size).toBe(refs.length);
	});

	it("sends plain HTTP to the site's own address, and keeps phones from holding an old script for hours", () => {
		expect(JSON.stringify(rules("redirect-rules.json")[0]!.action_parameters)).toContain('concat(\\"https://<domain>\\"');
		expect(rules("cache-rules.json")[0]!.action_parameters).toEqual({ browser_ttl: { mode: "respect_origin" } });
	});
});
