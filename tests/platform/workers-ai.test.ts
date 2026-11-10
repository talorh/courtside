import { describe, expect, it } from "vitest";
import { createAi } from "../../src/platform/workers-ai.ts";

const USE = "Ask Virtual Team Manager, the Documentation assistant and reading fixture pages";

/** A stand-in for the AI binding: records each call and answers with the next reply. */
function fakeAi(replies: unknown[]) {
	const calls: Array<{ model: string; input: Record<string, unknown> }> = [];
	const ai = { run: async (model: string, input: Record<string, unknown>) => { calls.push({ model, input }); return replies.shift(); } };
	return { calls, port: createAi(ai as unknown as Ai) };
}

/** A catalog of text models, as the binding's models() gives it: the name and its properties. */
const listed = (name: string, retires?: string) => ({ name, properties: retires ? [{ property_id: "planned_deprecation_date", value: retires }] : [{ property_id: "price", value: "0" }] });

describe("Workers AI models' retirement", () => {
	it("looks the site's one model up in Cloudflare's text models: its planned retirement date, or none", async () => {
		const asked: unknown[] = [];
		const ai = { models: async (p: unknown) => { asked.push(p); return [listed("@cf/google/gemma-4-26b-a4b-it", "2027-03-01T00:00:00Z"), listed("@cf/other/model")]; } };
		expect(await createAi(ai as unknown as Ai).retirements()).toEqual([
			{ model: "@cf/google/gemma-4-26b-a4b-it", use: USE, listed: true, retiresOn: "2027-03-01" },
		]);
		expect(asked).toEqual([{ task: "Text Generation", per_page: 1000 }]);
	});
	it("says a model has gone from the catalog, and fails rather than calling every model gone when the catalog comes back empty", async () => {
		const once = (models: unknown[]) => createAi({ models: async () => models } as unknown as Ai);
		expect((await once([listed("@cf/other/model")]).retirements())[0]).toMatchObject({ listed: false, retiresOn: null });
		await expect(once([]).retirements()).rejects.toThrow("Workers AI's catalog came back empty");
	});
});

describe("Workers AI client", () => {
	it("answers with Gemma 4, thinking off (its answer then fits), the system text first, read from its chat reply, trimmed", async () => {
		const { calls, port } = fakeAi([{ choices: [{ message: { role: "assistant", content: "  Tap Watch games.  ", reasoning: null } }] }]);
		expect(await port.answer("You are Virtual Sam", "How do I watch?")).toBe("Tap Watch games.");
		expect(calls[0]!.model).toBe("@cf/google/gemma-4-26b-a4b-it");
		expect(calls[0]!.input.chat_template_kwargs).toEqual({ enable_thinking: false });
		expect(calls[0]!.input.messages).toEqual([{ role: "system", content: "You are Virtual Sam" }, { role: "user", content: "How do I watch?" }]);
	});
	it("explains with the same model, thinking off, with room for a longer answer (the Documentation assistant's)", async () => {
		const { calls, port } = fakeAi([{ choices: [{ message: { content: " An answer. " } }] }]);
		expect(await port.explain("s", "q")).toBe("An answer.");
		expect(calls[0]).toMatchObject({ model: "@cf/google/gemma-4-26b-a4b-it", input: { max_tokens: 700, chat_template_kwargs: { enable_thinking: false } } });
	});
	it("reads a model that answers in `response` too", async () => {
		const { port } = fakeAi([{ response: " An answer. " }]);
		expect(await port.explain("s", "q")).toBe("An answer.");
	});
	it("fails rather than answering with nothing", async () => {
		const { port } = fakeAi([{ response: " " }, null]);
		await expect(port.answer("s", "q")).rejects.toThrow("gave no answer");
		await expect(port.answer("s", "q")).rejects.toThrow("gave no answer");
	});
	it("reads JSON with the same model in JSON mode, thinking off, whether it comes back as text or already parsed", async () => {
		const schema = { type: "object" };
		const { calls, port } = fakeAi([{ choices: [{ message: { content: '{"games":[]}' } }] }, { response: { games: [1] } }, { response: "not json" }]);
		expect(await port.readJson("s", "page", schema)).toEqual({ games: [] });
		expect(calls[0]!.model).toBe("@cf/google/gemma-4-26b-a4b-it");
		expect(calls[0]!.input.response_format).toEqual({ type: "json_schema", json_schema: schema });
		expect(calls[0]!.input.chat_template_kwargs).toEqual({ enable_thinking: false });
		expect(await port.readJson("s", "page", schema)).toEqual({ games: [1] });
		await expect(port.readJson("s", "page", schema)).rejects.toThrow("isn't JSON: not json");
	});
});
