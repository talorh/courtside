// The Documentation AI assistant (admin area, Documentation): sends the question, shows the answer as plain text, and
// links each section it was answered from (a link opens that section, as the contents do: docs.js).
import { timeoutSignal } from "./net-timeout.js";

// Its longer answer, read from the whole documentation, takes seconds; a link that stalls gives up well after that, so
// the button can be tapped again.
const ASK_TIMEOUT_MS = 90_000;
const form = document.getElementById("docs-ai");
const box = document.getElementById("docs-ai-q");
const out = document.getElementById("docs-ai-a");
const button = form?.querySelector("button");

/** The answer, then "From:" and a link to each section it used. */
function show(answer, sources = []) {
	const text = Object.assign(document.createElement("p"), { textContent: answer });
	text.className = "docs-ai-text";
	const parts = [text];
	if (sources.length) {
		const from = Object.assign(document.createElement("p"), { className: "small docs-ai-from", textContent: "From: " });
		sources.forEach((s, i) => {
			if (i) from.append(", ");
			from.append(Object.assign(document.createElement("a"), { href: `#${s.id}`, textContent: `${s.n}. ${s.title}` }));
		});
		parts.push(from);
	}
	out.replaceChildren(...parts);
	out.hidden = false;
}

form?.addEventListener("submit", async (e) => {
	e.preventDefault();
	const question = box.value.trim();
	if (question.length < 2) { box.focus(); return; }
	button.disabled = true;
	show("Reading the documentation…");
	try {
		const res = await fetch("/admin/docs/ask", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }), redirect: "manual",
			signal: timeoutSignal(ASK_TIMEOUT_MS),
		});
		// A signed-out post gets a 401 JSON reply, whose message is shown below; a redirect to the sign-in page is caught too.
		if (res.type === "opaqueredirect") return show("You've been signed out. Reload the page and sign in, then ask again.");
		const body = await res.json();
		if (body.ok) show(body.data.answer, body.data.sources);
		else show(body.error.message);
	} catch (err) {
		console.warn(`docs ask: ${err}`);
		show("Couldn't reach the assistant. Check your connection and try again.");
	} finally {
		button.disabled = false;
	}
});
