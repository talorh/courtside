// Go live's card for a game streamed from an external app (views/app-live-card.ts): the Copy buttons for the server and
// stream key, and the status line, which asks the site every few seconds whether the app's stream is arriving.
import { api } from "./upload-net.js";

const CHECK_MS = 10_000;
const card = document.querySelector("[data-app-game]");

async function copy(button) {
	const field = document.getElementById(button.dataset.copy);
	try {
		await navigator.clipboard.writeText(field.value);
		button.textContent = "Copied";
	} catch {
		// No clipboard here (an older phone, or it was refused): select it, ready for the phone's own Copy.
		field.focus();
		field.select();
		button.textContent = "Selected: now copy";
	}
	setTimeout(() => { button.textContent = "Copy"; }, 3000);
}

// The line holds all three things it can say (the page made them): show the one that's true now.
function show(status, { live, streamed }) {
	const now = live ? "live" : streamed ? "quiet" : "waiting";
	status.classList.toggle("on", live);
	for (const says of status.querySelectorAll("[data-says]")) says.hidden = says.dataset.says !== now;
}

if (card) {
	for (const button of card.querySelectorAll("[data-copy]")) button.addEventListener("click", () => copy(button));
	const status = card.querySelector("[data-app-status]");
	const gameId = card.dataset.appGame;
	const check = async () => {
		try {
			const now = await api(`/api/live/${gameId}/app-status`, {});
			// Ended (from another phone, say) or saved: the game's page takes over.
			if (now.ended) return location.assign(`/games/${gameId}`);
			show(status, now);
			// Once it has streamed, the game is the app's: no going back to the phone's camera.
			if (now.streamed) card.querySelector("[data-app-back]")?.remove();
		} catch (err) {
			// A weak signal at the stadium: the line keeps what it last said, and the next check tries again.
			console.warn("app-status", err);
		}
		setTimeout(check, CHECK_MS);
	};
	setTimeout(check, CHECK_MS);
}
