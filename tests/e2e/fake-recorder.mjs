// A stand-in MediaRecorder for the iPhone runs: WebKit on Linux (the Playwright build) has none, a real iPhone has had
// one since iOS 14.3. It hands over pretend recording (MP4-labelled bytes) every timeslice, like Safari, and stops when
// the camera does. Everything else on the page runs on the real WebKit. Passed to addInitScript, so it's self-contained.
export function fakeRecorder() {
	if (window.MediaRecorder) return;
	const BYTES_PER_SECOND = 300_000; // about 2.4 Mbps, the bitrate golive-rec.js asks for
	class FakeRecorder extends EventTarget {
		static isTypeSupported(type) {
			return /^video\/mp4/.test(type);
		}
		constructor(stream, options = {}) {
			super();
			this.stream = stream;
			this.mimeType = options.mimeType ?? "video/mp4";
			this.state = "inactive";
			this.ondataavailable = null;
			this.onstop = null;
			this.pending = 0;
			for (const track of stream.getTracks()) track.addEventListener("ended", () => { if (stream.getTracks().every((t) => t.readyState === "ended")) this.stop(); });
		}
		emit(type, init = {}) {
			const event = Object.assign(new Event(type), init);
			this[`on${type}`]?.(event);
			this.dispatchEvent(event);
		}
		hand() {
			const size = Math.round(this.pending);
			this.pending = 0;
			this.emit("dataavailable", { data: new Blob([new Uint8Array(size)], { type: this.mimeType }) });
		}
		start(timeslice = 1000) {
			this.state = "recording";
			this.timer = setInterval(() => {
				if (this.state !== "recording") return;
				this.pending += (BYTES_PER_SECOND * timeslice) / 1000;
				this.hand();
			}, timeslice);
		}
		requestData() {
			if (this.state !== "inactive") this.hand();
		}
		pause() {
			if (this.state === "recording") this.state = "paused";
		}
		resume() {
			if (this.state === "paused") this.state = "recording";
		}
		stop() {
			if (this.state === "inactive") return;
			clearInterval(this.timer);
			this.state = "inactive";
			this.pending += BYTES_PER_SECOND / 4;
			setTimeout(() => {
				this.hand();
				this.emit("stop");
			}, 50);
		}
	}
	window.MediaRecorder = FakeRecorder;
}
