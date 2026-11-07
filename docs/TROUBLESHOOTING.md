# Troubleshooting and testing

**Dashboard cannot reach API:** Start FastAPI from the repository root on port 8000. Check `/api/health`. The frontend HTTP rewrite defaults to `127.0.0.1:8000`; Compose sets an internal target. Custom local values belong in `frontend/.env.local`.

**WebSocket disconnected:** Browser socket URL defaults to `ws://localhost:8000/ws/events`. Set `NEXT_PUBLIC_WS_URL` before frontend build for another host; use `wss` behind HTTPS. HTTP polling continues every ten seconds.

**LLM unavailable or invalid output:** Set the server's LLM key, URL and current model ID. The model must support function tools and JSON-object responses. Check the provider console for quota, rate limits and model availability. Timeout failures are explicit; retry after checking the provider. Keys are not returned by the API.

**Hindsight not configured / bank missing:** Set URL and key, start Hindsight, then run `python -m backend.memory.setup_bank`. Local API: 8888. Local management UI: 9999. Cloud uses your account's API endpoint. Existing-bank errors during setup should be checked rather than followed by deleting the bank.

**Recall returns no results after retain:** Check the bank ID, query and Hindsight document UI. Retain uses synchronous processing, but automatic observations may continue to consolidate. Search with the service name and known symptoms. Do not substitute hardcoded results.

**Retain failed after resolving:** The resolution remains saved and memory pending. Repair Hindsight configuration and click Save learning again. The document ID includes the resolution revision. If the API committed before a client timeout, the same document ID addresses the same source document on retry.

**Provider latency:** SDK operations have a configurable timeout; the SDK may retry requests. Increase `PROVIDER_TIMEOUT` for initial extraction. During comparison the frontend waits for both calls. The UI shows a busy state; use only one demo operator at a time.

**PostgreSQL:** Use `postgresql+psycopg://...` URLs. Local startup creates the application schema. Back up real data and introduce migrations before production changes. No destructive database reset runs at startup.

**Docker unavailable:** Install Docker Desktop to run Compose. Local SQLite covers incident workflow only, not Hindsight. Use Hindsight Cloud or separately install a supported Hindsight server for real memory. Hindsight requires its own LLM configuration and persistent storage.

**Build:** Node 22+ recommended. `npm ci --prefix frontend` then `npm run build --prefix frontend`. Turbopack needs permission to create local helper processes/ports. Python tests use an isolated temporary SQLite database.

## Test categories

Run `python -m pytest backend/tests -q` from an activated environment. Coverage includes all six simulations, recurring symptoms, validation/not-found responses, absent provider errors, successful/failed resolution transitions, retryable retention, incident persistence after engine reconnect, WebSocket metrics, same-snapshot comparison, unknown scores, tool calls, answer-key exclusion, invalid model output, timeout handling, stale/hostile memory prompt treatment, fabricated citations, and Hindsight SDK call contracts.

Live Hindsight testing is opt-in with `RUN_LIVE_HINDSIGHT=1`; it writes to a unique bank and verifies retain/recall/reflect across fresh SDK clients. It intentionally does not delete that bank. The explicit demo restart step proves persistence over actual server restarts. No live AI/Hindsight claim is warranted without configured infrastructure and successful calls.

**Python TLS certificate error on macOS:** The backend defaults to certifi's maintained root CA bundle when `SSL_CERT_FILE` is unset. If your organization requires a custom CA, explicitly export `SSL_CERT_FILE` to your trusted bundle before launching Python. Certificate verification remains enabled.

**Groq model unavailable / model_not_found:** Query your account's `/openai/v1/models` endpoint and set `LLM_MODEL` to a model supporting function calls and JSON mode. The tested project default is `openai/gpt-oss-120b`. Model access depends on the account.

**Groq rejects JSON mode with tools:** The investigator separates the read-only tool request from the final JSON response request. Preserve this separation when adding tools or changing providers.
