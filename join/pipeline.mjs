// How the segments become one file. MP4 (every phone today): each segment is re-wrapped into a transport stream and
// appended to one .ts (a cut-off last frame dropped, each segment's own decoder settings carried in-band, every
// timestamp in the one clock), then that is wrapped into the MP4, by stream copy. ffmpeg's concat demuxer isn't used
// for a phone's MP4: a segment a dead page leaves ends mid-frame, which stops it reading, and it needs every segment's
// clock to match, which two recordings of the same phone needn't. WebM (an older Android) still goes through it, and so
// does an MP4 whose picture isn't H.264 (a browser without that encoder records VP9), which a transport stream can't
// carry. Plain Node, so the tests run it without a container (tests/join/join.test.ts).
import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join as joinPath } from "node:path";
import { finished } from "node:stream/promises";
import { runFfmpeg, tenths, writeList } from "./join.mjs";

// A joined file by stream copy is about its segments' sum; much less means a segment was left out.
const LEAST_OF_INPUT = 0.85;
const COMMON = ["-hide_banner", "-loglevel", "error", "-y", "-protocol_whitelist", "file,https,tls,tcp,pipe", "-fflags", "+discardcorrupt"];
// A link that sends nothing for this long (microseconds) is given up: the join fails and is tried again.
const READ_TIMEOUT = ["-rw_timeout", "120000000"];
// The demuxer each recording's segments are read with, never one chosen from their bytes: a filmer uploads a segment,
// and one holding a manifest or a concat list (DASH, HLS, ffconcat) would have ffmpeg open the links and files it names.
const DEMUXER = { mp4: "mov", webm: "matroska" };
// ffmpeg's words for segments whose streams don't line up for a copy: then it's re-encoded.
const NEEDS_REENCODE = /codec|parameters|timebase|time base|resolution|stream #|non-monotonic|Non-monotonous|incompatible|during demuxing|filter failed/i;
// ffmpeg's words for a codec the WebM muxer won't take (H.264, from Chrome's webm;codecs=h264): it's copied into Matroska.
const NOT_WEBM = /supported for WebM/i;
// ffmpeg's words for a picture the H.264 re-wrap can't take: it isn't H.264.
const NOT_H264 = /initializing bitstream filter/i;

/** A run that failed: a non-zero exit, or ffmpeg gave up reading its input part way (it exits 0 then, with a file that
 * holds only what came before the stop). A cut-off last frame is noise, not a stop. */
export const runFailed = (run) => run.code !== 0 || /Error during demuxing|filter failed/i.test(run.err);

/** A copied file far smaller than what went in: a segment was left out, whatever ffmpeg said. */
export const tooSmall = (outBytes, inputBytes) => outBytes < inputBytes * LEAST_OF_INPUT;

/** One MP4 segment (a link, or a file: path), read only as MP4, to a transport stream on stdout. */
export const tsArgs = (segment) => [
	...COMMON, ...(segment.startsWith("file:") ? [] : READ_TIMEOUT), "-f", DEMUXER.mp4, "-i", segment.replace(/^file:/, ""),
	"-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", "pipe:1",
];

/** The transport stream to the MP4: stream copy (its index at the front), or a re-encode when the streams don't line up. */
export const muxArgs = (tsPath, outPath, reencode) => [
	...COMMON, "-i", tsPath,
	...(reencode ? ["-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-c:a", "aac"] : ["-c", "copy", "-bsf:a", "aac_adtstoasc"]),
	"-movflags", "+faststart", outPath,
];

/** The concat demuxer over the list of links, stream copy or a re-encode: into a WebM, or an MP4 (its index at the front).
 * Only the list and the recording's own container may be opened; the list names that container for each segment too.
 * `matroska`: the copy is written as Matroska under the WebM's name, for a picture WebM can't hold. VP9 is encoded at
 * realtime settings, as libvpx's defaults take hours for a game on the joiner's half a CPU. */
export const concatArgs = (listPath, outPath, reencode, matroska = false) => {
	const mp4 = outPath.endsWith(".mp4");
	const encode = mp4 ? ["-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-c:a", "aac"] : ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-c:a", "libopus"];
	const copy = ["-c", "copy", ...(matroska ? ["-f", "matroska"] : [])];
	return [...COMMON, "-format_whitelist", `concat,${DEMUXER[mp4 ? "mp4" : "webm"]}`, "-safe", "0", "-f", "concat", "-i", listPath, ...(reencode ? encode : copy), ...(mp4 ? ["-movflags", "+faststart"] : []), outPath];
};

/** Why a run failed: ffmpeg's last lines, with a signed link (an input's or the output's) cut to its address, as the
 * site's own redaction does (src/shared/redact.ts): the reason is logged, stored and emailed. */
export const why = (run) => `ffmpeg: ${run.err.trim().split("\n").slice(-3).join(" | ").replace(/(https?:\/\/[^\s'"?]+)\?[^\s'"]*/g, "$1?…") || `exit ${run.code}`}`;

/** Every segment appended to one transport stream at `tsPath`; the first run that failed, or null. A stream that can't
 * be written (the disk full) stops its ffmpeg and is that failure, never an error left to take the joiner down. */
async function toTransportStream(segments, tsPath, signal) {
	const out = createWriteStream(tsPath);
	const stop = new AbortController();
	let writeErr = null;
	out.on("error", (e) => { writeErr ??= e; stop.abort(); });
	const both = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
	let failed = null;
	for (const segment of segments) {
		const run = await runFfmpeg(tsArgs(segment), out, both);
		if (writeErr || runFailed(run)) { failed = run; break; }
	}
	out.end();
	await finished(out).catch(() => {});
	return writeErr ? { code: 1, err: `couldn't write the stream: ${writeErr.code ?? writeErr.message}` } : failed;
}

/**
 * Joins `segments` (links, or file: paths) into `outPath`, an MP4 or WebM: { ok: true, bytes, took } or { ok: false,
 * reason }. `took`: seconds reading the segments (`read`) and writing the joined file (`join`). `inputBytes`: the
 * segments' sizes, which a copy must come close to. `dir`: room for the stream (MP4) or list (WebM). `signal` stops it.
 */
export async function joinSegments(segments, outPath, container, inputBytes, dir, signal = undefined) {
	const total = inputBytes.reduce((a, b) => a + b, 0);
	const began = Date.now();
	let readMs = 0;
	const finish = async (reencoded) => {
		const { size } = await stat(outPath);
		if (size === 0) return { ok: false, reason: "ffmpeg wrote nothing" };
		if (!reencoded && tooSmall(size, total)) return { ok: false, reason: `the joined file is ${Math.round(size / 1e6)} MB from ${Math.round(total / 1e6)} MB of segments: a segment was left out` };
		return { ok: true, bytes: size, took: { read: tenths(readMs), join: tenths(Date.now() - began - readMs) } };
	};
	const byConcat = async () => {
		const list = joinPath(dir, "list.txt");
		await writeList(list, segments, DEMUXER[container]);
		let run = await runFfmpeg(concatArgs(list, outPath, false), null, signal);
		if (runFailed(run) && NOT_WEBM.test(run.err)) run = await runFfmpeg(concatArgs(list, outPath, false, true), null, signal);
		if (runFailed(run) && NEEDS_REENCODE.test(run.err)) return runFailed(run = await runFfmpeg(concatArgs(list, outPath, true), null, signal)) ? { ok: false, reason: why(run) } : finish(true);
		return runFailed(run) ? { ok: false, reason: why(run) } : finish(false);
	};
	if (container === "webm") return byConcat();
	const ts = joinPath(dir, "all.ts");
	const broke = await toTransportStream(segments, ts, signal);
	if (broke && NOT_H264.test(broke.err)) return byConcat();
	readMs = Date.now() - began;
	if (broke) return { ok: false, reason: why(broke) };
	let run = await runFfmpeg(muxArgs(ts, outPath, false), null, signal);
	if (!runFailed(run)) return finish(false);
	if (!NEEDS_REENCODE.test(run.err)) return { ok: false, reason: why(run) };
	run = await runFfmpeg(muxArgs(ts, outPath, true), null, signal);
	return runFailed(run) ? { ok: false, reason: why(run) } : finish(true);
}
