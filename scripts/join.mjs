// npm run join -- image | deploy | dry-run   (docs/runbooks/cloudflare-setup.md §7, the joiner)
// The video joiner Worker (join/) and its container. `image` builds the container image (podman standing in for Docker,
// scripts/podman-as-docker.sh), pushes it to Cloudflare's registry under a tag from its files' content, and writes the tag
// to join/image-tag.txt for the config to reference, so a deploy needs no Docker anywhere. `deploy` runs the joiner's
// tests, cf deploy --dry-run, then cf deploy; both need the site owner's yes (AGENTS.md: Cloudflare changes).
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deployConfig, profileArgs } from "./deploy-config.mjs";

const say = (text) => console.log(`join: ${text} (${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`);
const NAME = `${deployConfig().worker}-join`;
const fail = (text) => {
	console.error(`join: STOPPED. ${text}`);
	process.exit(1);
};

const command = process.argv[2];
if (!["image", "deploy", "dry-run"].includes(command)) fail("Usage: npm run join -- image | deploy | dry-run");

// cf's own login, refreshed first.
execFileSync("npx", ["cf", "auth", "whoami", ...profileArgs()], { stdio: "ignore" });
// join/ is its own cf project, using the repo's packages (its node_modules is a link, git-ignored).
if (!existsSync("join/node_modules")) symlinkSync("../node_modules", "join/node_modules");

say("the joiner's tests");
if (spawnSync("npx", ["vitest", "run", "tests/join"], { stdio: "inherit" }).status !== 0) fail("The joiner's tests failed: nothing deployed.");

if (command === "image") {
	// The tag names the image's files as they are now (the tag file itself left out), so the same files give the same tag.
	const files = ["Dockerfile", "server.mjs", "jobs.mjs", "join.mjs", "pipeline.mjs", "test-a.mp4", "test-b.mp4"].map((f) => `join/${f}`);
	const tag = createHash("sha1").update(execFileSync("git", ["hash-object", ...files], { encoding: "utf8" })).digest("hex").slice(0, 12);
	say(`building and pushing ${NAME}:${tag} (podman as docker)`);
	const built = spawnSync("npx", ["cf", "containers", "build", "join", "--tag", `${NAME}:${tag}`, "--push", "--path-to-docker", resolve("scripts/podman-as-docker.sh"), ...profileArgs()], { stdio: "inherit" });
	if (built.status !== 0) fail("The image didn't build or push.");
	writeFileSync("join/image-tag.txt", `${tag}\n`);
	say(`join/image-tag.txt now names ${tag}: commit it, then npm run join -- deploy`);
	process.exit(0);
}
const steps = [["deploy", "--dry-run"], ...(command === "deploy" ? [["deploy"]] : [])];
for (const args of steps) {
	say(`cf ${args.join(" ")} (in join/)`);
	const ran = spawnSync("npx", ["cf", ...args, ...profileArgs()], { cwd: "join", stdio: "inherit" });
	if (ran.status !== 0) fail(`cf ${args.join(" ")} failed.${args.includes("--dry-run") ? " Nothing changed." : ""}`);
}
say(command === "deploy" ? `deployed ${NAME}: the site's JOINER binding can reach it` : "the dry run passed; nothing changed");
