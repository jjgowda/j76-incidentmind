import { z } from "zod";
import scenarios from "./scenarios.json";
import { SYSTEM, TOOLS } from "./agent-policy";

export interface ApiEnv {
  DB: D1Database;
  LLM_API_KEY: string;
  LLM_BASE_URL: string;
  LLM_MODEL: string;
  HINDSIGHT_URL: string;
  HINDSIGHT_API_KEY: string;
  HINDSIGHT_BANK_ID: string;
}
const Cause = z.object({
  cause: z.string().min(1).max(1000),
  evidence: z.array(z.string()).min(1).max(12),
  checks: z.array(z.string()).min(1).max(12),
  fix: z.string().min(1).max(2000),
});
const Diagnosis = z.object({
  root_causes: z.array(Cause).min(1).max(5),
  explanation: z.string().min(1).max(5000),
  memory_influence: z.string().max(3000),
  cited_memory_ids: z.array(z.string()).default([]),
});
const Resolution = z.object({
  root_cause: z.string().min(3).max(2000),
  successful_fix: z.string().min(3).max(5000),
  verification: z.string().min(3).max(5000),
  lessons_learned: z.string().min(3).max(5000),
  failed_attempts: z.array(z.string()).max(30).default([]),
  successful: z.boolean(),
});
const Assessment = z.object({
  correct_cause_rank: z.number().int().min(1).max(5).nullable().default(null),
  correct_fix_identified: z.boolean(),
  explanation_quality: z.enum(["poor", "adequate", "strong"]),
});
const Review = z.object({
  off: Assessment,
  on: Assessment,
  notes: z.string().min(3).max(5000),
});
type Log = { timestamp: string; level: string; message: string };
type ResolutionRecord = z.infer<typeof Resolution> & {
  timestamp: string;
  revision: number;
};
type Memory = { id?: string; text?: string; [key: string]: unknown };
type Investigation = z.infer<typeof Diagnosis> & {
  memory_enabled: boolean;
  memories: Memory[];
  duration_ms: number;
  model: string;
  prompt_version: string;
  tools: string[];
  verified: false;
  timestamp?: string;
  exact_root_cause_rank?: number | null;
  correct_solution_identified?: true | null;
  explanation_evidence_count?: number;
};
type Report = {
  id: string;
  incident_id: string;
  timestamp: string;
  off: Investigation;
  on: Investigation;
  expected_root_cause: string | null;
  scoring: string;
  review?: z.infer<typeof Review> & { timestamp: string; method: string };
};
export type Incident = {
  id: string;
  title: string;
  service: string;
  severity: string;
  scenario: string;
  simulated: boolean;
  environment: string;
  status: string;
  created_at: string;
  logs: Log[];
  service_info: Record<string, string>;
  expected_root_cause: string | null;
  expected_fix: string | null;
  investigations: Investigation[];
  resolutions: ResolutionRecord[];
  history: { timestamp: string; status: string; note: string }[];
  memory_status: string;
  evaluations?: Report[];
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const now = () => new Date().toISOString();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function history(i: Incident, note: string) {
  i.history.push({ timestamp: now(), status: i.status, note });
}
export function simulate(scenario: string, recurring = false): Incident {
  if (!(scenario in scenarios))
    throw new ApiError(422, "Unknown simulator scenario");
  const [title, service, severity, cause, fix, logs] = (
    scenarios as unknown as Record<
      string,
      [string, string, string, string, string, string[]]
    >
  )[scenario];
  const timestamp = now();
  return {
    id: "INC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    title:
      scenario === "images" && recurring
        ? "Catalogue thumbnails disappear after deployment"
        : title,
    service,
    severity,
    scenario,
    simulated: true,
    environment: "isolated-simulator",
    status: "active",
    created_at: timestamp,
    logs: (scenario === "images" && recurring
      ? [
          "GET /thumbnail/87.avif 502",
          "image transformer: origin fetch forbidden",
          "new asset hostname deployed; origin status 403",
        ]
      : logs
    ).map((message) => ({ timestamp, level: "ERROR", message })),
    service_info: {
      environment: "isolated-simulator",
      deployment: "synthetic-2026.11",
      service,
    },
    expected_root_cause: cause,
    expected_fix: fix,
    investigations: [],
    resolutions: [],
    history: [
      { timestamp, status: "active", note: "Simulated incident created" },
    ],
    memory_status: "not_saved",
  };
}
async function row(env: ApiEnv, id: string) {
  const r = await env.DB.prepare(
    "SELECT data, version FROM incidents WHERE id=?",
  )
    .bind(id)
    .first<{ data: string; version: number }>();
  if (!r) throw new ApiError(404, "Incident not found");
  return { incident: JSON.parse(r.data) as Incident, version: r.version };
}
async function get(env: ApiEnv, id: string) {
  return (await row(env, id)).incident;
}
async function create(env: ApiEnv, i: Incident) {
  await env.DB.prepare(
    "INSERT INTO incidents (id,data,version,created_at) VALUES (?,?,0,?)",
  )
    .bind(i.id, JSON.stringify(i), i.created_at)
    .run();
  return i;
}
async function list(env: ApiEnv) {
  const r = await env.DB.prepare(
    "SELECT data FROM incidents ORDER BY created_at DESC",
  ).all<{ data: string }>();
  return r.results.map((x) => JSON.parse(x.data) as Incident);
}
// Optimistic compare-and-swap prevents slow provider requests overwriting newer edits.
async function mutate(env: ApiEnv, id: string, update: (i: Incident) => void) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await row(env, id);
    update(r.incident);
    const result = await env.DB.prepare(
      "UPDATE incidents SET data=?, version=version+1 WHERE id=? AND version=?",
    )
      .bind(JSON.stringify(r.incident), id, r.version)
      .run();
    if (result.meta.changes === 1) return r.incident;
  }
  throw new ApiError(409, "Incident changed concurrently. Retry the action.");
}
export function metrics(items: Incident[]) {
  const services: Record<string, string> = {};
  for (const i of items)
    services[i.service] =
      i.status === "active" || services[i.service] === "degraded"
        ? "degraded"
        : "healthy";
  return {
    total: items.length,
    active: items.filter((i) => i.status === "active").length,
    resolved: items.filter((i) => i.status === "resolved").length,
    critical: items.filter(
      (i) => i.status === "active" && i.severity === "critical",
    ).length,
    services,
    investigations: items.reduce((n, i) => n + i.investigations.length, 0),
    retained: items.filter((i) => i.memory_status === "saved").length,
  };
}
async function provider(url: string, key: string, body: unknown, name: string) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: "Bearer " + key } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok)
      throw new ApiError(
        503,
        `${name} returned HTTP ${r.status}. ${r.status === 429 ? "Rate limit reached; retry later." : "Check credentials, model, bank and service availability."}`,
      );
    return (await r.json()) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      503,
      `${name} timed out or returned an invalid response. Retry the operation.`,
    );
  }
}
async function hindsight(env: ApiEnv, path: string, body: unknown) {
  if (!env.HINDSIGHT_URL)
    throw new ApiError(503, "Hindsight is not configured");
  return provider(
    env.HINDSIGHT_URL.replace(/\/$/, "") +
      "/v1/default/banks/" +
      encodeURIComponent(env.HINDSIGHT_BANK_ID) +
      path,
    env.HINDSIGHT_API_KEY,
    body,
    "Hindsight",
  );
}
async function recall(env: ApiEnv, query: string) {
  const response = await hindsight(env, "/memories/recall", {
    query,
    max_tokens: 3000,
    budget: "mid",
  });
  if (!Array.isArray(response.results))
    throw new ApiError(503, "Hindsight returned invalid recall data");
  return response.results as Memory[];
}
export function currentEvidence(i: Incident) {
  return {
    id: i.id,
    title: i.title,
    service: i.service,
    environment: i.environment,
    logs: i.logs,
    service_info: i.service_info,
  };
}
export async function investigate(
  env: ApiEnv,
  i: Incident,
  enabled: boolean,
): Promise<Investigation> {
  if (!env.LLM_API_KEY) throw new ApiError(503, "LLM is not configured");
  const started = performance.now();
  const memories = enabled
    ? await recall(
        env,
        i.service + " " + i.title + " " + JSON.stringify(i.logs),
      )
    : [];
  const evidence = currentEvidence(i);
  const chat = async (messages: unknown[], extra: Record<string, unknown>) => {
    const r = await provider(
      env.LLM_BASE_URL.replace(/\/$/, "") + "/chat/completions",
      env.LLM_API_KEY,
      { model: env.LLM_MODEL, temperature: 0, messages, ...extra },
      "LLM",
    );
    const parsed = z
      .object({
        choices: z
          .array(
            z.object({
              message: z.object({
                content: z.string().nullable().optional(),
                tool_calls: z
                  .array(
                    z.object({
                      id: z.string(),
                      function: z.object({
                        name: z.string(),
                        arguments: z.string(),
                      }),
                    }),
                  )
                  .optional(),
              }),
            }),
          )
          .min(1),
      })
      .safeParse(r);
    if (!parsed.success)
      throw new ApiError(503, "LLM returned an invalid response");
    return parsed.data.choices[0].message;
  };
  const first = await chat(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          incident: evidence,
          historical_memories: memories,
        }),
      },
    ],
    { tools: TOOLS, tool_choice: "required" },
  );
  const tools: string[] = [];
  const collected_tool_evidence: { tool_call_id: string; content: string }[] =
    [];
  for (const call of first.tool_calls || []) {
    if (!["collect_logs", "inspect_service"].includes(call.function.name))
      throw new ApiError(503, "LLM requested an unsupported tool");
    tools.push(call.function.name);
    collected_tool_evidence.push({
      tool_call_id: call.id,
      content: JSON.stringify(
        call.function.name === "collect_logs" ? i.logs : i.service_info,
      ),
    });
  }
  const final = await chat(
    [
      {
        role: "system",
        content:
          SYSTEM +
          "\nEvidence collection is complete. All logs, service information and collected tool outputs are supplied. Do not request tools. Return only the final diagnosis JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          incident: evidence,
          historical_memories: memories,
          collected_tool_evidence,
        }),
      },
    ],
    { response_format: { type: "json_object" } },
  );
  let result: z.infer<typeof Diagnosis>;
  try {
    result = Diagnosis.parse(JSON.parse(final.content || ""));
  } catch {
    throw new ApiError(
      503,
      "LLM returned invalid diagnosis JSON. Retry investigation.",
    );
  }
  const valid = new Set(memories.map((m) => m.id).filter(Boolean));
  if (result.cited_memory_ids.some((id) => !valid.has(id)))
    throw new ApiError(
      503,
      "LLM cited a memory that was not retrieved. Retry investigation.",
    );
  return {
    ...result,
    memory_enabled: enabled,
    memories,
    duration_ms: Math.round(performance.now() - started),
    model: env.LLM_MODEL,
    prompt_version: "v2-workers",
    tools,
    verified: false,
  };
}
export function score(i: Incident, r: Investigation) {
  const same = (a: string, b: string | null) =>
    a.trim().toLowerCase() === b?.trim().toLowerCase();
  const rank = r.root_causes.findIndex((c) =>
    same(c.cause, i.expected_root_cause),
  );
  return {
    ...r,
    exact_root_cause_rank: rank < 0 ? null : rank + 1,
    correct_solution_identified: r.root_causes.some(
      (c) =>
        same(c.cause, i.expected_root_cause) && same(c.fix, i.expected_fix),
    )
      ? (true as const)
      : null,
    explanation_evidence_count: r.root_causes.reduce(
      (n, c) => n + c.evidence.length,
      0,
    ),
  };
}
async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(422, "Request body must be valid JSON");
  }
}
async function route(
  request: Request,
  env: ApiEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/ws/events") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      throw new ApiError(426, "WebSocket upgrade required");
    const pair = new WebSocketPair(),
      client = pair[0],
      server = pair[1];
    server.accept();
    let sending = false;
    const send = async () => {
      if (sending) return;
      sending = true;
      try {
        server.send(
          JSON.stringify({ type: "metrics", data: metrics(await list(env)) }),
        );
      } catch {
        clearInterval(timer);
        try {
          server.close(1011, "Telemetry unavailable");
        } catch {}
      } finally {
        sending = false;
      }
    };
    const timer = setInterval(() => void send(), 2000);
    server.addEventListener("close", () => clearInterval(timer));
    server.addEventListener("error", () => clearInterval(timer));
    ctx.waitUntil(send());
    return new Response(null, { status: 101, webSocket: client });
  }
  if (method === "GET" && path === "/api/health") {
    await env.DB.prepare("SELECT 1").first();
    return json({
      status: "ok",
      database: "connected",
      storage: "Cloudflare D1",
      llm_configured: !!env.LLM_API_KEY,
      hindsight_configured: !!env.HINDSIGHT_URL,
      model: env.LLM_MODEL,
      bank: env.HINDSIGHT_BANK_ID,
      note: "Configured flags do not establish live provider connectivity",
    });
  }
  if (method === "GET" && path === "/api/scenarios")
    return json(
      Object.entries(scenarios).map(([id, v]) => ({
        id,
        title: v[0],
        service: v[1],
        severity: v[2],
      })),
    );
  if (method === "GET" && path === "/api/incidents")
    return json(await list(env));
  if (method === "GET" && path === "/api/metrics")
    return json(metrics(await list(env)));
  if (method === "POST" && path === "/api/simulate") {
    const b = z
      .object({ scenario: z.string(), recurring: z.boolean().default(false) })
      .parse(await body(request));
    return json(await create(env, simulate(b.scenario, b.recurring)), 201);
  }
  if (method === "POST" && path === "/api/incidents") {
    const b = z
      .object({
        title: z.string().min(3).max(200),
        service: z.string().min(2).max(100),
        symptoms: z.string().min(5).max(10000),
        severity: z.enum(["low", "high", "critical"]).default("high"),
      })
      .parse(await body(request));
    const i = simulate("http500");
    Object.assign(i, {
      title: b.title,
      service: b.service,
      severity: b.severity,
      scenario: "manual",
      simulated: false,
      environment: "manual-evidence",
      expected_root_cause: null,
      expected_fix: null,
      logs: [{ timestamp: now(), level: "ERROR", message: b.symptoms }],
      service_info: { service: b.service, environment: "manual-evidence" },
    });
    return json(await create(env, i), 201);
  }
  if (method === "GET" && path === "/api/memories")
    return json({
      results: await recall(
        env,
        (url.searchParams.get("q") || "incident resolution").slice(0, 2000),
      ),
    });
  if (method === "POST" && path === "/api/memories/reflect") {
    const b = z
      .object({ query: z.string().min(3).max(2000) })
      .parse(await body(request));
    const r = await hindsight(env, "/reflect", {
      query: b.query,
      budget: "low",
      max_tokens: 4096,
    });
    if (typeof r.text !== "string")
      throw new ApiError(503, "Hindsight returned an invalid reflection");
    return json({ text: r.text });
  }
  if (method === "POST" && path === "/api/evaluate") {
    const b = z.object({ incident_id: z.string() }).parse(await body(request)),
      i = await get(env, b.incident_id);
    const off = score(i, await investigate(env, i, false)),
      on = score(i, await investigate(env, i, true));
    const report: Report = {
      id: crypto.randomUUID(),
      incident_id: i.id,
      timestamp: now(),
      off,
      on,
      expected_root_cause: i.expected_root_cause,
      scoring:
        "Exact text match only. No match is unadjudicated, not an incorrect diagnosis. Evidence count is not a quality score. Review explanations manually.",
    };
    await mutate(env, i.id, (d) => {
      (d.evaluations ??= []).push(report);
    });
    return json(report);
  }
  const match = path.match(/^\/api\/incidents\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const [, id, action] = match;
    if (method === "GET" && !action) return json(await get(env, id));
    if (method === "GET" && action === "memory") {
      const i = await get(env, id);
      return json({ results: await recall(env, i.service + " " + i.title) });
    }
    if (method === "POST" && action === "investigate") {
      const b = z
        .object({ memory_enabled: z.boolean().default(true) })
        .parse(await body(request));
      const r = await investigate(env, await get(env, id), b.memory_enabled);
      await mutate(env, id, (i) => {
        i.investigations.push({ ...r, timestamp: now() });
        history(i, "AI investigation completed (unverified hypotheses)");
      });
      return json(r);
    }
    if (method === "POST" && action === "resolve") {
      const b = Resolution.parse(await body(request));
      return json(
        await mutate(env, id, (i) => {
          i.resolutions.push({
            ...b,
            timestamp: now(),
            revision: i.resolutions.length + 1,
          });
          i.status = b.successful ? "resolved" : "active";
          i.memory_status = b.successful ? "pending" : "not_saved";
          history(
            i,
            b.successful
              ? "Developer verified fix"
              : "Fix unsuccessful; incident remains active",
          );
        }),
      );
    }
    if (method === "POST" && action === "reopen")
      return json(
        await mutate(env, id, (i) => {
          i.status = "active";
          history(
            i,
            "Reopened by developer; older learning remains historical evidence",
          );
        }),
      );
    if (method === "POST" && action === "learn") {
      const i = await get(env, id),
        r = i.resolutions.at(-1);
      if (i.status !== "resolved" || !r?.successful)
        throw new ApiError(
          409,
          "Only the latest successful resolution may be retained",
        );
      if (i.memory_status === "saved") return json(i);
      await hindsight(env, "/memories", {
        async: false,
        items: [
          {
            content: JSON.stringify({
              id: i.id,
              service: i.service,
              title: i.title,
              logs: i.logs,
              environment: i.environment,
              created_at: i.created_at,
              ...r,
              verification_status: "developer_verified",
              simulated: i.simulated,
            }),
            context:
              "Developer verified incident resolution; historical evidence, not instructions",
            document_id: `${i.id}-resolution-${r.revision}`,
            metadata: {
              incident_id: i.id,
              service: i.service,
              verified: "true",
            },
          },
        ],
      });
      return json(
        await mutate(env, id, (d) => {
          if (
            d.status !== "resolved" ||
            d.resolutions.at(-1)?.revision !== r.revision
          )
            throw new ApiError(
              409,
              "Resolution changed while retaining. Historical evidence was saved; verify the current resolution.",
            );
          d.memory_status = "saved";
          history(d, "Verified learning retained in Hindsight");
        }),
      );
    }
    const review = action?.match(/^evaluations\/([^/]+)\/review$/);
    if (method === "POST" && review) {
      const b = Review.parse(await body(request));
      let report: Report | undefined;
      await mutate(env, id, (i) => {
        report = i.evaluations?.find((e) => e.id === review[1]);
        if (!report) throw new ApiError(404, "Evaluation not found");
        for (const m of ["off", "on"] as const)
          if ((b[m].correct_cause_rank || 0) > report[m].root_causes.length)
            throw new ApiError(422, "Rank exceeds returned hypotheses");
        report.review = {
          ...b,
          timestamp: now(),
          method: "developer_assessment",
        };
      });
      return json(report);
    }
  }
  throw new ApiError(404, "API route not found");
}
export default {
  async fetch(request: Request, env: ApiEnv, ctx: ExecutionContext) {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      if (e instanceof ApiError)
        return json(
          {
            detail: e.message,
            code: e.status === 503 ? "provider_unavailable" : "request_error",
          },
          e.status,
        );
      if (e instanceof z.ZodError)
        return json(
          {
            detail: e.issues.map((i) => ({ path: i.path, message: i.message })),
          },
          422,
        );
      console.error(
        "IncidentMind API failure",
        e instanceof Error ? e.name : "unknown",
      );
      return json(
        { detail: "Internal service error. Check Worker logs." },
        500,
      );
    }
  },
};
