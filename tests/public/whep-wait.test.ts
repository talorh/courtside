import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

type Card = { hidden: boolean };
type Whep = {
	reloadWhenOver: (page: () => Promise<Response>, reload: () => void) => () => Promise<void>;
	waitCard: (card: Card, frozenFor: () => number, over: () => void) => unknown;
	frozenClock: (video: FakeVideo, now: () => number) => () => number;
	playOnTap: (player: FakeVideo, video: FakeVideo, play: () => void) => void;
};
// A video element as far as the live player uses it, on a browser without requestVideoFrameCallback.
class FakeVideo {
	paused = false;
	ended = false;
	private on = new Map<string, Array<() => void>>();
	addEventListener(type: string, fn: () => void) { this.on.set(type, [...(this.on.get(type) ?? []), fn]); }
	fire(type: string) { for (const fn of this.on.get(type) ?? []) fn(); }
}
let shown: (() => void) | null = null;
const page = (hidden: boolean) => ({ querySelector: () => null, hidden, addEventListener: (type: string, fn: () => void) => { if (type === "visibilitychange") shown = fn; } });

async function load(hidden = false): Promise<Whep> {
	vi.stubGlobal("document", page(hidden));
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	return import("../../public/whep-wait.js");
}

describe("a family's live player once the stream is over", () => {
	it("checks once a minute, and reloads only when the page no longer has a live player", async () => {
		vi.useFakeTimers();
		const { reloadWhenOver } = await load();
		let page = '<video data-live-player data-whep="https://customer-x.cloudflarestream.com/t/webRTC/play">';
		const reload = vi.fn();
		reloadWhenOver(async () => new Response(page), reload);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(reload).not.toHaveBeenCalled();
		page = "<b>The live stream has ended</b>";
		await vi.advanceTimersByTimeAsync(60_000);
		expect(reload).toHaveBeenCalledTimes(1);
	});
	it("an external app's stream, in Stream's player, moves on the same way once it stops", async () => {
		vi.useFakeTimers();
		const { reloadWhenOver } = await load();
		let page = '<iframe data-live-player src="https://customer-x.cloudflarestream.com/t/iframe" title="Live stream"></iframe>';
		const reload = vi.fn();
		reloadWhenOver(async () => new Response(page), reload);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(reload).not.toHaveBeenCalled();
		page = "<b>The live stream has ended</b>";
		await vi.advanceTimersByTimeAsync(60_000);
		expect(reload).toHaveBeenCalledTimes(1);
	});
	it("leaves the page alone when it can't check (signed out, offline) or nobody's looking", async () => {
		vi.useFakeTimers();
		const { reloadWhenOver } = await load();
		const reload = vi.fn();
		reloadWhenOver(async () => new Response("<p>Sign in</p>", { status: 302 }), reload);
		reloadWhenOver(async () => { throw new TypeError("Failed to fetch"); }, reload);
		await vi.advanceTimersByTimeAsync(120_000);
		vi.stubGlobal("document", page(true));
		const asked = vi.fn(async () => new Response("<p>Saved</p>"));
		reloadWhenOver(asked, reload);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(asked).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});
	it("checks at once when asked (the picture froze), and when the page is looked at again", async () => {
		const { reloadWhenOver } = await load();
		const reload = vi.fn();
		const check = reloadWhenOver(async () => new Response("<b>The live stream has ended</b>"), reload);
		await check();
		expect(reload).toHaveBeenCalledTimes(1);
		await shown?.();
		expect(reload).toHaveBeenCalledTimes(2);
	});
});

describe("a family's live player while the picture is frozen", () => {
	it("asks whether the stream is over before it says anything, and says the stream will resume only if it's still frozen after 5 seconds", async () => {
		vi.useFakeTimers();
		const { waitCard } = await load();
		const card = { hidden: true };
		let frozen = 0;
		const over = vi.fn();
		waitCard(card, () => frozen, over);
		await vi.advanceTimersByTimeAsync(2000);
		expect(over).not.toHaveBeenCalled();
		frozen = 3000;
		await vi.advanceTimersByTimeAsync(1000);
		expect(over).toHaveBeenCalledTimes(1);
		expect(card.hidden).toBe(true);
		frozen = 5000;
		await vi.advanceTimersByTimeAsync(1000);
		expect(card.hidden).toBe(false);
		expect(over).toHaveBeenCalledTimes(1);
	});
	it("asks again every 5 seconds for the first 20 seconds of a freeze, then leaves it to the once-a-minute check", async () => {
		vi.useFakeTimers();
		const { waitCard } = await load();
		const card = { hidden: true };
		let frozen = 0;
		const over = vi.fn();
		waitCard(card, () => frozen, over);
		for (frozen = 1000; frozen <= 180_000; frozen += 1000) await vi.advanceTimersByTimeAsync(1000);
		expect(over).toHaveBeenCalledTimes(4);
		expect(card.hidden).toBe(false);
	});
	it("takes the card away when the picture is back, and asks afresh at the next freeze", async () => {
		vi.useFakeTimers();
		const { waitCard } = await load();
		const card = { hidden: true };
		let frozen = 6000;
		const over = vi.fn();
		waitCard(card, () => frozen, over);
		await vi.advanceTimersByTimeAsync(1000);
		expect(card.hidden).toBe(false);
		frozen = 0;
		await vi.advanceTimersByTimeAsync(1000);
		expect(card.hidden).toBe(true);
		frozen = 3000;
		await vi.advanceTimersByTimeAsync(1000);
		expect(over).toHaveBeenCalledTimes(2);
	});
});

describe("a family's paused live player", () => {
	it("isn't a frozen picture: no card while it's paused, and the time paused doesn't count once it plays", async () => {
		const { frozenClock } = await load();
		const video = new FakeVideo();
		let now = 1000;
		const frozenFor = frozenClock(video, () => now);
		expect(frozenFor()).toBe(0); // no picture yet
		video.fire("timeupdate");
		now += 2000;
		expect(frozenFor()).toBe(2000);
		video.paused = true;
		video.fire("pause");
		now += 60_000;
		expect(frozenFor()).toBe(0);
		video.paused = false;
		video.fire("play");
		expect(frozenFor()).toBe(2000);
		now += 6000;
		expect(frozenFor()).toBe(8000); // still no picture once it plays: the card can say so
	});
	it("a connection closed to start over, which ends the video's stream, and the new one that plays it again carry the freeze on as before", async () => {
		const { frozenClock } = await load();
		const video = new FakeVideo();
		let now = 1000;
		const frozenFor = frozenClock(video, () => now);
		video.fire("timeupdate");
		now += 12_000;
		Object.assign(video, { paused: true, ended: true });
		video.fire("pause");
		now += 3000;
		expect(frozenFor()).toBe(15_000);
		Object.assign(video, { paused: false, ended: false });
		video.fire("play");
		expect(frozenFor()).toBe(15_000);
	});
	it("plays when it's tapped, where the browser's own controls didn't", async () => {
		vi.useFakeTimers();
		const { playOnTap } = await load();
		const player = new FakeVideo(), video = new FakeVideo();
		const play = vi.fn(() => { video.paused = false; });
		playOnTap(player, video, play);
		video.paused = true;
		player.fire("click");
		await vi.advanceTimersByTimeAsync(0);
		expect(play).toHaveBeenCalledTimes(1);
		// A browser whose controls play it on the tap themselves: not played twice.
		video.paused = true;
		player.fire("click");
		video.paused = false;
		await vi.advanceTimersByTimeAsync(0);
		expect(play).toHaveBeenCalledTimes(1);
		// A tap that pauses a playing video leaves it paused.
		player.fire("click");
		video.paused = true;
		await vi.advanceTimersByTimeAsync(0);
		expect(play).toHaveBeenCalledTimes(1);
	});
});
