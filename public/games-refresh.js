// Watch games: checks every 30 seconds (while the page is on screen) and reloads it when a game card changes, say from
// Processing to Ready to watch, or a game goes live. Nobody has to keep tapping reload.
const cards = (doc) => [...doc.querySelectorAll(".game, .livecard")].map((a) => `${a.className} ${a.getAttribute("href")}`).join("|");
const now = cards(document);

async function check() {
	if (document.hidden) return;
	try {
		const res = await fetch(location.href, { headers: { Accept: "text/html" } });
		if (!res.ok) return;
		if (cards(new DOMParser().parseFromString(await res.text(), "text/html")) !== now) location.reload();
	} catch (err) {
		// Offline, or the site didn't answer: leave the page as it is. (Signed out, the sign-in page comes back instead of
		// the games, which reads as a change: the reload then shows the sign-in.)
		console.warn(`refresh: ${err}`);
	}
}

setInterval(check, 30_000);
document.addEventListener("visibilitychange", check);
