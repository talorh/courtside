// The site as an app on the Home Screen (Help: How to install as an app). Opened from there, there's no address bar or
// reload button (pull down from the top of a page reloads it: pull-refresh.js), and on an iPhone the app keeps a sign-in
// apart from Safari's.
// Chrome (Android and computers), Edge and Samsung Internet pop up their own "Install app" banner on any page, even over
// Go live's buttons, so it's held back here and Help's Install button offers it instead. An iPhone never lets a page
// offer it (Apple's rule): there, Help shows the Share steps.

/** Opened from the Home Screen icon rather than in the browser. */
export const inWebApp = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

const box = document.getElementById("install-box");
let offer = null, installed = false;

// Help's box. It stays hidden where there's nothing to offer (Safari on an iPhone, Firefox).
function show(text, canInstall = false) {
	if (!box) return;
	box.querySelector("[data-note]").textContent = text;
	box.querySelector("button").hidden = !canInstall;
	box.hidden = false;
}

/** An iPhone or iPad (an iPad can say it's a Mac). It never gets an Install button, so the box says so rather than leave a
 * gap; and it saves a photo through the share menu (photo-save.js). */
const ua = navigator.userAgent;
export const isApple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

if (inWebApp()) {
	show("You're in the app now, so you're all set.");
} else if (isApple) {
	show("No Install button on an iPhone or iPad: Apple doesn't let a website install itself. The iPhone steps below take a few seconds.");
}
window.addEventListener("beforeinstallprompt", (e) => {
	e.preventDefault();
	if (inWebApp()) return; // already the app
	offer = e;
	show("One tap installs it.", true);
});
window.addEventListener("appinstalled", () => {
	offer = null;
	installed = true;
	show(`Installed. Look for ${document.documentElement?.dataset?.site || "the site"} on your Home Screen.`);
});
box?.querySelector("button").addEventListener("click", async () => {
	if (!offer) return;
	const asked = offer;
	offer = null; // a browser lets a page ask only once
	try {
		await asked.prompt();
		const { outcome } = await asked.userChoice;
		if (!installed) show(outcome === "accepted" ? "Installing. It'll be on your Home Screen in a moment." : "No worries. The steps below work any time.");
	} catch (err) {
		console.warn(`install: ${err}`);
		show("That didn't work this time. The steps below do the same thing.");
	}
});
