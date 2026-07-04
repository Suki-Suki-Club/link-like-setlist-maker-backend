import app from "./app.js";
import type { RuntimeEnv } from "./runtime.js";

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

export default {
  fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContextLike) {
    return app.fetch(
      request,
      env,
      ctx as Parameters<typeof app.fetch>[2],
    );
  },
};
