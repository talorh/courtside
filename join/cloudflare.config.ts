import { readFileSync } from "node:fs";
import { defineConfig, defineContainer, exports } from "cf/config";
// Namespace import is required by the cf config API (cf-worker import attribute).
import * as entrypoint from "./index.ts" with { type: "cf-worker" };
import { DEPLOY } from "../deploy.config.ts";

// The joiner (docs/architecture.md, Live streaming): one small container with ffmpeg, one at a time,
// wherever Cloudflare has room (Oceania alone is refused as limited capacity; it only moves R2 links). standard-1 for
// its 8 GB of disk: a join holds the segments' transport stream and the joined file at once (join/pipeline.mjs). The image is
// built and pushed to Cloudflare's registry by `npm run join -- image` (its tag in image-tag.txt), so a deploy needs no
// Docker anywhere; `npm run join -- deploy` deploys it, and the site's cloudflare.config.ts binds to the Joiner Durable
// Object by this Worker's name.
const ACCOUNT_ID = DEPLOY.accountId;
const NAME = `${DEPLOY.worker}-join`;
const IMAGE_TAG = readFileSync(new URL("./image-tag.txt", import.meta.url), "utf8").trim();
const container = defineContainer({
	name: NAME,
	image: { reference: `registry.cloudflare.com/${ACCOUNT_ID}/${NAME}:${IMAGE_TAG}` },
	instanceType: "standard-1",
	maxInstances: 1,
});

export default defineConfig(() => ({
	accountId: ACCOUNT_ID,
	worker: {
		name: NAME,
		compatibilityDate: "2026-09-25",
		entrypoint,
		workersDev: false,
		previewUrls: false,
		observability: { enabled: true, redactQueryString: true },
		exports: { Joiner: exports.durableObject({ storage: "sqlite", container }) },
	},
	containers: [container],
}));
