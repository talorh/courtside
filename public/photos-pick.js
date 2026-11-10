// Choosing several photos on the Photos page, to download or delete them together. Select photos
// shows a tick box on each, and tapping a photo then ticks it rather than opening it. Download sends the chosen ones
// as one zip; on an iPhone or iPad it opens the share menu with them instead, where Save Images puts them in Photos.
// Delete asks first (confirm.js), and is there only when every chosen one is the person's to delete.
import { share, shareableMany } from "./share-file.js";

const $ = (id) => document.getElementById(id);
const form = $("photopick"), bar = $("pickbar"), start = $("pick-start");
const boxes = () => [...form.querySelectorAll("input[name=id]")];
const chosen = () => boxes().filter((box) => box.checked);
const say = (text) => { $("pick-hint").textContent = text; $("pick-hint").hidden = !text; };

function update() {
	const picked = chosen();
	const n = picked.length;
	$("pick-count").textContent = n ? `${n} chosen` : "Tap the photos to choose them";
	$("pick-download").disabled = !n;
	const deletable = n > 0 && picked.every((box) => box.hasAttribute("data-mine"));
	const del = bar.querySelector(".confirm");
	del.hidden = !deletable;
	if (!deletable) del.open = false;
	$("pick-note").hidden = !n || deletable;
}

function picking(on) {
	form.classList.toggle("picking", on);
	bar.hidden = !on;
	start.hidden = on;
	if (!on) for (const box of boxes()) box.checked = false;
	say("");
	update();
}

/** The chosen photos as files, named as each downloads, for the share menu. */
async function photoFiles(picked) {
	return Promise.all(picked.map(async (box) => {
		const res = await fetch(`/photos/${box.value}/download`, { redirect: "manual" });
		if (res.type === "opaqueredirect") throw Object.assign(new Error("You've been signed out. Reload the page and sign in."), { show: true });
		if (!res.ok) throw new Error(`photo download HTTP ${res.status}`);
		const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `photo-${box.value}.jpg`;
		return new File([await res.blob()], name, { type: "image/jpeg" });
	}));
}

function setUp() {
	start.hidden = false;
	start.addEventListener("click", () => picking(true));
	$("pick-cancel").addEventListener("click", () => picking(false));
	form.addEventListener("change", update);
	// While choosing, a tap on a photo ticks it.
	form.addEventListener("click", (e) => {
		const link = e.target.closest(".photogrid a");
		if (!link || !form.classList.contains("picking")) return;
		e.preventDefault();
		const box = link.parentElement.querySelector("input[name=id]");
		box.checked = !box.checked;
		update();
	});
	// Delete sends the chosen ones with the question's answer.
	const del = bar.querySelector(".confirm form");
	del.addEventListener("submit", () => {
		for (const old of del.querySelectorAll("input[name=id]")) old.remove();
		for (const box of chosen()) del.append(Object.assign(document.createElement("input"), { type: "hidden", name: "id", value: box.value }));
	});
	if (!shareableMany()) return;
	let ready = null, readyFor = "";
	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const picked = chosen();
		const key = picked.map((box) => box.value).join(",");
		try {
			if (readyFor !== key) {
				say(`Getting ${picked.length === 1 ? "the photo" : `the ${picked.length} photos`}…`);
				ready = await photoFiles(picked);
				readyFor = key;
			}
			const result = await share(ready);
			say(result === "tap again" ? "They're ready now: tap Download again." : "");
		} catch (err) {
			console.warn(`save photos: ${err}`);
			say(err.show ? err.message : "Couldn't get the photos just now. Check your connection and try again.");
		}
	});
	$("pick-download").textContent = "Save to Photos";
}

if (form && bar && start) setUp();
