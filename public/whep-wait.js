// Game page, live player: what a family sees when the picture stops. The stream may have ended (the page moves on to
// say so, and to the saved video later), or the filming phone's page died or lost its signal (a card over the last
// frame says the stream will resume). A picture the family paused isn't stopped: no card, and a tap plays it.

/**
 * The live page doesn't reload itself (that would cut the picture and the sound), so this asks for the page again:
 * when it no longer has a live player (the stream has ended, or the game's video is ready), it reloads to show that.
 * It asks once a minute, when the page is looked at again, and whenever the returned check is called (the picture
 * froze). Signed out or offline, it leaves the page as it is.
 */
export function reloadWhenOver(page = () => fetch(location.href, { headers: { Accept: "text/html" }, redirect: "manual" }), reload = () => location.reload()) {
	const check = async () => {
		if (document.hidden) return;
		try {
			const res = await page();
			if (res.ok && !(await res.text()).includes("data-live-player")) reload();
		} catch (err) {
			console.warn(`live player: ${err}`);
		}
	};
	setInterval(check, 60_000);
	document.addEventListener("visibilitychange", check);
	return check;
}

/**
 * A frozen picture: the game may have ended, or the filming phone's page died or lost its signal. From 3 seconds
 * frozen (`frozenFor()`, in ms) it asks `over()` whether the stream has ended, again every 5 seconds for the first
 * 20 (End game tells the site as the picture stops; each ask is a page for the site to make, for every family
 * watching); `card` (the stream will resume shortly) shows over the last frame only once it's been frozen for 5, so
 * an ended game goes straight to saying so. Frames again: the card goes.
 */
export function waitCard(card, frozenFor, over) {
	let asked = -1; // which 5 seconds of this freeze was last asked about
	return setInterval(() => {
		const ms = frozenFor();
		const turn = ms < 3000 ? -1 : Math.floor((ms - 3000) / 5000);
		if (turn > asked && ms < 20_000) over();
		asked = turn;
		card.hidden = ms < 5000;
	}, 1000);
}

/** How long the picture has been frozen, in ms (for waitCard): 0 before the first frame, and while the video is paused
 * (a family pausing it isn't a freeze, and the card would cover the controls that play it again). Time spent paused
 * is left out once it plays. A video that stopped because its stream ended (a connection closed to start over) isn't
 * paused by anyone: it's still frozen. */
export function frozenClock(video, now = () => Date.now()) {
	let lastFrameAt = 0, pausedAt = null;
	const held = () => video.paused && !video.ended;
	const seen = () => { lastFrameAt = now(); if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(seen); };
	if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(seen); else video.addEventListener("timeupdate", seen);
	video.addEventListener("pause", () => { if (held()) pausedAt = now(); });
	video.addEventListener("play", () => {
		if (pausedAt !== null && lastFrameAt) lastFrameAt += now() - pausedAt;
		pausedAt = null;
	});
	return () => (lastFrameAt && !held() ? now() - lastFrameAt : 0);
}

/** A tap on the paused player plays it. Looked at once the tap is over: where the browser's own controls played it,
 * or the tap was one that paused it, it's left alone. */
export function playOnTap(player, video, play) {
	player.addEventListener("click", () => {
		if (!video.paused) return;
		setTimeout(() => { if (video.paused) play(); }, 0);
	});
}
