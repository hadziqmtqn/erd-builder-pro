import app from "./index";
import { createServerAdapter } from "@whatwg-node/server";

export default {
  async fetch(request: Request, env: any, ctx: any) {
    // Enable Node.js compatibility mode for Express
    const adapter = createServerAdapter(app as any);
    return adapter.handle(request, env, ctx);
  }
};
