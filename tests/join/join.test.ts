import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain Node, no types: the container runs it as it is
import { contentRangeTotal, listFile, parseJoinRequest, putFile, runFfmpeg, tooBig } from "../../join/join.mjs";
// @ts-expect-error plain Node, no types
import { concatArgs, joinSegments, muxArgs, runFailed, tooSmall, tsArgs } from "../../join/pipeline.mjs";

const COMMON = ["-hide_banner", "-loglevel", "error", "-y", "-protocol_whitelist", "file,https,tls,tcp,pipe", "-fflags", "+discardcorrupt"];

describe("the joiner's request", () => {
	it("reads a request and refuses a bad one", () => {
		expect(parseJoinRequest({ segments: ["https://a/1", "https://a/2"], output: "https://a/out", container: "mp4" })).toEqual({ segments: ["https://a/1", "https://a/2"], output: "https://a/out", container: "mp4", start: true });
		expect(parseJoinRequest({ segments: ["https://a/1", "https://a/2"], output: "https://a/out", container: "mp4", start: false }).start).toBe(false);
		expect(() => parseJoinRequest({ segments: ["https://a/1"], output: "https://a/out", container: "mp4" })).toThrow("at least two segments");
		expect(() => parseJoinRequest({ segments: ["http://a/1", "https://a/2"], output: "https://a/out", container: "mp4" })).toThrow("https");
		expect(() => parseJoinRequest({ segments: ["file:/app/a.mp4", "file:/app/b.mp4"], output: "", container: "mp4" })).toThrow("https");
		expect(parseJoinRequest({ segments: ["file:/app/a.mp4", "file:/app/b.mp4"], output: "", container: "mp4" }, { allowFiles: true }).output).toBe("");
		expect(() => parseJoinRequest({ segments: ["https://a/1", "https://a/2"], output: "https://a/out", container: "avi" })).toThrow("container");
	});
	it("reads a segment's whole size from the one-byte answer's Content-Range", () => {
		expect(contentRangeTotal("bytes 0-0/877472")).toBe(877472);
		expect(contentRangeTotal(null)).toBeNull();
		expect(contentRangeTotal("bytes */1024")).toBe(1024);
	});
	it("refuses segments over 3 GB in all", () => {
		expect(tooBig([2_000_000_000, 1_000_000_000])).toBe(false);
		expect(tooBig([2_000_000_000, 1_300_000_000])).toBe(true);
	});
	it("stores the joined file by a streamed PUT with its length and type, and says when the store refuses", async () => {
		const file = join(await mkdtemp(join(tmpdir(), "join-test-")), "out.mp4");
		const bytes = new Uint8Array(300_000).map((_, i) => i % 251);
		await writeFile(file, bytes);
		const got: Array<{ method: string; length: string; type: string; body: number; status: number }> = [];
		const server = createServer((req, res) => {
			let body = 0;
			req.on("data", (d: Buffer) => { body += d.length; });
			req.on("end", () => {
				const status = req.url === "/full" ? 403 : 200;
				got.push({ method: req.method ?? "", length: String(req.headers["content-length"]), type: String(req.headers["content-type"]), body, status });
				res.writeHead(status).end();
			});
		});
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		const port = (server.address() as { port: number }).port;
		try {
			expect(await putFile(file, `http://127.0.0.1:${port}/out`, "video/mp4", bytes.length)).toBeNull();
			expect(await putFile(file, `http://127.0.0.1:${port}/full`, "video/webm", bytes.length)).toBe("the joined file couldn't be stored (HTTP 403)");
		} finally {
			server.close();
		}
		expect(got).toEqual([{ method: "PUT", length: "300000", type: "video/mp4", body: 300000, status: 200 }, { method: "PUT", length: "300000", type: "video/webm", body: 300000, status: 403 }]);
	});
	it("gives up a store that never answers once the join is stopped", async () => {
		const file = join(await mkdtemp(join(tmpdir(), "join-test-")), "out.mp4");
		await writeFile(file, new Uint8Array(1000));
		const server = createServer(() => { /* never answers */ });
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		try {
			await expect(putFile(file, `http://127.0.0.1:${(server.address() as { port: number }).port}/out`, "video/mp4", 1000, AbortSignal.timeout(100))).rejects.toThrow();
		} finally {
			server.closeAllConnections();
			server.close();
		}
	});
});

describe("the joiner's ffmpeg commands", () => {
	it("re-wraps each MP4 segment to a transport stream on stdout, dropping a cut-off frame, then wraps the stream into the MP4", () => {
		expect(tsArgs("file:/app/test-a.mp4")).toEqual([...COMMON, "-i", "/app/test-a.mp4", "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", "pipe:1"]);
	});
	it("gives up reading a link that has sent nothing for two minutes", () => {
		expect(tsArgs("https://a/1?x=1")).toEqual([...COMMON, "-rw_timeout", "120000000", "-i", "https://a/1?x=1", "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", "pipe:1"]);
	});
	it("wraps the transport stream into the MP4 by stream copy, or re-encoded", () => {
		expect(muxArgs("/tmp/all.ts", "/tmp/out.mp4", false)).toEqual([...COMMON, "-i", "/tmp/all.ts", "-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart", "/tmp/out.mp4"]);
		expect(muxArgs("/tmp/all.ts", "/tmp/out.mp4", true)).toContain("libx264");
	});
	it("joins WebM through the concat demuxer, by stream copy or re-encoded", () => {
		expect(concatArgs("/tmp/list.txt", "/tmp/out.webm", false)).toEqual([...COMMON, "-safe", "0", "-f", "concat", "-i", "/tmp/list.txt", "-c", "copy", "/tmp/out.webm"]);
		expect(concatArgs("/tmp/list.txt", "/tmp/out.webm", true)).toContain("libvpx-vp9");
		expect(listFile(["https://a/1?x=1", "file:/app/test-b.mp4"])).toBe("file 'https://a/1?x=1'\nfile '/app/test-b.mp4'\n");
	});
	it("joins an MP4 whose picture isn't H.264 through the concat demuxer too, its index at the front", () => {
		expect(concatArgs("/tmp/list.txt", "/tmp/out.mp4", false)).toEqual([...COMMON, "-safe", "0", "-f", "concat", "-i", "/tmp/list.txt", "-c", "copy", "-movflags", "+faststart", "/tmp/out.mp4"]);
		expect(concatArgs("/tmp/list.txt", "/tmp/out.mp4", true)).toEqual(expect.arrayContaining(["libx264", "aac", "+faststart"]));
		expect(concatArgs("/tmp/list.txt", "/tmp/out.mp4", true)).not.toContain("libvpx-vp9");
	});
	it("a run that stopped reading its segments part way has failed, whatever its exit code says", () => {
		expect(runFailed({ code: 0, err: "" })).toBe(false);
		expect(runFailed({ code: 1, err: "" })).toBe(true);
		expect(runFailed({ code: 0, err: "[in#0/concat @ 0x1] Error during demuxing: Invalid data found when processing input\n" })).toBe(true);
		expect(runFailed({ code: 0, err: "[in#0/concat @ 0x1] h264_mp4toannexb filter failed to receive output packet\n" })).toBe(true);
		expect(runFailed({ code: 0, err: "[h264 @ 0x1] Invalid NAL unit size (9555 > 2085).\n[mov,mp4 @ 0x2] stream 1, offset 0x2001d2e: partial file\n" })).toBe(false);
	});
	it("a copied file far smaller than its segments means one was left out", () => {
		expect(tooSmall(33_500_000, 92_000_000)).toBe(true);
		expect(tooSmall(84_000_000, 84_000_000 - 1_500_000)).toBe(false);
	});
});

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
const hasVp9 = hasFfmpeg && (() => { const list = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); return list.includes("libvpx-vp9") && list.includes("libopus"); })();
const probe = (file: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());

// With ffmpeg on this computer: the whole join on the image's own test files, the first cut off part way through a frame,
// as a dead page leaves a segment.
describe.skipIf(!hasFfmpeg)("the join itself", () => {
	it("joins a cut-off segment and a whole one into one MP4 about as long as both, by stream copy", async () => {
		const dir = await mkdtemp(join(tmpdir(), "join-test-"));
		const a = await readFile(join(process.cwd(), "join", "test-a.mp4"));
		const cut = join(dir, "cut.mp4"), whole = join(dir, "whole.mp4"), out = join(dir, "out.mp4");
		await writeFile(cut, a.subarray(0, Math.floor(a.length * 0.55)));
		await writeFile(whole, await readFile(join(process.cwd(), "join", "test-b.mp4")));
		const result = await joinSegments([`file:${cut}`, `file:${whole}`], out, "mp4", [Math.floor(a.length * 0.55), a.length], dir);
		expect(result).toMatchObject({ ok: true, took: { read: expect.any(Number), join: expect.any(Number) } });
		const [cutSeconds, wholeSeconds, joined] = [probe(cut), probe(whole), probe(out)];
		expect(joined).toBeGreaterThan(cutSeconds + wholeSeconds - 1.5);
		expect(joined).toBeLessThan(cutSeconds + wholeSeconds + 1.5);
	}, 60_000);
	// A browser without H.264 records VP9 and Opus into its MP4: the transport stream can't carry that picture.
	it.skipIf(!hasVp9)("joins MP4 segments whose picture isn't H.264, by stream copy", async () => {
		const dir = await mkdtemp(join(tmpdir(), "join-test-"));
		const make = (name: string, seconds: number) => {
			const file = join(dir, name);
			execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=160x120:rate=10`, "-f", "lavfi", "-i", `sine=duration=${seconds}`, "-c:v", "libvpx-vp9", "-c:a", "libopus", "-f", "mp4", file]);
			return file;
		};
		const a = make("a.mp4", 2), b = make("b.mp4", 3), out = join(dir, "out.mp4");
		const sizes = [a, b].map((f) => statSync(f).size);
		const result = await joinSegments([`file:${a}`, `file:${b}`], out, "mp4", sizes, dir);
		expect(result).toMatchObject({ ok: true });
		expect(probe(out)).toBeGreaterThan(4.5);
		expect(probe(out)).toBeLessThan(5.5);
		expect(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", out], { encoding: "utf8" }).trim()).toBe("vp9");
	}, 60_000);
	it("refuses a join whose copy came out far smaller than its segments", async () => {
		const dir = await mkdtemp(join(tmpdir(), "join-test-"));
		const out = join(dir, "out.mp4");
		const a = join(process.cwd(), "join", "test-a.mp4"), b = join(process.cwd(), "join", "test-b.mp4");
		// The sizes claimed are far over what the files hold: the same check that catches a segment left out.
		const result = await joinSegments([`file:${a}`, `file:${b}`], out, "mp4", [50_000_000, 50_000_000], dir);
		expect(result).toMatchObject({ ok: false });
		expect(result.reason).toContain("left out");
	}, 60_000);
	it("stops ffmpeg when the join is stopped", async () => {
		const began = Date.now();
		const run = await runFfmpeg(["-hide_banner", "-loglevel", "error", "-re", "-f", "lavfi", "-i", "testsrc=duration=60:rate=10", "-f", "null", "-"], null, AbortSignal.timeout(300));
		expect(run.code).not.toBe(0);
		expect(Date.now() - began).toBeLessThan(10_000);
	}, 20_000);
});
