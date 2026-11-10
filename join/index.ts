// The joiner Worker, courtside-join: a Durable Object that carries the ffmpeg container (server.mjs). The site binds to the
// Durable Object across Workers (its JOINER binding) and posts /join and /self-test to it; nothing else reaches it (no
// route, no domain, no Preview URL).
import { Container } from "@cloudflare/containers";

export class Joiner extends Container {
	defaultPort = 8080;
	sleepAfter = "10m";
}

export default {
	async fetch() {
		return new Response("The video joiner. The site talks to it through its Durable Object.", { status: 404 });
	},
} satisfies ExportedHandler;
