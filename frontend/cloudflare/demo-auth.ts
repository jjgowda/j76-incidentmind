export interface AuthEnv {
  DEMO_USERNAME?: string;
  DEMO_PASSWORD?: string;
}
const cookieName = "__Host-incidentmind";
const lifetime = 12 * 60 * 60;
async function signature(value: string, password: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function authorized(request: Request, env: AuthEnv) {
  if (!env.DEMO_PASSWORD) return false;
  const basic = request.headers.get("Authorization");
  if (basic?.startsWith("Basic ")) {
    try {
      const v = atob(basic.slice(6)),
        n = v.indexOf(":");
      if (
        n >= 0 &&
        v.slice(0, n) === (env.DEMO_USERNAME || "demo") &&
        v.slice(n + 1) === env.DEMO_PASSWORD
      )
        return true;
    } catch {}
  }
  const cookie = request.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!cookie) return false;
  const [timestamp, hash] = cookie.split(".");
  const t = Number(timestamp),
    age = Date.now() / 1000 - t;
  return (
    Number.isFinite(t) &&
    age >= 0 &&
    age < lifetime &&
    hash === (await signature(timestamp, env.DEMO_PASSWORD))
  );
}
export async function login(request: Request, env: AuthEnv) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response("Invalid origin", { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Invalid login form", { status: 400 });
  }
  if (
    !env.DEMO_PASSWORD ||
    form.get("username") !== (env.DEMO_USERNAME || "demo") ||
    form.get("password") !== env.DEMO_PASSWORD
  )
    return loginPage(true);
  const t = String(Math.floor(Date.now() / 1000));
  const token = t + "." + (await signature(t, env.DEMO_PASSWORD));
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime}`,
      "Cache-Control": "no-store",
    },
  });
}
export function loginPage(failed = false) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · IncidentMind</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090f1a;color:#e8edf4;font:15px Arial,sans-serif}main{width:min(360px,80vw);padding:36px;background:#101d2d;border:1px solid #253e51;border-radius:16px}small{color:#63dce8;letter-spacing:2px;font-size:10px}h1{font-size:28px;letter-spacing:-1px;margin:18px 0 8px}p{color:#8fa7bb;font-size:13px;line-height:1.6}label{display:block;margin:20px 0;color:#b2c6d6;font-size:12px}input{box-sizing:border-box;width:100%;margin-top:8px;padding:12px;color:#e8edf4;background:#0b1523;border:1px solid #2b455b;border-radius:7px;font-size:15px}button{width:100%;padding:13px;border:0;border-radius:7px;color:#07121a;background:#6ce5ef;font-weight:600;cursor:pointer}.error{color:#f6a3b2}</style></head><body><main><small>J76 INCIDENTMIND</small><h1>Welcome back.</h1><p>Sign in to investigate incidents and explore your team's operational memory.</p>${failed ? '<p class="error" role="alert">The username or password was incorrect.</p>' : ""}<form action="/auth/login" method="post"><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Open IncidentMind</button></form></main></body></html>`,
    {
      status: failed ? 401 : 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
