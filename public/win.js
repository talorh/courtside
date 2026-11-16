// The win pop-up (src/features/scores/views/win-pop.ts): confetti bursts from behind the card, slows and
// flutters down for the second the pop-up is up. app.css fades the pop-up in and out by itself; this throws the confetti
// and takes the pop-up off the page once it has faded.

const PHONE_PIECES = 230, MOST_PIECES = 700, PHONE_AREA = 390 * 844;
// With reduced motion nothing moves: the confetti is drawn once, as it is this long after the burst.
const STILL_AT = 0.45;
// Shapes as [width, height, round]: a card, a dot and a streamer, in px on a phone.
const SHAPES = [[9, 15, false], [9, 15, false], [10, 10, true], [5, 22, false]];

/** The confetti, each piece starting on the card's edge and thrown outwards and a little upwards. More on a bigger screen. */
export function makePieces(card, screen, colours, random = Math.random) {
	const size = Math.max(screen.width, screen.height) / 844;
	const count = Math.min(MOST_PIECES, Math.round(PHONE_PIECES * ((screen.width * screen.height) / PHONE_AREA) ** 0.7));
	const cx = card.left + card.width / 2, cy = card.top + card.height / 2, wide = screen.width > screen.height ? 1.5 : 1;
	return Array.from({ length: count }, (_, n) => {
		const angle = random() * Math.PI * 2, speed = (0.25 + random() ** 0.8) * 1250 * size;
		const [w, h, round] = SHAPES[Math.floor(random() * SHAPES.length)];
		return {
			front: n % 5 === 0, x: cx + Math.cos(angle) * card.width * 0.42, y: cy + Math.sin(angle) * card.height * 0.42,
			vx: Math.cos(angle) * speed * wide, vy: Math.sin(angle) * speed - 420 * size, drag: 3.4 + random() * 2.8, gravity: 950 * size,
			w, h, round, scale: 0.8 + random() * 0.6, turn: random() * 6.3, spin: (random() - 0.5) * 14, flip: random() * 6.3, flipSpeed: 6 + random() * 10,
			colour: colours[Math.floor(random() * colours.length)],
		};
	});
}

/** Where a piece is `t` seconds after the burst: thrown, slowed by the air, then falling at a steady flutter. */
export function placeAt(p, t) {
	const glide = (1 - Math.exp(-p.drag * t)) / p.drag;
	return { x: p.x + p.vx * glide, y: p.y + (p.vy - p.gravity / p.drag) * glide + (p.gravity * t) / p.drag, turn: p.turn + p.spin * t, flip: Math.cos(p.flip + p.flipSpeed * t) };
}

function draw(ctx, layer, pieces, t, view) {
	ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
	ctx.clearRect(0, 0, view.width, view.height);
	for (const p of pieces) {
		if (p.front !== layer) continue;
		const at = placeAt(p, t);
		ctx.save();
		ctx.translate(at.x, at.y);
		ctx.rotate(at.turn);
		ctx.scale(p.scale, p.scale * at.flip);
		ctx.fillStyle = p.colour;
		if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
		ctx.restore();
	}
}

/** Throws the confetti over the pop-up: a layer behind the card and one in front. */
export function celebrate(pop, win = window) {
	const doc = win.document;
	// A tab that isn't showing: the pop-up waits (app.css, .waiting) and plays when the page is looked at.
	if (doc.hidden) {
		pop.classList.add("waiting");
		const shown = () => {
			if (doc.hidden) return;
			doc.removeEventListener("visibilitychange", shown);
			pop.classList.remove("waiting");
			celebrate(pop, win);
		};
		doc.addEventListener("visibilitychange", shown);
		return;
	}
	const view = { width: pop.clientWidth, height: pop.clientHeight, dpr: win.devicePixelRatio || 1 };
	const layers = [...pop.querySelectorAll("canvas")].map((canvas) => {
		canvas.width = view.width * view.dpr;
		canvas.height = view.height * view.dpr;
		return canvas.getContext("2d");
	});
	const pieces = makePieces(pop.querySelector(".wincard").getBoundingClientRect(), view, pop.dataset.confetti.split(","));
	const frame = (t) => layers.forEach((ctx, i) => draw(ctx, i === 1, pieces, t, view));
	let over = false;
	// The pop-up's own fade ending (not the card's pop-in, which ends first and bubbles up here).
	pop.addEventListener("animationend", (e) => {
		if (e.target !== pop) return;
		over = true;
		pop.remove();
	});
	if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) { frame(STILL_AT); return; }
	const began = win.performance.now();
	const tick = (now) => {
		if (over) return;
		frame(Math.max(0, now - began) / 1000);
		win.requestAnimationFrame(tick);
	};
	win.requestAnimationFrame(tick);
}

const pop = globalThis.document?.querySelector(".winpop");
if (pop) celebrate(pop);
