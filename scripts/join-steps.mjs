// npm run join -- image's workings (scripts/join.mjs), as plain functions (tests/scripts/join.test.ts): its tag, what it
// runs, in order, and how it reads the image's own checks.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { profileArgs } from "./deploy-config.mjs";

const IMAGE_FILES = ["Dockerfile", "server.mjs", "jobs.mjs", "join.mjs", "pipeline.mjs", "test-a.mp4", "test-b.mp4"].map((f) => `join/${f}`);

/** The image's tag, from its files' content as they are now (the tag file itself left out): the same files, the same tag. */
export function imageTag() {
	return createHash("sha1").update(execFileSync("git", ["hash-object", ...IMAGE_FILES], { encoding: "utf8" })).digest("hex").slice(0, 12);
}

// Inside the image (no network): the server started, then its own POST /self-test asked (it joins the two test files
// shipped in the image), tried each second until it answers, and its answer printed. Plain JavaScript with no dollar
// signs, backslashes or backticks, as podman-as-docker.sh passes each argument through the shell again.
const SELF_TEST = "import('./server.mjs'); const ask = () => fetch('http://127.0.0.1:8080/self-test', { method: 'POST' }).then((r) => r.text()); "
	+ "(async () => { for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 1000)); "
	+ "try { console.log(await ask()); process.exit(0); } catch { /* not listening yet */ } } process.exit(1); })();";

/**
 * Building the joiner's image (`name`, the joiner Worker's): built locally (podman as docker), then run with
 * --network=none to check its ffmpeg is the pinned one and that its own self-test joins, and only then pushed to
 * Cloudflare's registry. A step with `check` is read by that check; any other must just succeed.
 */
export function imagePlan({ name, tag, docker }) {
	const image = `${name}:${tag}`;
	const run = (...args) => ({ cmd: docker, args: ["run", "--rm", "--network=none", image, ...args] });
	return [
		{ what: `building ${image} (podman as docker)`, cmd: "npx", args: ["cf", "containers", "build", "join", "--tag", image, "--path-to-docker", docker, ...profileArgs()] },
		{ what: "its ffmpeg, with no network", check: "ffmpeg", ...run("ffmpeg", "-version") },
		{ what: "its own self-test, with no network", check: "self-test", ...run("node", "-e", SELF_TEST) },
		{ what: `pushing ${image} to Cloudflare's registry`, cmd: "npx", args: ["cf", "containers", "push", "--tag", image, "--path-to-docker", docker, ...profileArgs()] },
	];
}

/** The ffmpeg version join/Dockerfile pins ("ffmpeg=8.1.3-r0" gives "8.1.3"), or null when it pins none. */
export function pinnedFfmpeg(dockerfile) {
	return /\bffmpeg=(\d+(?:\.\d+)+)-r\d+/.exec(dockerfile)?.[1] ?? null;
}

/** Whether `ffmpeg -version`'s output is the pinned version, exactly. */
export function ffmpegIsPinned(output, version) {
	return new RegExp(`^ffmpeg version ${version.replaceAll(".", "\\.")}\\s`).test(output);
}

/** Whether the self-test's last answer (a line of JSON with `ok`) said ok. */
export function selfTestPassed(output) {
	const answers = output.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{")).map((l) => {
		try {
			return JSON.parse(l);
		} catch {
			return null;
		}
	}).filter((a) => a && "ok" in a);
	return answers.at(-1)?.ok === true;
}
