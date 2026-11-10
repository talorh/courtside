// Costs' "Cloudflare's bill" widget: the billing period's bill as Cloudflare has it (actual): the usage it charged so far,
// the plan's fees each period (Workers Paid, the Images and Stream bundle, Stream storage bought past it), and each
// product's use against its free allowance, nearest the allowance first, as a meter (amber from 80%, red past it), with
// what it cost. Cloudflare's US dollars, shown in the page's currency.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime, MONTHS } from "../../../shared/time.ts";
import type { Bill } from "../costs-bill.ts";
import { periodProducts, type Product } from "../costs-bill-summary.ts";
import { type Currency, money } from "../costs-currency.ts";
import { PRICES } from "../costs-prices.ts";
import { thousands } from "./costs-words.ts";
import { ACTUAL, type Level, meter, pill } from "./costs-widgets.ts";

/** "1,150", or "0.4" for a part of a GB-month. */
const amount = (n: number) => (n < 100 && !Number.isInteger(n) ? n.toFixed(1) : thousands(n));
const share = (p: Product) => (p.allowance ? p.used / p.allowance : 0);
const level = (s: number): Level => (s > 1 ? "over" : s >= 0.8 ? "warn" : "ok");
/** "16 Oct", from 'YYYY-MM-DD'. */
const dayMonth = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

function product(p: Product, m: (n: number) => string): SafeHtml {
	const use = p.allowance === null ? `${amount(p.used)}, ${p.billed ? `${m(p.billed)} charged` : "charged nothing so far"}` : `${amount(p.used)} of ${amount(p.allowance)} free`;
	// Its family where Cloudflare's name doesn't say it ("Workers AI: Regular Twitch Neurons").
	const name = !p.family || p.name.toLowerCase().includes(p.family.toLowerCase().replace(/s$/, "")) ? p.name : `${p.family}: ${p.name}`;
	const charged = p.billed > 0 && p.allowance !== null ? html`<span class="kval billed">${m(p.billed)}</span>` : "";
	return html`<li><span class="kname"><b>${name}</b></span><span class="kval">${use}</span>${charged}${p.allowance === null ? "" : meter(share(p), level(share(p)), "fmeter")}</li>`;
}

/** `bought`: Stream's storage bought now (null when it didn't say); `localPerUsd`: the day's rate, for the club's currency. */
export function billWidget(bill: Bill, o: { cur: Currency; localPerUsd: number; bought: number | null }): SafeHtml {
	const k = o.cur === "local" ? o.localPerUsd : 1, m = (n: number) => money(o.cur)(n * k);
	const head = (sub: string) => html`<figcaption><b>Cloudflare's bill</b> <span class="small">${sub}</span></figcaption>`;
	if (!bill.rows.length) {
		const why = bill.read === "off" ? "it needs the read-only token (CF_INSIGHTS_TOKEN), with Billing Read" : bill.read === "failed" ? "Cloudflare didn't answer: reload to try again" : "Cloudflare has nothing for this billing period yet";
		return html`<figure class="chart billw">${head("Not read yet")}<p class="small">Cloudflare's bill hasn't been read: ${why}. Until it is, every figure here is worked out from what the site measures, at Cloudflare's list prices.</p></figure>`;
	}
	const p = periodProducts(bill.rows);
	const usage = p.products.reduce((s, x) => s + x.billed, 0);
	const blocks = Math.max(1, Math.ceil((o.bought ?? 0) / PRICES.bundleMinutes));
	const fees = PRICES.workersPaid + PRICES.bundle + (blocks - 1) * PRICES.streamStoredPer1000;
	const order = [...p.products].sort((a, b) => b.billed - a.billed || share(b) - share(a) || (a.allowance === null ? 1 : 0) - (b.allowance === null ? 1 : 0));
	const unit = (value: string, label: string, sub: string) => html`<div class="unit"><b>${value}</b><span>${label}</span><span class="sub">${sub}</span></div>`;
	const read = bill.savedAt ? formatGameDate(localTime(new Date(bill.savedAt))) : "";
	return html`<figure class="chart billw">${head(`Billing period from ${dayMonth(p.periodStart!)}, billed to ${dayMonth(p.lastDay!)}`)}
<div class="billhead">${pill(ACTUAL)}<p class="small">Cloudflare's own figures, from the records its invoices are made from. Everything after the last day billed is estimated.</p></div>
<div class="units">${unit(m(usage), "Usage charged", "Past the free allowances, this period so far")}${unit(m(fees), "Plan fees, each period", `Workers Paid, the Images and Stream bundle${blocks > 1 ? ", Stream storage bought" : ""}`)}${unit(m(usage + fees), "This period so far", "Fees and usage, before tax")}</div>
<h3 class="billsub">Free allowances, this period</h3><ul class="kindlist freelist">${order.map((x) => product(x, m))}</ul>
<p class="small">Each product against what the plan includes a period, as Cloudflare names it; past that, Cloudflare charges, and what it charged shows beside it. ${bill.read === "failed" ? `Cloudflare didn't answer just now: this is its bill as read ${read}.` : `Read ${read}.`}</p></figure>`;
}
