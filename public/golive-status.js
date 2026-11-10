// Go live: the words on the camera screen's status line, from where the stream is at. golive.js redraws it.

const mb = (bytes) => Math.round((bytes ?? 0) / 1e6);

// A minute of recording (golive-rec.js: 2.5 Mbps picture, 128 kbps sound).
const BYTES_A_MINUTE = (2_500_000 + 128_000) / 8 * 60;
/** Whole minutes of the game recorded but not yet sent: on a weak signal they wait on the phone, lost if its page goes. */
export const onPhoneMinutes = (p) => Math.floor(Math.max((p?.recordedBytes ?? 0) - (p?.sentBytes ?? 0), p?.waitingBytes ?? 0) / BYTES_A_MINUTE);
// Below this the sending is keeping up, near enough.
export const BEHIND_MINUTES = 2;

/** Why the camera didn't start (only ever in the browser: the Home Screen app is sent there, golive-check.js). */
export const cameraProblem = (err) => err.name !== "NotAllowedError" ? `The camera wouldn't start: ${err.message}`
	: "The camera or microphone is blocked. Tap the icon next to the web address, allow Camera and Microphone, then reload the page.";

export const CAMERA_STOPPED = "The camera stopped (the phone locked, or another app took it). Tap Start camera again.";
// The moment Go live or Yes, end game is tapped, while the site answers (seconds on a weak signal).
export const STARTING = "Starting the live stream…";
export const STOPPING = "Ending the game…";

// An upright picture: the phone is held upright, or its screen won't turn (iPhone: Portrait Orientation Lock; Android:
// Auto-rotate off), which keeps the camera upright even with the phone sideways.
const TURN = {
	iphone: "Already sideways? Turn off Portrait Orientation Lock: swipe down from the top-right corner and tap the padlock.",
	android: "Already sideways? Turn on Auto-rotate: swipe down from the top of the screen and tap Auto-rotate.",
};
/** What to do about an upright picture, in this phone's words (golive-check.js `phoneKind`). */
export const uprightAdvice = (phone) => ["Turn the phone sideways to go live.", TURN[phone]].filter(Boolean).join(" ");
/** Go live was tapped with the picture upright: it goes live by itself once the picture turns, or on a second tap. */
const waitingAdvice = (phone) => ["Turn the phone sideways: it goes live as soon as you do.", TURN[phone], "Or tap Go live again to go live as it is."].filter(Boolean).join(" ");

/** A phone that won't keep its screen on is told how (golive-check.js `phoneKind`): a screen that goes off stops the camera. */
export const screenTip = (phone) => ({
	iphone: "This iPhone may lock its screen during the game, and that stops the camera. Set Auto-Lock to Never for the game: Settings, Display & Brightness, Auto-Lock.",
	android: "This phone may turn its screen off during the game, and that stops the camera. Set Screen timeout to 10 minutes or more for the game: Settings, Display.",
}[phone] ?? "The screen may turn off during the game, and that stops the camera. Keep it on until the game's over.");

/**
 * `live`: streaming (or paused); `tall`: the picture is upright; `phone`: whose words to use for its settings; `waiting`:
 * Go live was tapped while upright; `paused`: how long ("2:13") or null; `minutes` since Go live; `connected`: families
 * are getting the live picture; `cameraGone`: the phone switched the camera off mid-game (Resume camera brings it back),
 * or why Resume camera didn't work; `trouble`: what's wrong (" · …"), shown instead of the MB line; `progress`: the
 * recording's bytes so far (golive-rec.js).
 */
export function statusText({ live, tall, phone, waiting, paused, minutes, connected, trouble, progress, cameraGone }) {
	if (!live) return !tall ? "Camera ready. Tap Go live during the warm-up." : waiting ? waitingAdvice(phone) : uprightAdvice(phone);
	if (typeof cameraGone === "string") return `⏸ CAMERA STOPPED · ${cameraGone} Families see "Game break" meanwhile.`;
	if (cameraGone) return '⏸ CAMERA STOPPED · Families see "Game break". Tap Resume camera to carry on.';
	if (paused) return `⏸ PAUSED ${paused} · Families see "Game break". Tap Resume before play starts.`;
	const watching = connected ? "Families can watch" : "Reconnecting the live picture (the recording carries on)";
	const behind = onPhoneMinutes(progress);
	const sent = progress ? ` · ${mb(progress.recordedBytes)} MB recorded, ${mb(progress.sentBytes)} MB sent` : "";
	const left = behind >= BEHIND_MINUTES ? ` · About ${behind} min of the game only on this phone so far: keep this page open after the game until Saved` : "";
	return `● LIVE ${minutes} min · ${tall ? "Turn the phone back sideways · " : ""}${watching}${trouble || sent + left}`;
}
