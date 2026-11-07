"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Database,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Loader2,
  MemoryStick,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
type Log = { timestamp: string; level: string; message: string };
type Cause = {
  cause: string;
  evidence: string[];
  checks: string[];
  fix: string;
};
type Memory = { id?: string; text?: string; [key: string]: unknown };
type Result = {
  memory_enabled: boolean;
  root_causes: Cause[];
  explanation: string;
  memory_influence: string;
  memories: Memory[];
  duration_ms: number;
  model: string;
  tools: string[];
  timestamp?: string;
  exact_root_cause_rank?: number | null;
  correct_solution_identified?: boolean | null;
  explanation_evidence_count?: number;
};
type Incident = {
  id: string;
  title: string;
  service: string;
  severity: string;
  status: string;
  created_at: string;
  simulated: boolean;
  logs: Log[];
  investigations: Result[];
  evaluations?: Evaluation[];
  history: { timestamp: string; status: string; note: string }[];
  memory_status: string;
  expected_root_cause?: string;
  expected_fix?: string;
  resolutions: {
    root_cause: string;
    successful_fix: string;
    verification: string;
    successful: boolean;
  }[];
};
type Metrics = {
  total: number;
  active: number;
  resolved: number;
  critical: number;
  services: Record<string, string>;
  investigations: number;
  retained: number;
};
type Health = {
  llm_configured: boolean;
  hindsight_configured: boolean;
  model: string;
  bank: string;
};
type Assessment = {
  correct_cause_rank: number | null;
  correct_fix_identified: boolean;
  explanation_quality: string;
};
type Evaluation = {
  id: string;
  incident_id: string;
  review?: {
    off: Assessment;
    on: Assessment;
    notes: string;
    timestamp: string;
  };
  off: Result;
  on: Result;
  expected_root_cause?: string;
  scoring: string;
};
const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/incidents", "Incidents", CircleAlert],
  ["/memory", "Memory Explorer", BrainCircuit],
  ["/comparison", "Comparison Lab", FlaskConical],
  ["/settings", "Settings", Settings],
] as const;
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) {
    let message = "Request failed";
    try {
      const e = (await r.json()) as { detail?: unknown };
      message =
        typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail);
    } catch {}
    throw new Error(message);
  }
  return r.json();
}
const date = (s: string) => new Date(s).toLocaleString();
function Badge({ value }: { value: string }) {
  return <span className={"badge " + value}>{value.replace("_", " ")}</span>;
}
function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Radio size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-head">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Diagnosis({ result }: { result: Result }) {
  return (
    <div className="diagnosis">
      <div className="flex flex-wrap gap-2">
        <Badge value="unverified" />
        <Badge value={result.memory_enabled ? "Memory ON" : "Memory OFF"} />
        <span className="muted">
          {result.model} · {(result.duration_ms / 1000).toFixed(2)}s ·{" "}
          {result.memories.length} recalled facts
        </span>
      </div>
      <p>{result.explanation}</p>
      {result.root_causes.map((c, i) => (
        <article className="cause" key={i}>
          <span className="rank">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <h3>{c.cause}</h3>
            <p className="muted">{c.evidence.join(" · ")}</p>
            <h4>Diagnostic checks</h4>
            <ul>
              {c.checks.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ul>
            <h4>Suggested fix</h4>
            <p>{c.fix}</p>
          </div>
        </article>
      ))}
      <div className="insight">
        <BrainCircuit size={18} />
        <div>
          <h4>Memory influence</h4>
          <p>{result.memory_influence}</p>
        </div>
      </div>
      {result.memories.map((m, i) => (
        <details key={i}>
          <summary>Retrieved evidence · {m.id || i + 1}</summary>
          <pre>{m.text || JSON.stringify(m, null, 2)}</pre>
        </details>
      ))}
      <p className="muted small">
        Read-only tool calls:{" "}
        {result.tools.join(", ") || "Evidence supplied directly in prompt"}.
        Suggestions require developer verification.
      </p>
    </div>
  );
}
export default function Workspace() {
  const path = usePathname(),
    router = useRouter();
  const simulatorRef = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<Incident[]>([]),
    [metrics, setMetrics] = useState<Metrics | null>(null),
    [health, setHealth] = useState<Health | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [loading, setLoading] = useState(true),
    [online, setOnline] = useState(false),
    [search, setSearch] = useState(""),
    [showSimulator, setShowSimulator] = useState(false),
    [scenarios, setScenarios] = useState<
      { id: string; title: string; service: string }[]
    >([]),
    [scenario, setScenario] = useState("images"),
    [recurring, setRecurring] = useState(false),
    [selected, setSelected] = useState(""),
    [enabled, setEnabled] = useState(true),
    [memories, setMemories] = useState<Memory[] | null>(null),
    [reflection, setReflection] = useState(""),
    [evaluation, setEvaluation] = useState<Evaluation | null>(null),
    [success, setSuccess] = useState("");
  useEffect(() => {
    const dialog = simulatorRef.current;
    if (!dialog) return;
    if (showSimulator && !dialog.open) dialog.showModal();
    if (!showSimulator && dialog.open) dialog.close();
  }, [showSimulator]);
  const [rootCause, setRootCause] = useState(""),
    [fix, setFix] = useState(""),
    [verification, setVerification] = useState(""),
    [lesson, setLesson] = useState(""),
    [failed, setFailed] = useState(""),
    [successful, setSuccessful] = useState(true);
  const refresh = useCallback(async () => {
    const [i, m, h, s] = await Promise.all([
      api<Incident[]>("/incidents"),
      api<Metrics>("/metrics"),
      api<Health>("/health"),
      api<typeof scenarios>("/scenarios"),
    ]);
    setItems(i);
    setMetrics(m);
    setHealth(h);
    setScenarios(s);
  }, []);
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const interval = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(interval);
  }, [refresh]);
  useEffect(() => {
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    function connect() {
      socket = new WebSocket(
        process.env.NEXT_PUBLIC_WS_URL ||
          (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1"
            ? "ws://localhost:8000/ws/events"
            : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/events`),
      );
      socket.onopen = () => setOnline(true);
      socket.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "metrics") setMetrics(event.data);
        } catch {}
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        setOnline(false);
        if (!stopped) timer = setTimeout(connect, 5000);
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, []);
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setError("");
    setSuccess("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy("");
    }
  };
  const incident = path.startsWith("/incidents/")
    ? items.find((i) => i.id === path.split("/")[2])
    : undefined;
  useEffect(() => {
    setRootCause("");
    setFix("");
    setVerification("");
    setLesson("");
    setFailed("");
    setSuccessful(true);
  }, [incident?.id]);
  const filtered = items.filter((i) =>
    (i.title + " " + i.id + " " + i.service + " " + i.status)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const simulate = () =>
    run("simulate", async () => {
      const i = await api<Incident>("/simulate", { scenario, recurring });
      setShowSimulator(false);
      router.push("/incidents/" + i.id);
    });
  const table = (list: Incident[]) =>
    list.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Incident</th>
              <th>Service</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link href={"/incidents/" + i.id}>
                    <span className="incident-id">{i.id}</span>
                    <strong>{i.title}</strong>
                    <span className="small muted">
                      {i.simulated ? "SIMULATED" : "MANUAL EVIDENCE"}
                    </span>
                  </Link>
                </td>
                <td>
                  <span className="service-dot" />
                  {i.service}
                </td>
                <td>
                  <Badge value={i.severity} />
                </td>
                <td>
                  <Badge value={i.status} />
                </td>
                <td className="muted small">{date(i.created_at)}</td>
                <td>
                  <Link aria-label={"Open " + i.id} href={"/incidents/" + i.id}>
                    <ChevronRight size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty title="A clean slate. Start an investigation.">
        Trigger a safe simulated incident to begin building your team's
        operational memory.
      </Empty>
    );
  const chart = Array.from({ length: 12 }, (_, n) => {
    const end = Date.now() - (11 - n) * 3600000;
    return {
      time: new Date(end).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      incidents: items.filter((i) => {
        const t = new Date(i.created_at).getTime();
        return t > end - 3600000 && t <= end;
      }).length,
    };
  });
  const pageTitle = incident
    ? "Incident investigation"
    : nav.find((n) => n[0] === path)?.[1] || "Incidents";
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <div className="brand-icon">
            <BrainCircuit size={25} />
          </div>
          <div>
            <strong>
              IncidentMind<span>J76</span>
            </strong>
            <small>OPERATIONS, REMEMBERED.</small>
          </div>
        </Link>
        <div className="workspace-label">
          <span className="workspace-avatar">J</span>
          <div>
            J76 workspace<small>Hackathon environment</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([url, label, Icon]) => (
            <Link
              className={
                (url === "/" ? path === "/" : path.startsWith(url))
                  ? "nav active-nav"
                  : "nav"
              }
              href={url}
              key={url}
            >
              <Icon size={18} />
              {label}
              {url === "/incidents" && !!metrics?.active && (
                <b>{metrics.active}</b>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="memory-card">
            <span className="cyan">
              <BrainCircuit size={20} />
            </span>
            <h4>Experience is your edge.</h4>
            <p>Every verified fix makes the next investigation smarter.</p>
            <Link href="/memory">
              Explore your memory <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="profile">
            <span className="workspace-avatar">J76</span>
            <div>
              IncidentMind Demo<small>Isolated simulator</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{pageTitle}</span>
          </div>
          <div className="live">
            <span className={"dot " + (online ? "" : "offline")} />
            {online ? "Live telemetry" : "Polling · 10s"}
            <span className="env">DEVELOPMENT</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow cyan">INTELLIGENCE THAT COMPOUNDS</div>
              <h1>{path === "/" ? "Your systems. In focus." : pageTitle}</h1>
              <p>
                {path === "/"
                  ? "Every incident tells a story. Make sure your AI remembers it."
                  : incident
                    ? `${incident.id} · ${incident.service}`
                    : "The AI Engineer That Never Forgets a Problem."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                aria-label="Refresh data"
                disabled={!!busy}
                onClick={() => run("refresh", refresh)}
              >
                <RefreshCw size={15} />
              </Button>
              <Button disabled={!!busy} onClick={() => setShowSimulator(true)}>
                <Plus size={16} /> Simulate incident
              </Button>
            </div>
          </div>
          {error && (
            <div role="alert" className="alert">
              <TriangleAlert size={18} />
              <div>
                <strong>Action could not complete</strong>
                <p>{error}</p>
              </div>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {success && (
            <div role="status" className="notice">
              <Check size={16} />
              {success}
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              <Loader2 size={15} className="spin" />
              {busy === "evaluate"
                ? "Running two real investigations against the same evidence…"
                : busy === "investigate"
                  ? "Collecting evidence and investigating…"
                  : "Processing…"}
            </div>
          )}
          {loading ? (
            <Empty title="Connecting to IncidentMind…">
              Loading the incident store and service status.
            </Empty>
          ) : path === "/" ? (
            <>
              <div className="stat-grid">
                {[
                  [
                    "Total incidents",
                    metrics?.total,
                    Activity,
                    "All recorded incidents",
                  ],
                  [
                    "Active incidents",
                    metrics?.active,
                    Radio,
                    "Awaiting a verified resolution",
                  ],
                  [
                    "Resolved incidents",
                    metrics?.resolved,
                    ShieldCheck,
                    "Developer verified fixes",
                  ],
                  [
                    "Critical alerts",
                    metrics?.critical,
                    TriangleAlert,
                    "Active critical incidents",
                  ],
                ].map(([label, value, Icon, note]) => {
                  const I = Icon as typeof Activity;
                  return (
                    <div className="stat" key={String(label)}>
                      <div>
                        {String(label)}
                        <I size={17} />
                      </div>
                      <strong>
                        {String(value ?? 0)}
                        <span
                          className={
                            "mini-line " +
                            (label === "Critical alerts" ? "red" : "")
                          }
                        >
                          <Activity size={45} />
                        </span>
                      </strong>
                      <small>{String(note)}</small>
                    </div>
                  );
                })}
              </div>
              <div className="overview-grid">
                <Panel
                  title="Incident activity"
                  eyebrow="LAST 12 HOURS"
                  action={
                    <span className="legend">
                      <i /> Simulated & manual incidents
                    </span>
                  }
                >
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chart}>
                        <defs>
                          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="0%"
                              stopColor="#38d9ec"
                              stopOpacity={0.25}
                            />
                            <stop
                              offset="100%"
                              stopColor="#38d9ec"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#1b2637" vertical={false} />
                        <XAxis
                          dataKey="time"
                          tick={{ fill: "#718097", fontSize: 10 }}
                          minTickGap={35}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#718097", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={25}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#101a29",
                            border: "1px solid #263246",
                            borderRadius: 8,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="incidents"
                          stroke="#38d9ec"
                          strokeWidth={2}
                          fill="url(#fill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel
                  title="Memory engine"
                  eyebrow="POWERED BY HINDSIGHT"
                  action={<BrainCircuit size={20} className="cyan" />}
                >
                  <div className="memory-orbit">
                    <BrainCircuit size={42} />
                    <span className="orbit-point" />
                  </div>
                  <div className="engine-stats">
                    <div>
                      <strong>{metrics?.retained || 0}</strong>
                      <small>Retained incidents</small>
                    </div>
                    <div>
                      <strong>{metrics?.investigations || 0}</strong>
                      <small>Investigations</small>
                    </div>
                  </div>
                  <div className="engine-status">
                    <span
                      className={
                        "dot " + (health?.hindsight_configured ? "" : "offline")
                      }
                    />
                    {health?.hindsight_configured
                      ? "Endpoint configured · live check on use"
                      : "Awaiting Hindsight configuration"}
                  </div>
                </Panel>
              </div>
              <Panel
                title="Recent incidents"
                eyebrow="INVESTIGATE. RESOLVE. REMEMBER."
                action={
                  <Link href="/incidents" className="text-link">
                    View all incidents <ArrowRight size={14} />
                  </Link>
                }
              >
                {table(items.slice(0, 5))}
              </Panel>
              <div className="bottom-grid">
                <Panel
                  title="Service health"
                  action={
                    <span className="small muted">Incident-derived status</span>
                  }
                >
                  {Object.keys(metrics?.services || {}).length ? (
                    Object.entries(metrics!.services).map(
                      ([service, state]) => (
                        <div className="service-row" key={service}>
                          <span>
                            <Database size={16} />
                            {service}
                          </span>
                          <Badge value={state} />
                        </div>
                      ),
                    )
                  ) : (
                    <p className="muted pad">
                      Services appear when their first incident is created.
                    </p>
                  )}
                </Panel>
                <Panel
                  title="Investigation feed"
                  action={<Terminal size={16} className="muted" />}
                >
                  {items
                    .flatMap((i) =>
                      i.history.slice(-2).map((h, n) => (
                        <div className="feed-row" key={i.id + n}>
                          <span className="dot" />
                          <div>
                            <p>{h.note}</p>
                            <small>
                              {i.id} · {date(h.timestamp)}
                            </small>
                          </div>
                        </div>
                      )),
                    )
                    .slice(0, 5)}
                  {!items.length && (
                    <p className="pad muted">
                      No activity yet. Your investigation timeline will appear
                      here.
                    </p>
                  )}
                </Panel>
              </div>
            </>
          ) : incident ? (
            <>
              <div className="detail-meta">
                <Badge value={incident.status} />
                <Badge value={incident.severity} />
                <Badge value={incident.simulated ? "simulated" : "manual"} />
                <span className="muted">{date(incident.created_at)}</span>
              </div>
              <h2 className="detail-title">{incident.title}</h2>
              <div className="detail-grid">
                <div>
                  <Panel
                    title="Evidence & error logs"
                    action={<Terminal size={17} />}
                  >
                    <div className="logs">
                      {incident.logs.map((l, i) => (
                        <div key={i}>
                          <time>
                            {new Date(l.timestamp).toLocaleTimeString()}
                          </time>
                          <span>ERROR</span>
                          <code>{l.message}</code>
                        </div>
                      ))}
                    </div>
                    <p className="small muted pad">
                      Environment:{" "}
                      {incident.simulated
                        ? "isolated-simulator"
                        : "manual-evidence"}{" "}
                      · No production actions executed
                    </p>
                  </Panel>
                  <Panel
                    title="AI investigation"
                    action={
                      <div className="flex items-center gap-3">
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                          />{" "}
                          Memory {enabled ? "ON" : "OFF"}
                        </label>
                        <Button
                          size="sm"
                          disabled={!!busy}
                          onClick={() =>
                            run("investigate", async () => {
                              await api(
                                "/incidents/" + incident.id + "/investigate",
                                { memory_enabled: enabled },
                              );
                            })
                          }
                        >
                          <Sparkles size={14} />
                          Investigate with AI
                        </Button>
                      </div>
                    }
                  >
                    {incident.investigations.length ? (
                      <Diagnosis
                        result={
                          incident.investigations[
                            incident.investigations.length - 1
                          ]
                        }
                      />
                    ) : (
                      <Empty title="Follow the evidence.">
                        Run an investigation to generate ranked hypotheses,
                        checks, and suggested fixes.
                      </Empty>
                    )}
                  </Panel>
                </div>
                <div>
                  <Panel
                    title="Verify a resolution"
                    eyebrow="HUMAN CONFIRMATION REQUIRED"
                  >
                    <form
                      className="form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run("resolve", async () => {
                          await api("/incidents/" + incident.id + "/resolve", {
                            root_cause: rootCause,
                            successful_fix: fix,
                            verification,
                            lessons_learned: lesson,
                            failed_attempts: failed.split("\n").filter(Boolean),
                            successful,
                          });
                          setSuccess(
                            successful
                              ? "Verified resolution saved. Save learning to retain it in Hindsight."
                              : "Unsuccessful attempt recorded. Incident remains active.",
                          );
                        });
                      }}
                    >
                      <label>
                        Confirmed root cause
                        <textarea
                          required
                          minLength={3}
                          value={rootCause}
                          onChange={(e) => setRootCause(e.target.value)}
                          placeholder="What actually caused the incident?"
                        />
                      </label>
                      <label>
                        Fix applied
                        <textarea
                          required
                          minLength={3}
                          value={fix}
                          onChange={(e) => setFix(e.target.value)}
                          placeholder="Describe the fix you verified"
                        />
                      </label>
                      <label>
                        Verification evidence
                        <textarea
                          required
                          minLength={3}
                          value={verification}
                          onChange={(e) => setVerification(e.target.value)}
                          placeholder="e.g. synthetic image request returns 200"
                        />
                      </label>
                      <label>
                        Lessons learned
                        <textarea
                          required
                          minLength={3}
                          value={lesson}
                          onChange={(e) => setLesson(e.target.value)}
                        />
                      </label>
                      <label>
                        Failed attempts (one per line)
                        <textarea
                          value={failed}
                          onChange={(e) => setFailed(e.target.value)}
                        />
                      </label>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={successful}
                          onChange={(e) => setSuccessful(e.target.checked)}
                        />{" "}
                        Resolution successful
                      </label>
                      <Button disabled={!!busy} type="submit">
                        <ShieldCheck size={15} />
                        Record verification
                      </Button>
                    </form>
                    {incident.simulated && (
                      <details className="pad">
                        <summary>
                          Simulator answer key · for developer verification
                        </summary>
                        <p>{incident.expected_root_cause}</p>
                        <p>{incident.expected_fix}</p>
                      </details>
                    )}
                    <div className="resolution-actions">
                      <Button
                        variant="outline"
                        disabled={
                          !!busy ||
                          incident.status !== "resolved" ||
                          incident.memory_status === "saved"
                        }
                        onClick={() =>
                          run("learn", async () => {
                            await api(
                              "/incidents/" + incident.id + "/learn",
                              {},
                            );
                            setSuccess(
                              "Verified learning retained in Hindsight.",
                            );
                          })
                        }
                      >
                        <BrainCircuit size={15} />
                        {incident.memory_status === "saved"
                          ? "Learning saved"
                          : "Save learning to Hindsight"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!!busy || incident.status === "active"}
                        onClick={() =>
                          run("reopen", async () => {
                            await api(
                              "/incidents/" + incident.id + "/reopen",
                              {},
                            );
                          })
                        }
                      >
                        Reopen incident
                      </Button>
                    </div>
                  </Panel>
                  <Panel title="Status history">
                    {incident.history.map((h, i) => (
                      <div className="feed-row" key={i}>
                        <span className="dot" />
                        <div>
                          <p>{h.note}</p>
                          <small>{date(h.timestamp)}</small>
                        </div>
                      </div>
                    ))}
                  </Panel>
                </div>
              </div>
            </>
          ) : path === "/incidents" ? (
            <Panel
              title="All incidents"
              action={
                <div className="search">
                  <Search size={15} />
                  <input
                    aria-label="Search incidents"
                    placeholder="Search incidents…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              }
            >
              {table(filtered)}
            </Panel>
          ) : path === "/memory" ? (
            <>
              <div className="feature-banner">
                <div className="feature-icon">
                  <BrainCircuit size={32} />
                </div>
                <div>
                  <h2>Your team's experience, connected.</h2>
                  <p>
                    Search Hindsight for historical evidence. Inspect source IDs
                    and compare old fixes to current conditions.
                  </p>
                </div>
                <Badge value="persistent" />
              </div>
              <Panel
                title="Recall historical incidents"
                eyebrow="LIVE HINDSIGHT SEARCH"
              >
                <form
                  className="search-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("recall", async () => {
                      const r = await api<{ results: Memory[] }>(
                        "/memories?q=" +
                          encodeURIComponent(
                            search || "verified incident resolution",
                          ),
                      );
                      setMemories(r.results);
                    });
                  }}
                >
                  <Search size={19} />
                  <input
                    aria-label="Search Hindsight"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search symptoms, services, or successful fixes…"
                  />
                  <Button disabled={!!busy}>Recall memories</Button>
                </form>
                {memories === null ? (
                  <Empty title="Memory starts with a verified fix.">
                    Resolve an incident, save its learning, then recall it here.
                    Results come directly from Hindsight.
                  </Empty>
                ) : !memories.length ? (
                  <Empty title="No relevant memories returned.">
                    Try a different query, or verify the retained document in
                    your Hindsight bank.
                  </Empty>
                ) : (
                  <div className="memory-results">
                    {memories.map((m, i) => (
                      <article key={i}>
                        <div className="flex justify-between">
                          <BrainCircuit size={20} className="cyan" />
                          <Badge value="recalled" />
                        </div>
                        <h3>Historical evidence {i + 1}</h3>
                        <p>{m.text || JSON.stringify(m)}</p>
                        <details>
                          <summary>Source & relationship metadata</summary>
                          <pre>{JSON.stringify(m, null, 2)}</pre>
                        </details>
                      </article>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Reflect across experience">
                <p className="muted pad">
                  Uses Hindsight reflect to reason over your bank. Historical
                  conclusions still need evidence checks.
                </p>
                <div className="pad">
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      run("reflect", async () => {
                        const r = await api<{ text: string }>(
                          "/memories/reflect",
                          {
                            query:
                              search ||
                              "What recurring incident patterns and service relationships are supported by verified resolutions?",
                          },
                        );
                        setReflection(r.text);
                      })
                    }
                  >
                    <GitBranch size={16} />
                    Reflect on {search ? "this query" : "incident patterns"}
                  </Button>
                  {reflection && <p className="reflection">{reflection}</p>}
                </div>
              </Panel>
            </>
          ) : path === "/comparison" ? (
            <>
              <div className="feature-banner">
                <div className="feature-icon">
                  <FlaskConical size={32} />
                </div>
                <div>
                  <h2>Same incident. A different perspective.</h2>
                  <p>
                    One model, one prompt, identical evidence. Compare what
                    changes when your AI can remember.
                  </p>
                </div>
              </div>
              <Panel
                title="Configure an experiment"
                eyebrow="MEASURED RESULTS, NO INVENTED SCORES"
              >
                <div className="experiment-controls">
                  <label>
                    Incident
                    <select
                      value={selected}
                      onChange={(e) => {
                        setSelected(e.target.value);
                        const previous = items.find(
                          (i) => i.id === e.target.value,
                        )?.evaluations;
                        setEvaluation(previous?.[previous.length - 1] || null);
                      }}
                    >
                      <option value="">Select an incident</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.id} · {i.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={!selected || !!busy}
                    onClick={() =>
                      run("evaluate", async () => {
                        setEvaluation(null);
                        setEvaluation(
                          await api<Evaluation>("/evaluate", {
                            incident_id: selected,
                          }),
                        );
                      })
                    }
                  >
                    <Play size={15} />
                    Run comparison
                  </Button>
                </div>
                <p className="small muted pad">
                  Temperature 0 · Sequential runs · Actual end-to-end duration
                  includes memory retrieval · Repeated runs may vary
                </p>
              </Panel>
              {evaluation ? (
                <>
                  <div className="comparison-grid">
                    {(["off", "on"] as const).map((mode) => (
                      <Panel
                        key={mode}
                        title={"Memory " + mode.toUpperCase()}
                        action={
                          <Badge
                            value={mode === "on" ? "enabled" : "disabled"}
                          />
                        }
                      >
                        <div className="comparison-metrics">
                          <div>
                            <strong>
                              {(evaluation[mode].duration_ms / 1000).toFixed(2)}
                              s
                            </strong>
                            <small>Duration</small>
                          </div>
                          <div>
                            <strong>{evaluation[mode].memories.length}</strong>
                            <small>Recalled facts</small>
                          </div>
                          <div>
                            <strong>
                              {evaluation[mode].exact_root_cause_rank || "—"}
                            </strong>
                            <small>Exact cause rank</small>
                          </div>
                        </div>
                        <Diagnosis result={evaluation[mode]} />
                      </Panel>
                    ))}
                  </div>
                  <Panel
                    title="Reviewer assessment"
                    eyebrow="HUMAN OBSERVATIONS · NO AUTOMATED QUALITY SCORE"
                  >
                    {evaluation.review && (
                      <div className="pad notice">
                        <div>
                          {(["off", "on"] as const).map((mode) => (
                            <p key={mode}>
                              Memory {mode.toUpperCase()}: correct cause rank{" "}
                              {evaluation.review![mode].correct_cause_rank ||
                                "not identified"}{" "}
                              · correct fix{" "}
                              {evaluation.review![mode].correct_fix_identified
                                ? "identified"
                                : "not identified"}{" "}
                              · explanation{" "}
                              {evaluation.review![mode].explanation_quality}
                            </p>
                          ))}
                          <p>{evaluation.review.notes}</p>
                          <small>{date(evaluation.review.timestamp)}</small>
                        </div>
                      </div>
                    )}
                    <form
                      key={evaluation.id}
                      className="form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        const assessment = (mode: string) => ({
                          correct_cause_rank: form.get(mode + "_rank")
                            ? Number(form.get(mode + "_rank"))
                            : null,
                          correct_fix_identified:
                            form.get(mode + "_fix") === "yes",
                          explanation_quality: form.get(mode + "_quality"),
                        });
                        run("review", async () => {
                          setEvaluation(
                            await api<Evaluation>(
                              "/incidents/" +
                                evaluation.incident_id +
                                "/evaluations/" +
                                evaluation.id +
                                "/review",
                              {
                                off: assessment("off"),
                                on: assessment("on"),
                                notes: form.get("notes"),
                              },
                            ),
                          );
                          setSuccess(
                            "Reviewer observations saved with the comparison.",
                          );
                        });
                      }}
                    >
                      <div className="comparison-grid">
                        {(["off", "on"] as const).map((mode) => (
                          <div className="review-fields" key={mode}>
                            <h3>Memory {mode.toUpperCase()}</h3>
                            <label>
                              Correct root-cause rank
                              <select
                                name={mode + "_rank"}
                                defaultValue={
                                  evaluation.review?.[mode]
                                    .correct_cause_rank || ""
                                }
                              >
                                <option value="">Not identified</option>
                                {evaluation[mode].root_causes.map((c, i) => (
                                  <option value={i + 1} key={i}>
                                    {i + 1} · {c.cause}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Correct fix identified
                              <select
                                name={mode + "_fix"}
                                defaultValue={
                                  evaluation.review?.[mode]
                                    .correct_fix_identified
                                    ? "yes"
                                    : "no"
                                }
                              >
                                <option value="no">No</option>
                                <option value="yes">Yes</option>
                              </select>
                            </label>
                            <label>
                              Explanation quality
                              <select
                                name={mode + "_quality"}
                                defaultValue={
                                  evaluation.review?.[mode]
                                    .explanation_quality || ""
                                }
                                required
                              >
                                <option value="" disabled>
                                  Assess the evidence
                                </option>
                                <option value="poor">
                                  Poor · unsupported or contradictory
                                </option>
                                <option value="adequate">
                                  Adequate · some supporting evidence
                                </option>
                                <option value="strong">
                                  Strong · evidence and limitations clear
                                </option>
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>
                      <label>
                        Assessment notes
                        <textarea
                          name="notes"
                          required
                          minLength={3}
                          defaultValue={evaluation.review?.notes || ""}
                          placeholder="Explain how each diagnosis and fix compares with the known cause and evidence."
                        />
                      </label>
                      <Button disabled={!!busy} type="submit">
                        Save reviewer assessment
                      </Button>
                    </form>
                  </Panel>
                  <div className="notice">
                    <ShieldCheck size={18} />
                    <div>
                      <p>{evaluation.scoring}</p>
                      <p>
                        Expected simulator cause:{" "}
                        {evaluation.expected_root_cause ||
                          "Manual incident; no simulator answer key"}
                      </p>
                      <p>
                        Correct solution identified: OFF{" "}
                        {evaluation.off.correct_solution_identified
                          ? "exact cause and fix match"
                          : "requires reviewer assessment"}{" "}
                        · ON{" "}
                        {evaluation.on.correct_solution_identified
                          ? "exact cause and fix match"
                          : "requires reviewer assessment"}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <Empty title="Let the evidence make the case.">
                  Resolve and retain a first incident, then compare a recurring
                  incident with memory OFF and ON.
                </Empty>
              )}
            </>
          ) : path === "/settings" ? (
            <div className="settings-grid">
              <Panel
                title="Provider configuration"
                eyebrow="SERVER-SIDE ENVIRONMENT"
              >
                <div className="settings-rows">
                  <div>
                    <span>LLM provider</span>
                    <Badge
                      value={
                        health?.llm_configured ? "configured" : "unconfigured"
                      }
                    />
                  </div>
                  <div>
                    <span>Model</span>
                    <code>{health?.model || "—"}</code>
                  </div>
                  <div>
                    <span>Hindsight</span>
                    <Badge
                      value={
                        health?.hindsight_configured
                          ? "configured"
                          : "unconfigured"
                      }
                    />
                  </div>
                  <div>
                    <span>Memory bank</span>
                    <code>{health?.bank || "—"}</code>
                  </div>
                  <div>
                    <span>Database</span>
                    <Badge value={health ? "connected" : "unavailable"} />
                  </div>
                </div>
                <p className="small muted pad">
                  Configured indicates an environment value is present. Live
                  connections are verified only when an operation succeeds. API
                  keys stay on the backend.
                </p>
              </Panel>
              <Panel title="Connect your intelligence">
                <div className="pad instructions">
                  <h3>01 / Configure the backend</h3>
                  <p>
                    Copy .env.example to .env. Set LLM_API_KEY, LLM_BASE_URL,
                    LLM_MODEL, HINDSIGHT_URL, and your bank ID.
                  </p>
                  <h3>02 / Provision the memory bank</h3>
                  <p>
                    Run python -m backend.memory.setup_bank after starting
                    Hindsight. Use a dedicated bank for this demo.
                  </p>
                  <h3>03 / Restart and verify</h3>
                  <p>
                    Restart the backend, investigate a simulated incident,
                    verify its fix, and save learning. Visit the Memory Explorer
                    to recall it.
                  </p>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => run("refresh", refresh)}
                  >
                    <RefreshCw size={14} />
                    Refresh configuration status
                  </Button>
                </div>
              </Panel>
            </div>
          ) : (
            <Empty title="Incident not found">
              Return to the incidents page and select an existing record.
            </Empty>
          )}
          <footer>
            <span>
              <BrainCircuit size={13} /> J76 INCIDENTMIND
            </span>
            <span>Built to learn. Designed to remember.</span>
            <span>HackwithHyderabad 3.0</span>
          </footer>
        </div>
      </main>
      <dialog
        ref={simulatorRef}
        className="simulator-dialog"
        onCancel={() => setShowSimulator(false)}
        aria-labelledby="sim-title"
      >
        <section className="modal">
          <div className="panel-head">
            <div>
              <div className="eyebrow cyan">ISOLATED TEST ENVIRONMENT</div>
              <h2 id="sim-title">Trigger a simulated incident</h2>
            </div>
            <Button
              variant="ghost"
              aria-label="Close simulator"
              onClick={() => setShowSimulator(false)}
            >
              ×
            </Button>
          </div>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              simulate();
            }}
          >
            <p className="muted">
              Generate synthetic logs and a known answer key. All failures stay
              inside the simulator.
            </p>
            <label>
              Failure scenario
              <select
                autoFocus
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
              />{" "}
              Recurring variant (different image symptoms)
            </label>
            <Button type="submit" disabled={!!busy}>
              <Zap size={15} />
              Generate incident
            </Button>
          </form>
        </section>
      </dialog>
    </div>
  );
}
