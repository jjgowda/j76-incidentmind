# Architecture and memory contract

The Next.js UI uses a server-side HTTP rewrite to FastAPI and a direct WebSocket for two-second metric snapshots. HTTP data refreshes every ten seconds, including when WebSockets are unavailable. The API uses validated Pydantic requests, SQLAlchemy records, and a synchronous worker thread for provider calls. HTTP API schemas are published at `/docs` and `/openapi.json`.

## Incident lifecycle

Create an isolated simulation → collect evidence → generate unverified hypotheses → developer confirms/corrects cause and attests verification → record resolution → explicitly retain learning. Failed attempts stay active and cannot be retained. Reopening preserves status history and previous learning. A corrected resolution has a new revision and a separate Hindsight document ID; old evidence remains historical, so the agent is instructed to check contradictions.

The simulator has six deterministic failure templates and unique IDs/timestamps. Recurring image incidents change the visible symptoms. The answer key is stored with the synthetic incident for human validation and comparison scoring, but is excluded from all investigator messages and read-only tool output. Nothing is executed on production systems. Verification is a developer attestation, not an automated Cloudflare/database fix.

## Hindsight is the memory system

The official `hindsight-client` SDK speaks to an external Hindsight API. `retain` receives incident ID, service, symptoms/title, logs, environment, confirmed root cause, failed attempts, successful fix, verification evidence/status, timestamps and lessons. `retain_async=False` waits for processing. Document IDs identify a specific incident resolution revision and make retries address the same source document.

`recall` searches the configured bank with current service, title and logs. The exact returned facts and IDs are included in the LLM prompt and saved with investigation output for provenance. The explorer also displays raw returned metadata, including any relationships surfaced by Hindsight; it does not invent a relationship graph. `reflect` is an explicit explorer action for synthesizing historical patterns. It is not included in OFF/ON experiments, keeping the investigator model constant.

Incident records in PostgreSQL are workflow/audit state, not a replacement semantic memory. There is no JSON-file retrieval fallback. Failed recall stops a memory-enabled investigation; it does not silently switch memory off. Failed retain leaves the incident resolved with memory pending, so a user can retry without losing verification.

The Hindsight named volume stores its embedded PostgreSQL separately from the application PostgreSQL volume. A new application process reconnects to the same bank. Tests can verify reconnect persistence; actual server-restart persistence needs the documented live restart exercise.

## Agent boundary

The agent calls a configurable Groq-compatible chat-completions endpoint, with temperature zero and JSON output. It can call `collect_logs` and `inspect_service`. These tools only read the selected incident; tools accept no URLs, commands, filesystem paths or incident IDs. The agent uses two stages: a required read-only tool request, then a final JSON-mode diagnosis request without tools. Groq rejects combining tool calls and JSON mode in one request. Final synthesis uses a fresh conversation containing the original incident, retrieved facts and collected tool evidence, with explicit instructions that evidence collection is complete; function-call history is excluded to prevent additional tool requests in JSON mode. Pydantic validates the output; fabricated memory citations are rejected. The prompt labels logs/memories as untrusted data and asks for stale/conflicting evidence analysis. Prompt defenses are best-effort; they do not prove that every model will ignore malicious content. The agent has no production write tools.

## Comparison methodology

Both runs receive the same incident snapshot, same prompt/version, model, tool definitions, temperature, and evidence. OFF has an empty historical-memory array and never calls Hindsight. ON recalls real memories first. Runs are sequential to avoid provider concurrency throttling. Duration is measured with a monotonic clock and includes recall for ON. Timing is neither a benchmark nor a causal accuracy claim.

The report records ranked hypotheses, evidence, explanations, memory influence, recalled facts and tool trace. Exact case-insensitive cause matching provides a conservative known-cause rank for simulated incidents. No text match means *unadjudicated*. An evidence count is not an explanation-quality score. The Reviewer assessment form records the observed correct-cause rank, whether an equivalent fix was identified, and a qualitative explanation rating (poor, adequate or strong), with required supporting notes. These are explicitly developer assessments, not automatic performance statistics. Evaluation reports and assessments persist in the incident store. Selecting an incident in the lab restores its latest report.

## MVP operating limits

Single-workspace, unauthenticated, intended for local demonstration. No RBAC, automatic secret redaction, distributed job queue, schema migrations, pagination, or multi-worker concurrent-write protection. Long provider operations use request/response and display a busy state; background progress is not streamed. SQLAlchemy creates the initial schema on startup. Keep the app private, enter only synthetic evidence, and use a dedicated Hindsight bank. A public multi-user release requires authentication, tenant isolation, redaction, migrations, and transactional concurrency controls.
