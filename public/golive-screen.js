// Go live: the camera (and noticing when the phone switches it off), and the phone's screen while streaming (the camera
// fills it; awake.js keeps it on).

/**
 * The camera fills the screen on every phone (iPhone can't do real full screen for a page, so it's done with CSS);
 * where the browser allows, real full screen in landscape too.
 */
export async function fillScreen(cam, on) {
	cam.classList.toggle("full", on);
	document.documentElement.classList.toggle("camfull", on);
	if (on && cam.requestFullscreen) await bonus(() => cam.requestFullscreen().then(() => screen.orientation?.lock?.("landscape")));
	if (!on && document.fullscreenElement) await bonus(() => document.exitFullscreen());
}

// Real full screen is a bonus on top of the CSS one: a phone that refuses, or never answers, mustn't hold up the stream.
function bonus(job) {
	const tried = new Promise((done) => done(job())).catch((err) => console.warn(`full screen: ${err}`));
	return Promise.race([tried, new Promise((done) => setTimeout(done, 1500))]);
}

/**
 * onLost() once if the camera stops: its track ends (an iPhone switches it off for good when it locks or another app
 * takes it), or it's still off (muted: Android's way) 3 seconds after the page comes back, or after it went off with the
 * page showing. A camera already stopped is reported straight away.
 * Returns a function that stops watching.
 */
export function whenCameraLost(media, onLost) {
	const [video] = media.getVideoTracks();
	let watching = true;
	const lost = () => {
		if (!watching) return;
		stop();
		onLost();
	};
	const back = () => {
		if (document.visibilityState === "visible") setTimeout(() => { if (video.readyState === "ended" || video.muted) lost(); }, 3000);
	};
	function stop() {
		watching = false;
		video.removeEventListener("ended", lost);
		video.removeEventListener("mute", back);
		document.removeEventListener("visibilitychange", back);
	}
	video.addEventListener("ended", lost);
	video.addEventListener("mute", back);
	document.addEventListener("visibilitychange", back);
	if (video.readyState === "ended") setTimeout(lost);
	return stop;
}

/** The back camera (720p30) and the microphone. Both are needed: no stream without picture and sound. */
export async function startCamera() {
	const media = await navigator.mediaDevices.getUserMedia({
		video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
		audio: { echoCancellation: false, noiseSuppression: false },
	});
	if (!media.getVideoTracks().length || !media.getAudioTracks().length) {
		media.getTracks().forEach((t) => t.stop());
		throw new Error("It needs both the camera and the microphone. Allow both, then reload the page.");
	}
	return media;
}
