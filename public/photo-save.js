// Saving a photo on an iPhone or iPad: a download lands in Files rather than Photos, and in the Home
// Screen app it opens a page with no way back. There the button becomes Save photo and opens the share menu with the
// photo, where Save Image puts it in Photos (share-file.js). A computer or an Android phone keeps the plain download.
import { share, shareable } from "./share-file.js";
import { isApple } from "./webapp.js";

/** The photo as the site stores it (the download's own address), as a file for the share menu. */
async function photoFile(button) {
	const res = await fetch(button.href, { redirect: "manual" });
	// An expired sign-in answers with a redirect to the sign-in page.
	if (res.type === "opaqueredirect") throw Object.assign(new Error("You've been signed out. Reload the page and sign in."), { show: true });
	if (!res.ok) throw new Error(`photo download HTTP ${res.status}`);
	return new File([await res.blob()], button.dataset.name, { type: "image/jpeg" });
}

/** Makes the page's Download photo button (the current one: a swipe brings a new one, photo-swipe.js) Save photo on an
 * iPhone or iPad. */
export function setUpSave() {
	const button = document.querySelector("[data-save-photo]");
	const hint = document.querySelector("[data-save-hint]");
	if (!button || !hint || !isApple) return;
	const say = (text) => { hint.textContent = text; hint.hidden = false; };
	if (!shareable(button.dataset.name, "image/jpeg")) {
		// No share menu for files (an older iPhone): no button that opens a page with no way back; say how instead.
		button.hidden = true;
		return say("To save it, press and hold the photo, then tap Save to Photos.");
	}
	button.firstChild.textContent = "Save photo ";
	say("Opens the share menu: tap Save Image to put it in Photos.");
	let file = null;
	button.addEventListener("click", async (e) => {
		e.preventDefault();
		try {
			file ??= await photoFile(button);
			if (await share(file) === "tap again") say("It's ready now: tap Save photo again.");
		} catch (err) {
			console.warn(`save photo: ${err}`);
			say(err.show ? err.message : "Couldn't get the photo just now. Check your connection and try again.");
		}
	});
}

setUpSave();
