// The admin area's Admins page: the list, adding one and removing one.
import { z } from "zod";
import type { AdminRouter } from "../../app/admin-router.ts";
import { HttpError } from "../../app/errors.ts";
import { htmlResponse, redirect } from "../../app/respond.ts";
import { listAdmins } from "../../auth/admins-repository.ts";
import { doneMessage, parseForm } from "../../shared/validation.ts";
import { addAdmin, removeAdmin } from "./admins-service.ts";
import { ADMINS_MESSAGES, adminsPage } from "./views/admins-page.ts";

const AddForm = z.object({ email: z.string().max(254), again: z.string().max(254) });
const RemoveForm = z.object({ email: z.string().max(254) });

export function adminsRoutes(router: AdminRouter): void {
	router.get("/admin/admins", async ({ deps, frame, viewer, url }) => htmlResponse(adminsPage({
		frame, admins: await listAdmins(deps.db), you: viewer.email, message: doneMessage(ADMINS_MESSAGES, url),
	})));

	// Refused (the emails don't match, say): the form again, as typed, with why.
	router.post("/admin/admins", async ({ req, deps, frame, viewer }) => {
		const values = await parseForm(req, AddForm);
		try {
			await addAdmin(deps, viewer.email, values);
			return redirect("/admin/admins?done=added");
		} catch (err) {
			if (!(err instanceof HttpError) || err.status >= 500) throw err;
			return htmlResponse(adminsPage({ frame, admins: await listAdmins(deps.db), you: viewer.email, values, error: err.message }), err.status);
		}
	});

	router.post("/admin/admins/remove", async ({ req, deps, viewer }) => {
		await removeAdmin(deps, viewer.email, (await parseForm(req, RemoveForm)).email);
		return redirect("/admin/admins?done=removed");
	}, { confirm: true });
}
