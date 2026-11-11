import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dispatch } from "./_routes/dispatch.js";
import { routes } from "./_routes/manifest-60.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default (req: VercelRequest, res: VercelResponse) =>
  dispatch(routes, req, res);
