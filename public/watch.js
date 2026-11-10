// Game page: full screen, "Mark" buttons (clip maker, coach notes), jump-to-time links and "Carry on from", which
// read and set the Stream player's position through the vendored Player SDK (/stream-sdk.js, loaded first).
const frame = document.querySelector(".player iframe");

// The player, or a live stream from the Go live page (a plain video). iPhone can't make part of a page full screen,
// but its own video player can go full screen.
function fullscreen() {
	const button = document.getElementById("fullscreen");
	const target = frame ?? document.querySelector(".player video");
	if (!button || !target) return;
	const enter = document.fullscreenEnabled ? () => target.requestFullscreen() : target.webkitEnterFullscreen ? () => target.webkitEnterFullscreen() : null;
	if (!enter) {
		button.parentElement.hidden = true;
		return;
	}
	button.addEventListener("click", () => {
		Promise.resolve().then(enter).catch((err) => {
			console.error("Full screen failed", err);
			const note = button.nextElementSibling ?? button.parentElement.appendChild(document.createElement("span"));
			note.className = "small";
			note.textContent = "Full screen isn't available here. Use the full-screen button in the player.";
		});
	});
}

const clock = (seconds) => {
	const s = Math.max(0, Math.floor(seconds));
	const mm = String(Math.floor((s % 3600) / 60));
	const ss = String(s % 60).padStart(2, "0");
	return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

function playerControls() {
	if (!frame || typeof window.Stream !== "function") return;
	const player = window.Stream(frame);
	for (const button of document.querySelectorAll("[data-mark]")) {
		const input = document.getElementById(button.dataset.mark);
		if (!input) continue;
		button.hidden = false;
		button.addEventListener("click", () => {
			input.value = clock(player.currentTime);
			input.dispatchEvent(new Event("input"));
		});
	}
	for (const link of document.querySelectorAll("[data-seek]")) {
		link.addEventListener("click", (e) => {
			e.preventDefault();
			player.currentTime = Number(link.dataset.seek);
			// Autoplay can be refused until the viewer has tapped the player; the seek still happened.
			player.play().catch((err) => console.warn("Play after jump refused", err));
			frame.scrollIntoView({ behavior: "smooth", block: "center" });
		});
	}
}

// Remembers how far into a full game this device got (in this browser only), and offers to carry on from there next
// time. Forgotten once the game is watched to the end. Storage can be blocked (private browsing): then it just doesn't show.
const RESUME_MIN = 60, END_MARGIN = 90;
function resume() {
	const id = frame?.dataset.resume;
	if (!id || typeof window.Stream !== "function") return;
	const key = `courtside-resume-${id}`;
	const store = (fn) => { try { return fn(window.localStorage); } catch (err) { console.warn("Can't remember the position", err); return null; } };
	const saved = Number(store((s) => s.getItem(key)) ?? 0);
	const player = window.Stream(frame);
	let row = null;
	if (saved >= RESUME_MIN) {
		// Its own row: the full-screen row is hidden on iPhones.
		row = document.createElement("div");
		row.className = "row-actions";
		const button = row.appendChild(document.createElement("button"));
		button.type = "button";
		button.className = "btn primary";
		button.textContent = `Carry on from ${clock(saved)}`;
		button.addEventListener("click", () => {
			player.currentTime = saved;
			player.play().catch((err) => console.warn("Play after jump refused", err));
			row.remove();
		});
		frame.closest(".player").after(row);
	}
	let last = 0;
	player.addEventListener("timeupdate", () => {
		const t = player.currentTime;
		if (Math.abs(t - last) < 5) return;
		last = t;
		if (player.duration && t > player.duration - END_MARGIN) store((s) => s.removeItem(key));
		else if (t >= RESUME_MIN) store((s) => s.setItem(key, String(Math.floor(t))));
		if (row && t >= RESUME_MIN) row.remove();
	});
	player.addEventListener("ended", () => store((s) => s.removeItem(key)));
}

fullscreen();
playerControls();
resume();
