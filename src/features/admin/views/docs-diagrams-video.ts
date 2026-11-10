// The Documentation page's video diagrams, drawn as sequences: an upload, a live stream, and a carried-on stream's parts joined.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { draw, figure } from "./docs-draw.ts";

export function uploadDiagram(): SafeHtml {
	const d = draw("upload");
	const [phone, worker, r2, stream] = [90, 260, 440, 610];
	return figure("upload", {
		w: 700, h: 500, min: 600, title: "Uploading a game's video",
		desc: "The phone asks the Worker to start, the Worker opens a multipart upload in R2, the phone sends the parts straight to R2, the Worker completes it and asks Stream to copy it, and Stream pulls the original from R2.",
		caption: "The video never passes through the Worker: the phone sends 16 MB parts straight to R2, and a dropped connection carries on where it stopped.",
	}, html`${d.lane(phone, 140, "Phone", 440, "person")}${d.lane(worker, 140, "Worker", 440, "worker")}${d.lane(r2, 140, "R2", 440, "store")}${d.lane(stream, 140, "Stream", 440)}
${d.message(phone, worker, 100, "start: the game, the file's size")}
${d.message(worker, r2, 146, "open a multipart upload")}
${d.message(worker, phone, 192, "signed links for the parts")}
${d.message(phone, r2, 238, "16 MB parts, six at a time", true)}
${d.message(phone, worker, 284, "every part sent")}
${d.message(worker, r2, 330, "complete the upload")}
${d.message(worker, stream, 376, "copy it, from a signed link")}
${d.message(stream, r2, 422, "pulls the original")}
${d.box({ x: 170, y: 448, w: 510, h: 40, title: "The 5-minute job checks Stream until it's ready to watch", kind: "job" })}`);
}

export function liveDiagram(): SafeHtml {
	const d = draw("live");
	const [phone, worker, stream, r2, families] = [80, 235, 390, 545, 700];
	return figure("live", {
		w: 780, h: 460, min: 680, title: "Live streaming a game",
		desc: "The filming phone asks the Worker to go live, the Worker opens a Stream live input, the phone sends the live picture to Stream, which families watch about a second behind, while the phone also records the game and uploads it to R2. Stopping switches the input off, and the recording becomes the game's video.",
		caption: "Stream can't record a stream sent from a browser, so the phone records the game itself and uploads it as it goes. That recording becomes the game's video, at full quality whatever the signal was like.",
	}, html`${d.lane(phone, 130, "Filming phone", 440, "person")}${d.lane(worker, 130, "Worker", 440, "worker")}${d.lane(stream, 130, "Stream", 440)}
${d.lane(r2, 130, "R2", 440, "store")}${d.lane(families, 130, "Families", 440, "person")}
${d.message(phone, worker, 100, "Go live")}
${d.message(worker, stream, 146, "open a live input")}
${d.message(phone, stream, 192, "the live picture (WHIP)", true)}
${d.message(stream, families, 238, "about a second behind (WHEP)", true)}
${d.message(phone, r2, 284, "its own recording, 8 MB parts", true)}
${d.message(phone, worker, 330, "End game")}
${d.message(worker, stream, 376, "switch the input off")}
${d.message(worker, stream, 422, "copy the recording")}`);
}

export function joinDiagram(): SafeHtml {
	const d = draw("join");
	const [phone, worker, r2, joiner, stream] = [80, 235, 390, 545, 700];
	return figure("join", {
		w: 780, h: 414, min: 680, title: "Joining a carried-on stream's parts",
		desc: "The phone uploads each part of a stopped-and-restarted stream to R2. After End game the Worker completes every part, and the 5-minute job asks the joiner to join them. The joiner reads the parts from R2 and writes one file back. A later run finds that file and asks Stream to copy it.",
		caption: "No run waits for a join. One run asks for it and a later run finds the joined file in R2; the parts are deleted only then.",
	}, html`${d.lane(phone, 130, "Filming phone", 394, "person")}${d.lane(worker, 130, "Worker", 394, "worker")}${d.lane(r2, 130, "R2", 394, "store")}
${d.lane(joiner, 130, "Joiner", 394, "worker")}${d.lane(stream, 130, "Stream", 394)}
${d.message(phone, r2, 100, "part 1, and part 2 after Carry on", true)}
${d.message(phone, worker, 146, "End game")}
${d.message(worker, r2, 192, "complete each part")}
${d.message(worker, joiner, 238, "join these: signed links only")}
${d.message(joiner, r2, 284, "reads the parts, writes one file", true)}
${d.message(worker, r2, 330, "a later run: is it there?")}
${d.message(worker, stream, 376, "copy it, as any upload")}`);
}
