// What the joiner does around a request: checks it, sizes the segments, runs ffmpeg and stores the result (the join
// itself is pipeline.mjs). Each step takes the job's signal, so a join past its limit (jobs.mjs) stops where it is.
// Plain Node, so the tests run it without a container (tests/join/join.test.ts).
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";

// The instance (standard-1) has 8 GB of disk, and a join holds the segments' transport stream and the joined file at
// once, each about the segments' sum.
const MOST_BYTES = 3 * 1024 ** 3;

/** A request's fields, checked: at least two https (or, for the self-test, file:) segments, an https output, mp4 or
 * webm. `start` false only asks how a join already begun went. */
export function parseJoinRequest(body, { allowFiles = false } = {}) {
	const segments = Array.isArray(body?.segments) ? body.segments : [];
	if (segments.length < 2) throw new Error("at least two segments are needed");
	const ok = (s) => typeof s === "string" && (s.startsWith("https://") || (allowFiles && s.startsWith("file:")));
	if (!segments.every(ok)) throw new Error("every segment must be an https link");
	if (body.output !== "" && (typeof body.output !== "string" || !body.output.startsWith("https://"))) throw new Error("the output must be an https link");
	if (body.container !== "mp4" && body.container !== "webm") throw new Error("container must be mp4 or webm");
	return { segments, output: body.output, container: body.container, start: body.start !== false };
}

export const tooBig = (sizes) => sizes.reduce((a, b) => a + b, 0) > MOST_BYTES;

/** The concat demuxer's list: one line a segment (a link holds no quotes; a file: segment is its path). */
export const listFile = (segments) => segments.map((s) => `file '${s.replace(/^file:/, "")}'`).join("\n") + "\n";

/** Seconds to a tenth, for how long a step took. */
export const tenths = (ms) => Math.round(ms / 100) / 10;

/** Runs ffmpeg; resolves with its exit code and its last lines of output. `out`: a stream its stdout is appended to
 * (left open: the next segment follows). `signal` stops it. */
export function runFfmpeg(args, out = null, signal = undefined) {
	return new Promise((resolve) => {
		const child = spawn("ffmpeg", args, { stdio: ["ignore", out ? "pipe" : "ignore", "pipe"], signal });
		let err = "";
		if (out) child.stdout.pipe(out, { end: false });
		child.stderr.on("data", (d) => { err = (err + d.toString()).slice(-2000); });
		child.on("error", (e) => resolve({ code: 127, err: String(e) }));
		child.on("close", (code) => resolve({ code, err }));
	});
}

/** The whole size from a Content-Range header ("bytes 0-0/877472"); null if it doesn't say. */
export function contentRangeTotal(header) {
	const m = /\/(\d+)\s*$/.exec(header ?? "");
	return m ? Number(m[1]) : null;
}

/** Each segment's size: one byte of its link asked for (the links are signed for GET alone, so no HEAD), or the file's. */
export async function sizes(segments, signal = undefined) {
	return Promise.all(segments.map(async (url) => {
		if (url.startsWith("file:")) return (await stat(url.replace(/^file:/, ""))).size;
		const res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal });
		if (!res.ok) throw new Error(`a segment can't be read (HTTP ${res.status})`);
		await res.arrayBuffer();
		return contentRangeTotal(res.headers.get("content-range")) ?? Number(res.headers.get("content-length") ?? 0);
	}));
}

export async function writeList(path, segments) { await writeFile(path, listFile(segments)); }

/** PUTs the file to the link, streamed with its length (a game is gigabytes, never held in memory): null, or why not. */
export async function putFile(path, url, type, size, signal = undefined) {
	const res = await fetch(url, { method: "PUT", body: Readable.toWeb(createReadStream(path)), duplex: "half", headers: { "Content-Type": type, "Content-Length": String(size) }, signal });
	await res.arrayBuffer().catch(() => undefined);
	return res.ok ? null : `the joined file couldn't be stored (HTTP ${res.status})`;
}
