import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { manifest as makeManifest } from "../../src/app/club-files.ts";

const read = (path: string) => readFileSync(`public/${path}`);

/** A PNG's width and height, from its header. */
const pngSize = (bytes: Buffer) => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

describe("the Home Screen app's manifest", () => {
	const manifest = JSON.parse(makeManifest());

	it("opens the home page full screen, wherever on the site it was added from, through the spinner", () => {
		// start_url /?app: the site answers it with the spinner at once; id stays / so phones keep the app they have.
		expect(manifest).toMatchObject({ name: "Courtside", short_name: "Courtside", id: "/", start_url: "/?app", scope: "/", display: "standalone" });
		// Android's own launch screen, before the first page: the club's deep colour, like the spinner.
		expect(manifest.background_color).toBe("#14274E");
		// Never locked upright: Go live needs the phone sideways.
		expect(manifest).not.toHaveProperty("orientation");
	});
	it("has the club's logo at the sizes Android asks for, each file the size it says", () => {
		const icons = manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;
		expect(icons.map((i) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
		expect(icons.filter((i) => i.purpose === "maskable")).toHaveLength(1);
		for (const icon of icons) expect(pngSize(read(icon.src.slice(1)))).toBe(icon.sizes);
	});
});
