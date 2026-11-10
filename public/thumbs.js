// If a Stream frame can't load (expired link, Stream hiccup), show the club's logo instead of a broken image.
const useBadge = (img) => {
	img.src = "/logo.png";
	img.closest(".thumb")?.classList.replace("has-img", "fallback");
};
for (const img of document.querySelectorAll(".thumb.has-img img")) {
	if (img.complete && img.naturalWidth === 0) useBadge(img);
	else img.addEventListener("error", () => useBadge(img), { once: true });
}
