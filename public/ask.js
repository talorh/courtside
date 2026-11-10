// Ask Virtual Team Manager (Help page): sends the question, shows the answer as plain text.
import { helperName } from "./team.js";
import { teamHeaders } from "./upload-net.js";

const form = document.getElementById("ask");
const box = document.getElementById("ask-q");
const out = document.getElementById("ask-a");
const button = form?.querySelector("button");

// A link to a question (/help#safety) opens it: the questions start closed.
const openAsked = () => {
	const target = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
	if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView(); }
};
openAsked();
window.addEventListener("hashchange", openAsked);

form?.addEventListener("submit", async (e) => {
	e.preventDefault();
	const question = box.value.trim();
	if (question.length < 2) { box.focus(); return; }
	button.disabled = true;
	out.hidden = false;
	out.textContent = `${helperName()} is thinking…`;
	try {
		const res = await fetch("/api/ask", {
			method: "POST", headers: { "Content-Type": "application/json", ...teamHeaders() }, body: JSON.stringify({ question }), redirect: "manual",
		});
		// An expired sign-in answers with a redirect to the sign-in page.
		if (res.type === "opaqueredirect") { out.textContent = "You've been signed out. Reload the page and sign in, then ask again."; return; }
		const body = await res.json();
		out.textContent = body.ok ? body.data.answer : body.error.message;
	} catch (err) {
		console.warn(`ask: ${err}`);
		out.textContent = `Couldn't reach ${helperName()}. Check your connection and try again.`;
	} finally {
		button.disabled = false;
	}
});
