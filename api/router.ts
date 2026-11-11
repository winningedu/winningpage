import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dispatch } from "./_routes/dispatch.js";
import { routes } from "./_routes/manifest.js";

export const config = { runtime: "nodejs" };

export default (req: VercelRequest, res: VercelResponse) =>
  dispatch(routes, req, res);
