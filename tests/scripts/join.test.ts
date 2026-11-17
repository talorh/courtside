import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { ffmpegIsPinned, imagePlan, imageTag, pinnedFfmpeg, selfTestPassed } from "../../scripts/join-steps.mjs";

const DOCKER = "/repo/scripts/podman-as-docker.sh";
const line = (s: { cmd: string; args: string[] }) => [s.cmd, ...s.args].join(" ");
const profile = process.env.CF_PROFILE ? ` --profile ${process.env.CF_PROFILE}` : "";

describe("npm run join -- image", () => {
	it("builds the image, runs its checks with no network, and only then pushes it", () => {
		const plan = imagePlan({ name: "courtside-join", tag: "abc123def456", docker: DOCKER });
		expect(plan.map((s: { check?: string }) => s.check ?? "run")).toEqual(["run", "ffmpeg", "self-test", "run"]);
		expect(line(plan[0])).toBe(`npx cf containers build join --tag courtside-join:abc123def456 --path-to-docker ${DOCKER}${profile}`);
		expect(plan[0].args).not.toContain("--push");
		expect(line(plan[1])).toBe(`${DOCKER} run --rm --network=none courtside-join:abc123def456 ffmpeg -version`);
		expect(plan[2].args.slice(0, 4)).toEqual(["run", "--rm", "--network=none", "courtside-join:abc123def456"]);
		expect(plan[2].args.slice(4, 6)).toEqual(["node", "-e"]);
		expect(plan[2].args[6]).toContain("import('./server.mjs')");
		expect(plan[2].args[6]).not.toMatch(/[$`\\]/); // podman-as-docker.sh passes it through the shell again
		expect(plan[2].args.join(" ")).toContain("http://127.0.0.1:8080/self-test");
		expect(line(plan[3])).toBe(`npx cf containers push --tag courtside-join:abc123def456 --path-to-docker ${DOCKER}${profile}`);
	});

	it("tags the image from its files' content: twelve hex characters, the same for the same files", () => {
		expect(imageTag()).toMatch(/^[0-9a-f]{12}$/);
		expect(imageTag()).toBe(imageTag());
	});

	it("reads the pinned ffmpeg from the Dockerfile, and wants the image's ffmpeg to be that one", () => {
		const version = pinnedFfmpeg(readFileSync("join/Dockerfile", "utf8"));
		expect(version).toMatch(/^\d+\.\d+(\.\d+)?$/);
		expect(pinnedFfmpeg("FROM node\nRUN apk add ffmpeg=8.1.3-r0\n")).toBe("8.1.3");
		expect(pinnedFfmpeg("FROM node\nRUN apk add ffmpeg\n")).toBeNull();
		expect(ffmpegIsPinned("ffmpeg version 8.1.3 Copyright (c) 2000-2026 the FFmpeg developers\nbuilt with gcc", "8.1.3")).toBe(true);
		expect(ffmpegIsPinned("ffmpeg version 8.1.31 Copyright", "8.1.3")).toBe(false);
		expect(ffmpegIsPinned("ffmpeg version 9.0.2 Copyright", "8.1.3")).toBe(false);
		expect(ffmpegIsPinned("", "8.1.3")).toBe(false);
	});

	it("passes the self-test only when the container's own join answered ok", () => {
		expect(selfTestPassed('{"event":"joiner_listening","port":8080}\n{"ok":true,"bytes":123,"seconds":2}\n')).toBe(true);
		expect(selfTestPassed('{"event":"joiner_listening","port":8080}\n{"ok":false,"reason":"ffmpeg failed"}\n')).toBe(false);
		expect(selfTestPassed("sh: node: not found\n")).toBe(false);
		expect(selfTestPassed("")).toBe(false);
	});
});
