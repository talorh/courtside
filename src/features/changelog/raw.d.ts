// Vite's ?raw import: a file's text, bundled at build time (CHANGELOG.md, for the changelog page).
declare module "*.md?raw" {
	const text: string;
	export default text;
}
