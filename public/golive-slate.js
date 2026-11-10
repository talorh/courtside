// Go live, paused (half-time, say): the picture families see instead of the camera. A Game Break card in the club's
// deep colour with court lines in its bright one, the club's logo and "Live stream will resume shortly", redrawn every second so
// the live player knows it's still going.
const W = 1280, H = 720;

// Loaded with the page, so they're ready by half-time (until then the card is drawn without them, and fixed a second later).
const head = Object.assign(new Image(), { src: "/club-mark.webp", onerror: () => console.warn("game break: the club's logo didn't load") });
// The club's colours, from the stylesheet's tokens (club.css); the fallbacks are only for a page without them.
const token = (name, fallback) => (globalThis.document ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : "") || fallback;
const TITLE = '800 116px "Saira Semi Condensed", system-ui, sans-serif';
const LINE = "700 46px Manrope, system-ui, sans-serif";
for (const font of [TITLE, LINE]) globalThis.document?.fonts?.load(font).catch((err) => console.warn(`game break: font: ${err}`));

/** Part of a court: the three-point line off to the left, the key and its free-throw circle in the top right. */
function court(ctx) {
	ctx.strokeStyle = token("--club", "#2F6FDB");
	ctx.lineWidth = 9;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.ellipse(-480, 170, 760, 720, 0, -0.75, 1.0);
	ctx.moveTo(1010, -10);
	ctx.lineTo(1010, 290);
	ctx.lineTo(1300, 290);
	ctx.moveTo(1290, 290);
	ctx.arc(1150, 290, 140, 0, Math.PI);
	ctx.stroke();
	ctx.setLineDash([24, 20]);
	ctx.beginPath();
	ctx.arc(1150, 290, 140, Math.PI, Math.PI * 2);
	ctx.stroke();
	ctx.setLineDash([]);
}

function draw(ctx) {
	ctx.fillStyle = token("--bar", "#14274E");
	ctx.fillRect(0, 0, W, H);
	const shade = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 820);
	shade.addColorStop(0, "rgba(0,0,0,0)");
	shade.addColorStop(1, "rgba(0,0,0,.55)");
	ctx.fillStyle = shade;
	ctx.fillRect(0, 0, W, H);
	court(ctx);
	ctx.fillStyle = "#fff";
	ctx.textAlign = "center";
	ctx.font = TITLE;
	ctx.fillText("GAME BREAK", W / 2, 165);
	if (head.complete && head.naturalWidth) {
		const w = 330, h = (w * head.naturalHeight) / head.naturalWidth;
		ctx.drawImage(head, (W - w) / 2, 380 - h / 2, w, h);
	}
	ctx.font = LINE;
	ctx.fillText("Live stream will resume shortly", W / 2, 640);
}

/** Returns { track, stop() }: a video track to send while paused. */
export function pausedCard() {
	const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
	const ctx = canvas.getContext("2d");
	draw(ctx);
	const timer = setInterval(() => draw(ctx), 1000);
	const track = canvas.captureStream(5).getVideoTracks()[0];
	return {
		track,
		stop() {
			clearInterval(timer);
			track.stop();
		},
	};
}
