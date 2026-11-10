import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/app/config.ts";

const full = {
	ACCOUNT_ID: "a", STREAM_CUSTOMER_CODE: "c",
	R2_BUCKET: "b", STREAM_KEY_ID: "k", STREAM_KEY_JWK: "j",
	R2_ACCESS_KEY_ID: "r", R2_SECRET_ACCESS_KEY: "s", STREAM_API_TOKEN: "t", DEV_AUTH_EMAIL: "",
	TURNSTILE_SITE_KEY: "0x4", TURNSTILE_SECRET: "ts",
};

describe("loadConfig", () => {
	it("maps env to typed config, empty dev email becomes null", () => {
		const config = loadConfig(full);
		expect(config.r2Bucket).toBe("b");
		expect("teamId" in config).toBe(false); // the team comes from each request now, not the Worker's config
		expect(config.devAuthEmail).toBeNull();
	});
	it("lists every missing or empty value", () => {
		expect(() => loadConfig({ ...full, STREAM_KEY_ID: "", R2_BUCKET: undefined })).toThrow(ConfigError);
		expect(() => loadConfig({ ...full, R2_BUCKET: "" })).toThrow(/R2_BUCKET/);
		expect(() => loadConfig({ ...full, STREAM_API_TOKEN: "" })).toThrow(/STREAM_API_TOKEN/);
		// The sign-in page's Turnstile: without its secret, no code could be checked, so the Worker doesn't start.
		expect(() => loadConfig({ ...full, TURNSTILE_SECRET: "" })).toThrow(/TURNSTILE_SECRET/);
	});
	it("has nothing of Access any more (the site's own sign-in)", () => {
		const config = loadConfig({ ...full, ACCESS_TEAM_DOMAIN: "courtside.cloudflareaccess.com", ACCESS_AUD: "local" });
		expect(Object.keys(config).filter((k) => /^access/i.test(k))).toEqual([]);
	});
	it("is staging only when STAGING is 1 (docs/runbooks/staging.md)", () => {
		expect(loadConfig(full).staging).toBe(false);
		expect(loadConfig({ ...full, STAGING: "1" }).staging).toBe(true);
		expect(loadConfig({ ...full, STAGING: "0" }).staging).toBe(false);
	});
	it("keeps a dev email when set", () => {
		expect(loadConfig({ ...full, DEV_AUTH_EMAIL: "t@x.y" }).devAuthEmail).toBe("t@x.y");
	});
	// Local dev's secrets come only from .dev.vars, made by copying the example (runbook, Local development); an empty one
	// stops the Worker at its first request (STREAM_API_TOKEN was blank).
	it("the .dev.vars example gives every secret the Worker declares a value, so cf dev starts", () => {
		const secrets = [...readFileSync("cloudflare.config.ts", "utf8").matchAll(/(\w+): bindings\.secret\(\)/g)].map((m) => m[1]);
		const example = new Map(readFileSync(".dev.vars.example", "utf8").split("\n").filter((l) => /^\w+=/.test(l))
			.map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
		expect(secrets).toHaveLength(7);
		expect(secrets.filter((name) => !example.get(name!))).toEqual([]);
	});
});
