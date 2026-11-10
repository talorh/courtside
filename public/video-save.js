// Saving a game's video or a highlight clip on an iPhone or iPad, as for photos. A clip (a few MB, a
// couple of hundred at most) goes through the share menu, where Save Video puts it in Photos (share-file.js). A whole
// game is 1 to 3 GB, too big for that (the phone would have to hold all of it first), so it still goes to Files, and
// the page says how to get it into Photos; in the Home Screen app the button gets the game's own link and becomes Open in
// Safari, so the app isn't left on a page with no way back. A computer or an Android phone keeps the plain downloads.
import { fetchFile, share, shareable } from "./share-file.js";
import { inWebApp, isApple } from "./webapp.js";

const say = (el, text) => { el.textContent = text; el.hidden = false; };
const FILES = "It goes to Files (a whole game is 1 to 3 GB, so use Wi-Fi). To put it in Photos, open it in Files, tap Share, then Save Video.";

/** A download's signed Stream link and file name from the site (logged, for a game), or the site's reason it isn't ready. */
async function link(api) {
	const res = await fetch(api, { redirect: "manual" });
	// An expired sign-in answers with a redirect to the sign-in page.
	if (res.type === "opaqueredirect") throw Object.assign(new Error("You've been signed out. Reload the page and sign in."), { show: true });
	const json = await res.json().catch(() => null);
	if (json?.ok) return json.data;
	throw Object.assign(new Error(json?.error?.message ?? `HTTP ${res.status}`), { show: Boolean(json?.error?.message) });
}

function clips(hint) {
	if (!shareable("clip.mp4", "video/mp4")) return;
	say(hint, "To put a clip in Photos, tap Save on it, then Save Video in the share menu.");
	for (const button of document.querySelectorAll("[data-save-clip]")) {
		const label = button.firstChild;
		label.textContent = "Save ";
		let file = null, busy = false;
		button.addEventListener("click", async (e) => {
			e.preventDefault();
			if (busy) return;
			busy = true;
			try {
				if (!file) {
					const { url, name } = await link(`/api/clips/${button.dataset.saveClip}/download`);
					file = await fetchFile(url, name, "video/mp4", (done) => { label.textContent = `Getting ${Math.round(done * 100)}% `; });
					label.textContent = "Save ";
				}
				if (await share(file) === "tap again") say(hint, "The clip's ready now: tap Save on it again.");
			} catch (err) {
				label.textContent = "Save ";
				console.warn(`save clip: ${err}`);
				say(hint, err.show ? err.message : "Couldn't get the clip just now. Check your connection and try again.");
			} finally {
				busy = false;
			}
		});
	}
}

function game(button, hint) {
	say(hint, FILES);
	// In Safari the download goes to Files and the page stays put, so it's left as it is.
	if (!inWebApp()) return;
	let ready = false;
	button.addEventListener("click", async (e) => {
		if (ready) return; // the game's own link now: Safari opens it
		e.preventDefault();
		try {
			const { url } = await link(`/api/videos/${button.dataset.saveGame}/download/hd`);
			Object.assign(button, { href: url, target: "_blank", rel: "noopener" });
			button.firstChild.textContent = "Open in Safari to download ";
			ready = true;
			say(hint, `Tap Open in Safari to download, then Download. ${FILES}`);
		} catch (err) {
			console.warn(`save game: ${err}`);
			say(hint, err.show ? err.message : "Couldn't get the video just now. Check your connection and try again.");
		}
	});
}

if (isApple) {
	const clipHint = document.querySelector("[data-save-clip-hint]");
	const gameButton = document.querySelector("[data-save-game]"), gameHint = document.querySelector("[data-save-game-hint]");
	if (clipHint) clips(clipHint);
	if (gameButton && gameHint) game(gameButton, gameHint);
}
