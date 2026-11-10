// A pretend camera for the iPhone runs: Playwright's WebKit can't be given the camera ("Unknown permission: camera"),
// so getUserMedia hands back a moving picture drawn on a canvas and a tone. They're real media tracks, so WebKit's own
// WebRTC sends them to the far end as it would a camera. `window.cameraRefused = true` (an init script) makes it say no,
// as a phone does when Camera or Microphone isn't allowed. Passed to addInitScript, so it's self-contained. It goes on
// MediaDevices' prototype, as WebKit can drop one set on navigator.mediaDevices while streaming, and Resume camera asks again.
export function fakeCamera() {
	if (!window.MediaDevices) return;
	MediaDevices.prototype.getUserMedia = async (constraints) => {
		if (window.cameraRefused) throw new DOMException("Permission denied", "NotAllowedError");
		const tracks = [];
		if (constraints.video) {
			const canvas = Object.assign(document.createElement("canvas"), { width: 1280, height: 720 });
			const ctx = canvas.getContext("2d");
			let frame = 0;
			const draw = () => {
				ctx.fillStyle = `hsl(${(frame * 3) % 360} 60% 35%)`;
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.fillStyle = "#fff";
				ctx.font = "96px sans-serif";
				ctx.fillText(`pretend camera ${frame++}`, 80, 380);
			};
			draw();
			const timer = setInterval(draw, 33);
			const track = canvas.captureStream(30).getVideoTracks()[0];
			track.addEventListener("ended", () => clearInterval(timer));
			tracks.push(track);
		}
		if (constraints.audio) {
			const audio = new AudioContext();
			const tone = audio.createOscillator();
			const out = audio.createMediaStreamDestination();
			tone.connect(out);
			tone.start();
			tracks.push(out.stream.getAudioTracks()[0]);
		}
		return new MediaStream(tracks);
	};
}
