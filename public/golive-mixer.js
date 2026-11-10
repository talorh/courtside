// Go live: what the recording records. Not the camera itself, which the phone can switch off for good mid-game (it
// locks, a call comes, another app takes it), and a recorder whose camera has gone can't take a new one. Instead the
// on-screen preview is drawn onto a canvas, frame by frame, and the microphone goes through a Web Audio mix: the
// recording records those, which never end, so a new camera (Resume camera) carries on in the same video.

/** A Web Audio context for the recording's sound, made and started on a tap (iPhone starts one only from a tap). */
export function soundForTaps() {
	const sound = new AudioContext();
	const wake = () => { if (sound.state !== "running" && sound.state !== "closed") sound.resume().catch((err) => console.warn(`sound: ${err}`)); };
	wake();
	// A call, a lock or the camera's own prompt can stop it, and a recording with no sound records nothing: it's started
	// again as soon as the phone says it has stopped, and at any tap on the page.
	sound.addEventListener("statechange", wake);
	addEventListener("pointerdown", wake, true);
	return { sound, wake };
}

/**
 * Starts mixing `video` (the preview, showing `media`) and `media`'s microphone. Returns { stream, useMedia(media),
 * stop() }: `stream` is what to record; useMedia() swaps in a new camera and microphone (the preview's srcObject is
 * already the new camera). The picture is always sideways (landscape), at the camera's size, so a game's video is one
 * shape from start to end, a later segment too; an upright camera is fitted in the middle, black either side.
 */
export function mixer(video, media, { sound, wake }) {
	const canvas = document.createElement("canvas");
	const w = video.videoWidth || 1280, h = video.videoHeight || 720;
	canvas.width = Math.max(w, h);
	canvas.height = Math.min(w, h);
	const draw2d = canvas.getContext("2d", { alpha: false });
	let stopped = false, frame = null;

	const paint = () => {
		const w = video.videoWidth, h = video.videoHeight;
		if (!w || !h) return;
		if (w === canvas.width && h === canvas.height) return draw2d.drawImage(video, 0, 0);
		const scale = Math.min(canvas.width / w, canvas.height / h);
		draw2d.fillStyle = "#000";
		draw2d.fillRect(0, 0, canvas.width, canvas.height);
		draw2d.drawImage(video, (canvas.width - w * scale) / 2, (canvas.height - h * scale) / 2, w * scale, h * scale);
	};
	// One drawing for each camera frame shown (where the browser says when one is); otherwise each screen refresh.
	const perFrame = typeof video.requestVideoFrameCallback === "function";
	const loop = () => {
		if (stopped) return;
		paint();
		frame = perFrame ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
	};
	const cancel = () => { if (frame !== null) (perFrame ? video.cancelVideoFrameCallback(frame) : cancelAnimationFrame(frame)); frame = null; };
	paint();
	loop();

	const out = sound.createMediaStreamDestination();
	let mic = sound.createMediaStreamSource(media);
	mic.connect(out);
	const stream = new MediaStream([...canvas.captureStream().getVideoTracks(), ...out.stream.getAudioTracks()]);

	return {
		stream,
		useMedia(fresh) {
			mic.disconnect();
			mic = sound.createMediaStreamSource(fresh);
			mic.connect(out);
			wake();
			cancel();
			loop();
		},
		stop() {
			stopped = true;
			cancel();
			mic.disconnect();
			stream.getTracks().forEach((t) => t.stop());
			sound.close().catch((err) => console.warn(`sound: ${err}`));
		},
	};
}
