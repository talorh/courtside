// A photo's page on a phone: swiping between photos like a camera roll. The newer and older photos sit either side of
// the picture and follow the finger, the swipe snaps to the next one, and the page's address (replaced, not added to,
// so Back still goes to All photos), caption and buttons change to match without a reload. Each neighbour shows its
// small thumbnail at once, blurred, until its full picture has come; the pages either side are read in advance, so
// the photos beyond them are loading before a swipe. Newer and Older stay as links.
import { setUpSave } from "./photo-save.js";
import { facts, forget, known, opened, pageFor, show } from "./photo-pages.js";

// A swipe: at least this far across, more across than up or down (a scroll), or a quick flick.
const LEAST_PX = 50;
const FLICK_PX_PER_MS = 0.5;
const SNAP_MS = 220;

const img = (src, cls) => Object.assign(document.createElement("img"), { src, alt: "", className: cls });
/** A slide: the blurred thumbnail at once (or "Loading…" when the page had none), the full picture faded in when it has
 * loaded. A picture that fails to load is asked for once more with a fresh link, from the photo's page. */
function slide(side, big = side?.src ? img(side.src, "big") : null) {
	const el = document.createElement("div");
	el.className = "slide";
	if (side?.thumb) el.append(img(side.thumb, "blur"));
	else if (big) el.append(Object.assign(document.createElement("span"), { className: "loading", textContent: "Loading…" }));
	if (big) {
		big.classList.add("big");
		el.append(big);
		const shown = () => { big.classList.add("in"); el.querySelector(".loading")?.remove(); };
		if (big.complete && big.naturalWidth) shown(); else big.addEventListener("load", shown, { once: true });
		big.addEventListener("error", async () => {
			if (!side?.id || big.dataset.retried) return;
			big.dataset.retried = "1";
			forget(side.id);
			const fresh = await pageFor(side.id);
			if (fresh?.src) big.src = fresh.src;
		}, { once: true });
	}
	return el;
}
const warm = (side) => { if (side) { for (const src of [side.thumb, side.src]) if (src) new Image().src = src; } };
const idle = (job) => ("requestIdleCallback" in window ? requestIdleCallback(job) : setTimeout(job, 300));

function setUp(figure) {
	// The opened page's facts, from a copy taken before anything here changes, so a swipe back puts its own parts back.
	let cur = opened(document);
	const width = () => figure.clientWidth;
	const track = document.createElement("div");
	track.className = "track";
	const picture = figure.querySelector("img");
	picture.alt = "";
	track.append(slide(cur.newer), slide({ thumb: cur.thumb }, picture), slide(cur.older));
	figure.replaceChildren(track);
	// Without a snap the style is settled first (a snap still running is cut short, not carried on to its end). The middle
	// slide's place is a third of the track, not a width in pixels, so it stays in place when the phone is turned.
	const at = (x, snap) => { track.classList.toggle("snap", snap); if (!snap) void track.offsetWidth; track.style.transform = `translateX(calc(-100% / 3 + ${x}px))`; };
	/** Once the snap has ended: its transitionend, or a little after its time when none comes (reduced motion). */
	const snapped = () => new Promise((resolve) => {
		const done = () => { track.removeEventListener("transitionend", done); clearTimeout(timer); resolve(); };
		const timer = setTimeout(done, SNAP_MS + 100);
		track.addEventListener("transitionend", done);
	});
	at(0, false);
	// The pages either side, read while nothing's happening, so their own neighbours' pictures start loading now.
	const lookAhead = () => idle(async () => { for (const side of [cur.newer, cur.older]) { const f = side && await pageFor(side.id); if (f) { warm(f.newer); warm(f.older); } } });
	lookAhead();

	/** The page becomes `f`'s: the figure's facts (a reload reads them back), the caption, Newer and Older, All photos (its
	 * page and place), the side panel. */
	function apply(f) {
		cur = f;
		figure.dataset.id = f.id;
		figure.dataset.thumb = f.thumb;
		for (const which of ["newer", "older"]) {
			if (f[which]) { figure.dataset[which] = f[which].id; figure.dataset[`${which}Src`] = f[which].src; figure.dataset[`${which}Thumb`] = f[which].thumb; }
			else for (const key of [which, `${which}Src`, `${which}Thumb`]) delete figure.dataset[key];
		}
		show(f);
		setUpSave();
		lookAhead();
	}

	// After the snap: the neighbour's slide is the centre, the old centre goes to the other side, and the far side is the
	// neighbour's own neighbour (known already when its page was read in advance). A page that can't be read (a weak
	// signal) is opened as usual instead, so the buttons are never another photo's.
	let busy = false;
	async function become(which) {
		const next = cur[which];
		history.replaceState(history.state, "", `/photos/${next.id}`);
		const [left, centre, right] = [...track.children];
		const was = { id: cur.id, src: cur.src, thumb: cur.thumb };
		let f = known(next.id);
		const far = f ? f[which] : null;
		track.replaceChildren(which === "older" ? centre : slide(far), which === "older" ? right : left, which === "older" ? slide(far) : centre);
		at(0, false);
		f ??= await pageFor(next.id);
		if (!f || f.id !== next.id) return location.assign(`/photos/${next.id}`);
		if (cur.id !== was.id) return;
		if (!far && f[which]) track.children[which === "older" ? 2 : 0].replaceWith(slide(f[which]));
		apply(f);
	}

	let startX = 0, startY = 0, startAt = 0, tracking = false, dx = 0;
	figure.addEventListener("touchstart", (e) => {
		if (e.touches.length !== 1) return;
		startX = e.touches[0].clientX; startY = e.touches[0].clientY; startAt = Date.now(); tracking = true; dx = 0;
	}, { passive: true });
	figure.addEventListener("touchmove", (e) => {
		if (!tracking || e.touches.length !== 1) return;
		dx = e.touches[0].clientX - startX;
		const dy = e.touches[0].clientY - startY;
		if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 10) { tracking = false; return at(0, true); }
		// No photo that way: the picture gives a little, and comes back.
		const wall = (dx < 0 && !cur.older) || (dx > 0 && !cur.newer);
		at(wall ? dx / 4 : dx, false);
	}, { passive: true });
	const settle = () => {
		if (!tracking) return;
		tracking = false;
		if (busy) return at(0, true);
		const flick = Math.abs(dx) / Math.max(1, Date.now() - startAt) > FLICK_PX_PER_MS;
		const which = dx < 0 ? "older" : "newer";
		if ((Math.abs(dx) < LEAST_PX && !flick) || !cur[which]) return at(0, true);
		at(which === "older" ? -width() : width(), true);
		busy = true;
		snapped().then(() => become(which)).finally(() => { busy = false; });
	};
	figure.addEventListener("touchend", settle, { passive: true });
	figure.addEventListener("touchcancel", () => { tracking = false; at(0, true); }, { passive: true });
}

const figure = document.querySelector(".photoview");
const start = facts(document);
if (figure && start && (start.newer || start.older) && "ontouchstart" in window) setUp(figure);
