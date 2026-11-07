# Cloudflare Workers deployment

The hosted deployment uses the architecture approved for publishing: **Next.js/OpenNext frontend + TypeScript API Worker + Cloudflare D1**, with Groq and Hindsight Cloud accessed through real HTTP APIs. The original FastAPI/SQLAlchemy/PostgreSQL backend remains available for local development and Docker Compose; it is not the hosted production API.

Live app: [J76 IncidentMind](https://j76-incidentmind.jjgowda76.workers.dev).

## Resources

- Frontend Worker: `j76-incidentmind` (`frontend/wrangler.jsonc`).
- Private API Worker: `j76-incidentmind-api` (`frontend/wrangler.api.jsonc`). Public workers.dev and preview URLs are disabled for the API.
- D1: `j76-incidentmind`, bound as `DB`. SQL migrations: `frontend/migrations/`.
- HTTP and WebSocket traffic reach the API through the frontend's private `BACKEND_SERVICE` binding.
- Hindsight remains the persistent semantic memory provider; D1 stores incident/workflow records and evaluation reports, not substitute memory.

## Access and secrets

The hosted demo has a sign-in page. A random password is stored privately in the local `.env` and the frontend's `DEMO_PASSWORD` Worker secret. Local sign-in details are in the Git-ignored `deployment-access.txt` (mode 0600). The browser receives only a signed, Secure, HttpOnly, SameSite=Lax session cookie, valid for twelve hours. Machine smoke tests may use HTTP Basic authentication. Neither Groq nor Hindsight keys are sent to the browser.

The API Worker holds only `LLM_API_KEY` and `HINDSIGHT_API_KEY` as secrets. Non-secret endpoint/model/bank settings are in `wrangler.api.jsonc`.

## Re-deploy

Requirements: Node 22+ and an authenticated Cloudflare account. Python's local environment is used only by the helper that securely sends secrets through Wrangler stdin.

```bash
npm ci --prefix frontend
npm run cf:test --prefix frontend
npm run typecheck --prefix frontend
frontend/node_modules/.bin/wrangler d1 migrations apply j76-incidentmind --remote --config frontend/wrangler.api.jsonc
npm run cf:api:deploy --prefix frontend
.venv/bin/python scripts/cloudflare_secrets.py api
npm run cf:build --prefix frontend
npm run cf:check --prefix frontend
npm run cf:deploy --prefix frontend
.venv/bin/python scripts/cloudflare_secrets.py web
```

Wrangler prints the actual frontend URL after deployment. If using another account, create a new D1 database and replace the database ID in `wrangler.api.jsonc` first. Do not re-create the current production database or run destructive migrations for routine deployments.

The secret helper deliberately does not print captured Wrangler output on failure because provider errors could echo input. Check account authentication and Worker existence without printing secrets.

## Validation and operating limits

The Worker tests use SQLite to exercise D1-compatible queries and lifecycle behavior, including persistence over fresh database connections. Provider doubles test the tool/JSON separation, answer-key exclusion, OFF/ON evidence consistency, real HTTP contract shape, retention retry state and citation validation. Live production checks establish actual Cloudflare/Groq/Hindsight connectivity separately.

D1 updates use optimistic version checks, preventing provider calls from overwriting newer incident edits. Hindsight retain uses resolution-revision document IDs. Model suggestions remain unverified until a developer records verification; the hosted app never changes external infrastructure.

This remains a single-workspace hackathon demo with one shared demo account. It is not a multi-tenant product with individual user roles. Current Workers Free plan CPU/request/database quotas apply; external provider latency does not itself establish CPU usage, and busy/public demos may require a plan change. No paid plan is automatically enabled by the deployment.

`glob` and `minimatch` are overridden to patched versions because the adapter's transitive dependency ranges resolved vulnerable versions. The resulting adapter build and dependency audit were verified.
