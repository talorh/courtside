// The Documentation page's diagram of the code on a computer: one git repository, two working folders (a worktree), and
// where each one's work goes.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { draw, figure } from "./docs-draw.ts";

export function worktreesDiagram(): SafeHtml {
	const d = draw("worktrees");
	return figure("worktrees", {
		w: 760, h: 260, min: 640, title: "One repository, two folders",
		desc: "The repository's git folder lives in courtside-prod, which stays on main, what's live; courtside-staging is a worktree of the same repository, where the staging branch and every feature and fix branch are worked on. npm run staging deploys staging's commit to the staging preview; npm run release pushes main from courtside-prod to Cloudflare Artifacts, which Workers Builds deploys; a new computer clones from Artifacts with a read token.",
		caption: "Both folders share one set of commits, branches and the staging record, so a branch made in one is there in the other. Only main ever leaves the computer.",
	}, html`${d.box({ x: 20, y: 30, w: 220, title: "courtside-staging", sub: "a worktree: staging, feature/, fix/", kind: "step" })}
${d.box({ x: 270, y: 30, w: 220, title: "The one .git", sub: "commits, branches, the staging record", kind: "store" })}
${d.box({ x: 520, y: 30, w: 220, title: "courtside-prod", sub: "main only: what's live", kind: "done" })}
${d.box({ x: 20, y: 170, w: 220, title: "The staging preview", sub: "staging's commit, test data", kind: "service" })}
${d.box({ x: 520, y: 170, w: 220, title: "Artifacts: courtside/courtside", sub: "main, pushed by the release", kind: "store" })}
${d.arrow([[240, 58], [268, 58]], { both: true })}${d.arrow([[520, 58], [492, 58]], { both: true })}
${d.arrow([[130, 86], [130, 168]], { label: "npm run staging", at: [140, 132] })}
${d.arrow([[630, 86], [630, 168]], { label: "npm run release", at: [640, 132] })}
${d.arrow([[520, 212], [380, 212], [380, 88]], { dashed: true, label: "clone and fetch, a read token", at: [390, 236] })}`);
}
