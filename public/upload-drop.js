// Drag and drop for computers: dropping files on a box (the video upload, Add photos) does what choosing them does.
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");

export function enableDrop(zone, onFiles) {
	let depth = 0;
	// A file dropped anywhere else would make the browser open it and leave the page mid-upload; stop that.
	window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
	window.addEventListener("drop", (e) => { if (hasFiles(e)) e.preventDefault(); });

	zone.addEventListener("dragenter", (e) => {
		if (!hasFiles(e)) return;
		e.preventDefault();
		depth++;
		zone.classList.add("dragover");
	});
	zone.addEventListener("dragover", (e) => {
		if (!hasFiles(e)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "copy";
	});
	zone.addEventListener("dragleave", () => {
		depth = Math.max(0, depth - 1);
		if (depth === 0) zone.classList.remove("dragover");
	});
	zone.addEventListener("drop", (e) => {
		if (!hasFiles(e)) return;
		e.preventDefault();
		depth = 0;
		zone.classList.remove("dragover");
		onFiles(e.dataTransfer.files);
	});
}
