import { z } from "zod";

// Where a switch on a page (Hide scores, a favourite star) goes back to once it's saved: Watch games (its filter kept)
// or a game (or one of its clips). Nothing else, so a form can't send anyone off the site.
export const backPath = z.string().regex(/^\/games(\?c=[A-Za-z0-9%]+|\/\d+(\?clip=\d+)?)?$/);
