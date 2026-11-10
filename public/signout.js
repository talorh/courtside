// Sign out: the door at the top right, and any link marked data-signout (the not-a-member page). After asking "Sign
// out?", the page has the site end this device's session (POST /signout) and stays put, showing Signed out with Sign in
// again: a page that went away would leave the Home Screen app stuck (no address bar). Without JavaScript the link is
// a plain page with the one button.

/** Asks the site to end this device's session (it clears the cookie). False if the site couldn't be reached. */
export async function endSignIn(fetcher = fetch) {
	try {
		const res = await fetcher("/signout", { method: "POST", headers: { Accept: "application/json" }, cache: "no-store" });
		return res.ok;
	} catch (err) {
		console.warn(`sign out: ${err}`);
		return false;
	}
}

function dialog(heading, words) {
	const scrim = document.createElement("div"), box = document.createElement("div");
	const title = document.createElement("h2"), text = document.createElement("p"), row = document.createElement("div");
	scrim.className = "scrim";
	box.className = "modal";
	box.setAttribute("role", "dialog");
	box.setAttribute("aria-modal", "true");
	box.setAttribute("aria-labelledby", "signout-h");
	title.id = "signout-h";
	title.textContent = heading;
	text.textContent = words;
	row.className = "row-actions";
	box.append(title, text, row);
	scrim.append(box);
	document.body.append(scrim);
	return { scrim, title, text, row, close: () => scrim.remove() };
}

const button = (label, className) => Object.assign(document.createElement("button"), { type: "button", className, textContent: label });

/** Signed out: Sign in again opens the sign-in page (a new code). No way back to the old page. */
function signedOut() {
	const d = dialog("Signed out", "You're signed out on this phone or computer. Signing in again takes a new code from your email.");
	const again = button("Sign in again", "btn primary");
	d.row.append(again);
	again.onclick = () => location.assign("/signin");
	again.focus();
}

function askFirst() {
	const d = dialog("Sign out?", "You'll need a new code from your email to sign in again.");
	const yes = button("Sign out", "btn danger"), no = button("Cancel", "btn");
	d.row.append(yes, no);
	no.onclick = d.close;
	d.scrim.addEventListener("click", (e) => { if (e.target === d.scrim && !yes.disabled) d.close(); });
	d.scrim.addEventListener("keydown", (e) => { if (e.key === "Escape" && !yes.disabled) d.close(); });
	yes.onclick = async () => {
		yes.disabled = no.disabled = true;
		yes.textContent = "Signing out…";
		if (await endSignIn()) {
			d.close();
			return signedOut();
		}
		d.text.textContent = "Couldn't reach the site. Check your connection, then try again.";
		yes.textContent = "Sign out";
		yes.disabled = no.disabled = false;
	};
	yes.focus();
}

for (const link of document.querySelectorAll("[data-signout]")) link.addEventListener("click", (e) => { e.preventDefault(); askFirst(); });
