import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dispatch } from "./_routes/dispatch.js";
import { routes } from "./_routes/manifest-30.js";

export const config = { runtime: "nodejs", maxDuration: 30 };

export default (req: VercelRequest, res: VercelResponse) =>
  dispatch(routes, req, res);
