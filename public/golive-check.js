// Go live: is this browser able to stream, and is it the one to use? On Android that's Chrome (others, like Firefox,
// work too: they're offered "Open in Chrome" but allowed). On iPhone every browser is Safari underneath (Apple's rule), so
// Safari or Chrome both work and there's nothing to switch to. The real trap on both is the browser built into
// another app (a link opened from WhatsApp or Facebook), which often can't use the camera.
import { inWebApp } from "./webapp.js";

const GET_CHROME = "https://play.google.com/store/apps/details?id=com.android.chrome";

// The recording's format: MP4/H.264 first (Android and iPhone can encode it in hardware); WebM where that's all the
// browser records. None at all: the browser can't stream.
const MIME_TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/webm"];
export const pickMime = () => (window.MediaRecorder ? MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null : null);

/**
 * A browser built into another app: Facebook/Instagram/WhatsApp/Snapchat/LINE/WeChat tags, Android WebView ("; wv)"),
 * and iOS views without Safari's "Safari/" token (Safari, Chrome and Firefox on iPhone all have it). The site opened
 * from the Home Screen can lack that token too, but it's Safari underneath, so it can stream.
 */
export const builtIntoApp = (ua, ios, webApp) =>
	/FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|Snapchat|Line\/|MicroMessenger|GSA\/|; wv\)/.test(ua) || (ios && !/Safari\//.test(ua) && !webApp);

const ua = navigator.userAgent;
const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const inApp = builtIntoApp(ua, isIos, inWebApp());
const isAndroidChrome = isAndroid && /Chrome\/\d/.test(ua) && !/EdgA|OPR\/|SamsungBrowser|YaBrowser|Firefox|; wv\)/.test(ua);
/** Which phone's words to use for its settings (Rotation Lock, Auto-Lock): "iphone", "android" or "other". */
export const phoneKind = isIos ? "iphone" : isAndroid ? "android" : "other";

// Opens this page in Chrome on Android, or Google Play if Chrome isn't installed.
const chromeIntent = () =>
	`intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(GET_CHROME)};end`;
// Opens this page in Safari, from the app on the Home Screen (iOS 17 and later).
const safariLink = () => `x-safari-https://${location.host}${location.pathname}${location.search}`;

function link(text, href, cls) {
	const a = document.createElement("a");
	a.className = cls;
	a.href = href;
	a.textContent = text;
	return a;
}

/**
 * Fills `box` (hidden until needed) with what's wrong and what to do. Returns false if streaming can't work here,
 * in which case the page shouldn't offer Start camera.
 */
export function checkBrowser(box, canStream) {
	const say = (text, { block, chromeButtons, safariButton }) => {
		const p = document.createElement("p");
		p.textContent = text;
		box.replaceChildren(p);
		if (chromeButtons || safariButton) {
			const row = document.createElement("div");
			row.className = "row-actions";
			if (safariButton) row.append(link("Open in Safari", safariLink(), "btn livebtn"));
			else row.append(link("Open in Chrome", chromeIntent(), "btn livebtn"), link("Get Chrome (free)", GET_CHROME, "btn storebtn"));
			box.append(row);
		}
		box.hidden = false;
		return !block;
	};
	if (inApp) {
		return say(isIos
			? "This page is open inside another app (like WhatsApp or Facebook), which can't stream. Tap ⋯ or the share button and choose Open in Safari (or Open in Chrome), then tap Go live again."
			: "This page is open inside another app (like WhatsApp or Facebook), which can't stream. Tap Open in Chrome below (or ⋮ → Open in Chrome).", { block: true, chromeButtons: isAndroid });
	}
	// The app on the Home Screen: a phone locked for a moment there loses its sound for the rest of the game (iPhone; in
	// Safari it comes back), so Go live is only from the browser.
	if (inWebApp()) {
		const browser = isAndroid ? "Chrome" : "Safari";
		return say(`Go live from ${browser}, not the Home Screen app: in the app, a phone locked for a moment loses its sound for the rest of the game. Tap Open in ${browser} below (or open ${browser} and go to ${location.host}), sign in, then tap Go live there.`,
			{ block: true, chromeButtons: isAndroid, safariButton: !isAndroid });
	}
	if (!canStream) {
		if (isIos) return say("This iPhone's browser can't stream yet. Update the iPhone (Settings → General → Software Update), then open the site in Safari.", { block: true });
		return say("This browser can't stream. Open the page in Chrome.", { block: true, chromeButtons: isAndroid });
	}
	if (isAndroid && !isAndroidChrome) {
		return say("Streaming works best in Chrome. This browser should work too, but if anything goes wrong, open the page in Chrome.", { block: false, chromeButtons: true });
	}
	return true;
}
