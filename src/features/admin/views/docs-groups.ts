// The Documentation's sections, in their groups and order: the page draws them (docs-page.ts), and the Documentation AI
// assistant reads them (docs-knowledge.ts).
import type { DocSection } from "./docs-blocks.ts";
import { photos, requests, signIn, teams } from "./docs-text-app.ts";
import { admin } from "./docs-text-admin.ts";
import { agent } from "./docs-text-agent.ts";
import { artifacts } from "./docs-text-artifacts.ts";
import { costs } from "./docs-text-costs.ts";
import { fairUse } from "./docs-text-fair-use.ts";
import { fixture } from "./docs-text-fixture.ts";
import { glossary } from "./docs-text-glossary.ts";
import { help } from "./docs-text-help.ts";
import { jobs } from "./docs-text-jobs.ts";
import { codeLayout, data, monitoring, recovery } from "./docs-text-ops.ts";
import { releases } from "./docs-text-releases.ts";
import { people } from "./docs-text-people.ts";
import { overview, platform } from "./docs-text-platform.ts";
import { privacy } from "./docs-text-privacy.ts";
import { roster } from "./docs-text-roster.ts";
import { setup } from "./docs-text-setup.ts";
import { start } from "./docs-text-start.ts";
import { tasks } from "./docs-text-tasks.ts";
import { video } from "./docs-text-video.ts";
import { home, watching } from "./docs-text-watching.ts";

export const GROUPS: Array<{ label: string; sections: Array<() => DocSection> }> = [
	{ label: "Getting started", sections: [start, overview] },
	{ label: "The platform", sections: [platform, artifacts] },
	{ label: "How it works", sections: [requests, signIn, teams, people, fixture, roster, video, watching, photos, home, help, privacy, fairUse] },
	{ label: "Running it", sections: [admin, tasks, jobs, data, monitoring, costs] },
	{ label: "Changing it", sections: [setup, agent, releases, recovery, codeLayout] },
	{ label: "Reference", sections: [glossary] },
];
