// npm run join -- image | deploy | dry-run   (docs/runbooks/cloudflare-setup.md §7, the joiner)
// The video joiner Worker (join/) and its container. `image` builds the container image (podman standing in for Docker,
// scripts/podman-as-docker.sh) under a tag from its files' content, runs it with no network to check its ffmpeg is the
// pinned one and its own self-test joins, then pushes it to Cloudflare's registry and writes the tag to
// join/image-tag.txt for the config to reference, so a deploy needs no Docker anywhere. `deploy` runs the joiner's
// tests, cf deploy --dry-run, then cf deploy; both need the site owner's yes (AGENTS.md: Cloudflare changes).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deployConfig, profileArgs } from "./deploy-config.mjs";
import { ffmpegIsPinned, imagePlan, imageTag, pinnedFfmpeg, selfTestPassed } from "./join-steps.mjs";

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
	const tag = imageTag();
	const version = pinnedFfmpeg(readFileSync("join/Dockerfile", "utf8"));
	if (!version) fail("join/Dockerfile pins no ffmpeg version (ffmpeg=<version>-r<n>).");
	// Nothing is pushed until the built image itself, with no network, has the pinned ffmpeg and passes its own self-test.
	for (const step of imagePlan({ name: NAME, tag, docker: resolve("scripts/podman-as-docker.sh") })) {
		say(step.what);
		const ran = spawnSync(step.cmd, step.args, step.check ? { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] } : { stdio: "inherit" });
		if (step.check) process.stdout.write(ran.stdout ?? "");
		const passed = ran.status === 0 && (step.check === "ffmpeg" ? ffmpegIsPinned(ran.stdout, version)
			: step.check === "self-test" ? selfTestPassed(ran.stdout) : true);
		if (!passed) fail(`${step.what}: ${step.check === "ffmpeg" ? `not ffmpeg ${version}` : "didn't pass"}. The image wasn't pushed.`);
	}
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
