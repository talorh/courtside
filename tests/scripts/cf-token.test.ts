import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { cfToken } from "../../scripts/deploy-config.mjs";

const home = (files: Record<string, string>) => {
	const dir = mkdtempSync(join(tmpdir(), "cf-token-"));
	mkdirSync(join(dir, ".config/cloudflare/config"), { recursive: true });
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, ".config/cloudflare/config", name), text);
	return dir;
};

describe("cfToken", () => {
	afterEach(() => { delete process.env.CF_PROFILE; });

	it("reads the login's OAuth token from cf's plaintext file, the default profile unless CF_PROFILE names one", () => {
		expect(cfToken(home({ "default.json": JSON.stringify({ oauth_token: "tok" }) }))).toBe("tok");
		process.env.CF_PROFILE = "club";
		expect(cfToken(home({ "club.json": JSON.stringify({ oauth_token: "club-tok" }) }))).toBe("club-tok");
	});

	it("says how to log in again when the login is in the OS keyring (no plaintext file)", () => {
		expect(() => cfToken(home({}))).toThrow(/cf auth login --force --no-use-keyring/);
		process.env.CF_PROFILE = "club";
		expect(() => cfToken(home({}))).toThrow(/cf auth login --profile club --force --no-use-keyring/);
	});

	it("says the same when the file has no token, and never quotes the file", () => {
		expect(() => cfToken(home({ "default.json": '{"refresh_token":"secret"}' }))).toThrow(/^(?!.*secret).*--no-use-keyring/s);
	});
});
