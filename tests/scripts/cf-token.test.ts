import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { cfConfigDir, cfToken, keepLoginInFile } from "../../scripts/deploy-config.mjs";

const homes: string[] = [];
const home = (files: Record<string, string>, under = ".config") => {
	const dir = mkdtempSync(join(tmpdir(), "cf-token-"));
	homes.push(dir);
	mkdirSync(join(dir, under, "cloudflare/config"), { recursive: true });
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, under, "cloudflare/config", name), text);
	return dir;
};
const linux = (env: Record<string, string> = {}) => ({ env, platform: "linux" });

describe("cfToken", () => {
	afterEach(() => { for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true }); });

	it("reads the login's OAuth token from cf's plaintext file, the default profile unless CF_PROFILE names one", () => {
		expect(cfToken(home({ "default.json": JSON.stringify({ oauth_token: "tok" }) }), linux())).toBe("tok");
		expect(cfToken(home({ "club.json": JSON.stringify({ oauth_token: "club-tok" }) }), linux({ CF_PROFILE: "club" }))).toBe("club-tok");
	});

	it("looks where cf keeps its login: XDG_CONFIG_HOME, else ~/Library/Preferences on a Mac, else ~/.config", () => {
		expect(cfConfigDir("/h", {}, "linux")).toBe("/h/.config/cloudflare");
		expect(cfConfigDir("/h", {}, "darwin")).toBe("/h/Library/Preferences/cloudflare");
		expect(cfConfigDir("/h", { XDG_CONFIG_HOME: "/x" }, "darwin")).toBe("/x/cloudflare");
		const mac = home({ "default.json": JSON.stringify({ oauth_token: "mac" }) }, "Library/Preferences");
		expect(cfToken(mac, { env: {}, platform: "darwin" })).toBe("mac");
	});

	it("says how to log in again, out of the keyring, when there's no plaintext file", () => {
		expect(() => cfToken(home({}), linux())).toThrow(/CLOUDFLARE_AUTH_USE_KEYRING=false npx cf auth login --force/);
		expect(() => cfToken(home({}), linux({ CF_PROFILE: "club" }))).toThrow(/CLOUDFLARE_AUTH_USE_KEYRING=false npx cf auth create club/);
	});

	it("says the same when the file has no token", () => {
		expect(() => cfToken(home({ "default.json": "{}" }), linux())).toThrow(/npx cf auth login --force/);
		expect(() => cfToken(home({ "default.json": "null" }), linux())).toThrow(/npx cf auth login --force/);
	});

	it("never quotes the file, even one that isn't JSON (whose parse error would)", () => {
		const broken = home({ "default.json": '{"oauth_token":"secret"' });
		expect(() => cfToken(broken, linux())).toThrow(/couldn't be read/);
		expect(() => cfToken(broken, linux())).toThrow(/^(?!.*secret)/s);
	});
});

describe("keepLoginInFile", () => {
	it("tells every cf command the script runs to keep the login in its file, never moving it into the keyring", () => {
		const env: Record<string, string> = {};
		keepLoginInFile(env);
		expect(env.CLOUDFLARE_AUTH_USE_KEYRING).toBe("false");
	});
});
