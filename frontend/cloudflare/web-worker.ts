// OpenNext generates this module during cf:build.
// @ts-ignore -- the generated file is absent on a fresh source checkout.
import nextWorker from "../.open-next/worker.js";
import { authorized, login, loginPage } from "./demo-auth";

interface WebEnv {
  BACKEND_SERVICE: Fetcher;
  DEMO_USERNAME?: string;
  DEMO_PASSWORD?: string;
}
export default {
  async fetch(request: Request, env: WebEnv, ctx: ExecutionContext) {
    if (!env.DEMO_PASSWORD)
      return Response.json(
        {
          detail:
            "Configure the DEMO_PASSWORD Worker secret before opening the hosted demo.",
        },
        { status: 503 },
      );
    const path = new URL(request.url).pathname;
    if (path === "/auth/login" && request.method === "POST")
      return login(request, env);
    if (!(await authorized(request, env)))
      return path.startsWith("/api/") || path === "/ws/events"
        ? Response.json({ detail: "Sign in required" }, { status: 401 })
        : loginPage();
    if (path.startsWith("/api/") || path === "/ws/events") {
      const headers = new Headers(request.headers);
      headers.delete("Authorization");
      headers.delete("Cookie");
      return env.BACKEND_SERVICE.fetch(new Request(request, { headers }));
    }
    return nextWorker.fetch(request, env, ctx);
  },
};
