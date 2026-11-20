// Watch games: checks every 30 seconds (while the page is on screen) and reloads it when a game card changes, say from
// Processing to Ready to watch, or a game goes live. Nobody has to keep tapping reload.
import { timeoutSignal } from "./net-timeout.js";

// One check at a time, and a stalled one gives up before the next is due, so they never pile up on a weak signal.
const CHECK_TIMEOUT_MS = 20_000;
let checking = false;
const cards = (doc) => [...doc.querySelectorAll(".game, .livecard")].map((a) => `${a.className} ${a.getAttribute("href")}`).join("|");
const now = cards(document);

async function check() {
	if (document.hidden || checking) return;
	checking = true;
	try {
		const res = await fetch(location.href, { headers: { Accept: "text/html" }, signal: timeoutSignal(CHECK_TIMEOUT_MS) });
		if (!res.ok) return;
		if (cards(new DOMParser().parseFromString(await res.text(), "text/html")) !== now) location.reload();
	} catch (err) {
		// Offline, or the site didn't answer: leave the page as it is. (Signed out, the sign-in page comes back instead of
		// the games, which reads as a change: the reload then shows the sign-in.)
		console.warn(`refresh: ${err}`);
	} finally {
		checking = false;
	}
}

setInterval(check, 30_000);
document.addEventListener("visibilitychange", check);
