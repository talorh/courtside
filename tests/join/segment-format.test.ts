import { execFileSync } from "node:child_process";
import { copyFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain Node, no types
import { joinSegments } from "../../join/pipeline.mjs";

// A filmer uploads a segment's bytes, so a segment can hold anything: a DASH manifest or an ffconcat list names other
// files and links, which ffmpeg would open if it chose the format from the bytes. Each segment is read only as the
// recording's own container, so such a segment fails the join and nothing it names is opened.
const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
const hasVp9 = hasFfmpeg && execFileSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).includes("libvpx-vp9");
const mpd = (url: string) => `<?xml version="1.0"?>\n<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT5S" minBufferTime="PT1S"><Period><AdaptationSet mimeType="video/mp4"><Representation id="1" bandwidth="100000"><BaseURL>${url}</BaseURL></Representation></AdaptationSet></Period></MPD>\n`;

let dir = "";
let server: Server;
let address = "";
let connections = 0;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "join-format-"));
	// Stands for any host a manifest names: it only counts the connections ffmpeg makes to it.
	server = createServer((socket) => { connections++; socket.destroy(); });
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	address = `https://127.0.0.1:${(server.address() as { port: number }).port}/elsewhere/never-handed.mp4`;
	copyFileSync(join(process.cwd(), "join", "test-a.mp4"), join(dir, "a.mp4"));
	copyFileSync(join(process.cwd(), "join", "test-b.mp4"), join(dir, "b.mp4"));
});
afterAll(() => { server?.close(); });

const sizes = (files: string[]) => files.map((f) => statSync(f).size);
const segment = (name: string, text: string) => { writeFileSync(join(dir, name), text); return join(dir, name); };

describe.skipIf(!hasFfmpeg)("a segment is read only as the recording's own container", () => {
	it("an MP4 recording's segment holding a DASH manifest fails the join, and the host it names is never reached", async () => {
		const a = join(dir, "a.mp4"), bad = segment("manifest.mp4", mpd(address));
		connections = 0;
		const result = await joinSegments([`file:${a}`, `file:${bad}`], join(dir, "out1.mp4"), "mp4", sizes([a, bad]), dir);
		expect(result).toMatchObject({ ok: false });
		expect(connections).toBe(0);
	}, 60_000);
	it("an MP4 recording's segment holding an ffconcat list fails the join, rather than joining the file it names", async () => {
		const a = join(dir, "a.mp4"), bad = segment("list.mp4", "ffconcat version 1.0\nfile b.mp4\n");
		const result = await joinSegments([`file:${a}`, `file:${bad}`], join(dir, "out2.mp4"), "mp4", sizes([a, bad]), dir);
		expect(result).toMatchObject({ ok: false });
	}, 60_000);
	it("the image's own test files still join, as the nightly self-test does", async () => {
		const a = join(dir, "a.mp4"), b = join(dir, "b.mp4");
		expect(await joinSegments([`file:${a}`, `file:${b}`], join(dir, "out3.mp4"), "mp4", sizes([a, b]), dir)).toMatchObject({ ok: true });
	}, 60_000);
});

describe.skipIf(!hasVp9)("a WebM recording's segments are read only as WebM", () => {
	const webm = (name: string, seconds: number) => {
		const file = join(dir, name);
		execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=160x120:rate=10`, "-f", "lavfi", "-i", `sine=duration=${seconds}`, "-c:v", "libvpx-vp9", "-c:a", "libopus", file]);
		return file;
	};
	it("a segment holding a DASH manifest or an ffconcat list fails the join, and nothing it names is opened", async () => {
		const a = webm("a.webm", 2);
		webm("b.webm", 3);
		connections = 0;
		const manifest = segment("manifest.webm", mpd(address));
		expect(await joinSegments([`file:${a}`, `file:${manifest}`], join(dir, "out4.webm"), "webm", sizes([a, manifest]), dir)).toMatchObject({ ok: false });
		const list = segment("list.webm", "ffconcat version 1.0\nfile b.webm\n");
		expect(await joinSegments([`file:${a}`, `file:${list}`], join(dir, "out5.webm"), "webm", sizes([a, list]), dir)).toMatchObject({ ok: false });
		expect(connections).toBe(0);
	}, 60_000);
	it("real WebM segments still join by stream copy", async () => {
		const a = webm("c.webm", 2), b = webm("d.webm", 3), out = join(dir, "out6.webm");
		expect(await joinSegments([`file:${a}`, `file:${b}`], out, "webm", sizes([a, b]), dir)).toMatchObject({ ok: true });
		const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).trim());
		expect(seconds).toBeGreaterThan(4.5);
		expect(seconds).toBeLessThan(5.5);
	}, 60_000);
});
