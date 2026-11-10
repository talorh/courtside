// Workers AI, through the Worker's AI binding (no keys, no other service), on the account's free 10,000 "neurons" a
// day; on Workers Paid anything over that is billed, at cents a day (todo.md checks the bill).
// One model for everything, named only here, so staging and the live site always run the same one and a new model is
// tried on staging like any change: Gemma 4, quick and cheap (4 billion of its 26 billion parameters an answer), with
// its thinking off so the answer starts straight away. It answers Ask Virtual Team Manager, the Documentation AI
// assistant (a longer answer) and reads fixture pages (JSON mode, temperature 0, as the dates have to be right).

export const MODEL = "@cf/google/gemma-4-26b-a4b-it";
/** The models the site uses, and what for: the 3am job checks each against Cloudflare's catalog (ai-model-checks.ts). */
const MODELS = [{ model: MODEL, use: "Ask Virtual Team Manager, the Documentation assistant and reading fixture pages" }];

/** A model as Cloudflare's catalog has it: still listed, and the day it's to be retired, if one's planned. */
export interface ModelStanding { model: string; use: string; listed: boolean; retiresOn: string | null }

export interface AiPort {
	answer(system: string, question: string): Promise<string>;
	/** A longer answer, for the admins' Documentation AI assistant. */
	explain(system: string, question: string): Promise<string>;
	/** Reads `text` into JSON matching `schema` (JSON mode). The result still needs checking. */
	readJson(system: string, text: string, schema: object): Promise<unknown>;
	/** Each model the site uses, as the catalog has it. */
	retirements(): Promise<ModelStanding[]>;
}

export function createAi(ai: Ai): AiPort {
	// Gemma 4 answers in a chat reply's first choice; some models answer in `response`. Gemma thinks first by default,
	// which would spend the answer's tokens: it answers straight away.
	const run = async (input: Record<string, unknown>): Promise<unknown> => {
		const out = (await ai.run(MODEL as Parameters<Ai["run"]>[0], { ...input, chat_template_kwargs: { enable_thinking: false } } as never)) as
			{ response?: unknown; choices?: Array<{ message?: { content?: unknown } }> } | null;
		return out?.response ?? out?.choices?.[0]?.message?.content;
	};
	return {
		async answer(system, question) {
			const text = await run({ messages: [{ role: "system", content: system }, { role: "user", content: question }], max_tokens: 350, temperature: 0.2 });
			if (typeof text !== "string" || text.trim() === "") throw new Error("Workers AI gave no answer");
			return text.trim();
		},
		async explain(system, question) {
			const text = await run({ messages: [{ role: "system", content: system }, { role: "user", content: question }], max_tokens: 700, temperature: 0.2 });
			if (typeof text !== "string" || text.trim() === "") throw new Error("Workers AI gave no answer");
			return text.trim();
		},
		async readJson(system, text, schema) {
			const out = await run({
				messages: [{ role: "system", content: system }, { role: "user", content: text }], max_tokens: 4000, temperature: 0,
				response_format: { type: "json_schema", json_schema: schema },
			});
			if (typeof out !== "string") return out;
			try {
				return JSON.parse(out);
			} catch (err) {
				throw new Error(`Workers AI gave something that isn't JSON: ${out.slice(0, 120)}`, { cause: err });
			}
		},
		async retirements() {
			const catalog = await ai.models({ task: "Text Generation", per_page: 1000 });
			if (catalog.length === 0) throw new Error("Workers AI's catalog came back empty");
			return MODELS.map(({ model, use }) => {
				const found = catalog.find((m) => m.name === model);
				const date = found?.properties.find((p) => p.property_id === "planned_deprecation_date")?.value;
				return { model, use, listed: found !== undefined, retiresOn: typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null };
			});
		},
	};
}
