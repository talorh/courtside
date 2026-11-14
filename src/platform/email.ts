// Email: Cloudflare Email Sending's binding, from the site's one sender address only (the binding
// refuses any other sender). Thin, like every platform client. features/admin/admin-mail.ts is the only code allowed to
// use it (scripts/rules.mjs): to the site's admins, and to a team manager about their own team.

/** `html`: the same email formatted (a team's welcome, a sign-in code), beside its plain text. */
export interface OutgoingEmail { to: string[]; subject: string; text: string; html?: string; replyTo?: string }

export interface EmailPort {
	/** One email, plain text and maybe HTML. Throws with the binding's error code (E_SENDER_NOT_VERIFIED, say) if it isn't sent. */
	send(email: OutgoingEmail): Promise<void>;
}

/** An email the binding didn't send, with its error code (E_RECIPIENT_SUPPRESSED: Email Sending won't send to that
 * address, after bounces or a spam report). */
export class EmailFailed extends Error {
	// Written out, not `constructor(readonly …)`, as app/errors.ts does, so Node's type stripping can load it.
	readonly code: string;
	constructor(code: string, detail: string, options?: ErrorOptions) {
		super(`Email failed (${code}): ${detail}`, options);
		this.code = code;
	}
}

// A line break in a header would let text add headers of its own (another Bcc, say).
const LINE_BREAK = /[\r\n]/;

/** `from`: the sender, alerts@ the site's domain with the site's name (club.ts). */
export function createEmail(binding: SendEmail, from: { email: string; name: string }): EmailPort {
	return {
		async send({ to, subject, text, html, replyTo }) {
			if ([subject, ...to, replyTo ?? ""].some((value) => LINE_BREAK.test(value))) throw new Error("An email's subject and addresses can't have a line break");
			try {
				await binding.send({ to, from, subject, text, ...(html ? { html } : {}), ...(replyTo ? { replyTo } : {}) });
			} catch (err) {
				const code = (err as { code?: unknown }).code;
				throw new EmailFailed(typeof code === "string" ? code : "no code", err instanceof Error ? err.message : String(err), { cause: err });
			}
		},
	};
}
