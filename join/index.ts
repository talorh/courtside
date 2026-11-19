// The joiner Worker, courtside-join: a Durable Object that carries the ffmpeg container (server.mjs). The site binds to the
// Durable Object across Workers (its JOINER binding) and posts /join and /self-test to it; nothing else reaches it (no
// route, no domain, no Preview URL).
import { Container, type StopParams } from "@cloudflare/containers";

export class Joiner extends Container {
	defaultPort = 8080;
	// Asleep after 30 minutes with no ask: a long re-encode outlives two late 5-minute runs in a row.
	sleepAfter = "30m";

	// The container's stops and failures as lines in this Worker's logs (the library's own is a plain "Container error").
	// Going to sleep is a signal; exiting by itself, other than cleanly, is a crash.
	onStop(p: StopParams): void {
		const line = JSON.stringify({ event: "joiner_stopped", exitCode: p.exitCode, reason: p.reason });
		if (p.reason === "exit" && p.exitCode !== 0) console.error(line); else console.log(line);
	}

	onError(error: unknown): unknown {
		console.error(JSON.stringify({ event: "joiner_container_error", error: String(error) }));
		throw error;
	}
}

export default {
	async fetch() {
		return new Response("The video joiner. The site talks to it through its Durable Object.", { status: 404 });
	},
} satisfies ExportedHandler;
