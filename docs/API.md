# API guide

Base: `http://localhost:8000`. Interactive OpenAPI: `/docs`. Pydantic validation failures are 422 with details; missing incidents are 404; invalid lifecycle transitions are 409. Provider failures are 503 with `{ "detail": "actionable message", "code": "provider_unavailable" }`. Successful endpoints return JSON; create/simulate return 201. All routes are unauthenticated for this local MVP.

| Method | Route | Purpose / request |
| --- | --- | --- |
| GET | `/api/health` | Database check, provider configuration flags (not connection claims) |
| GET | `/api/scenarios` | Six simulator choices |
| GET | `/api/incidents` | List incident records, newest first |
| POST | `/api/incidents` | Manual evidence: title, service, symptoms, optional severity |
| GET | `/api/incidents/{id}` | Evidence, investigations, resolutions, history, evaluations |
| POST | `/api/simulate` | `{ "scenario": "images", "recurring": false }` |
| POST | `/api/incidents/{id}/investigate` | `{ "memory_enabled": true }` |
| POST | `/api/incidents/{id}/resolve` | Record successful or failed verification; see below |
| POST | `/api/incidents/{id}/learn` | Retain latest successful resolution in Hindsight |
| POST | `/api/incidents/{id}/reopen` | Reopen without deleting history |
| GET | `/api/incidents/{id}/memory` | Recall real related Hindsight evidence |
| GET | `/api/memories?q=origin` | Query the Hindsight bank |
| POST | `/api/memories/reflect` | `{ "query": "What patterns recur?" }` |
| POST | `/api/evaluate` | `{ "incident_id": "INC-..." }`; actual OFF/ON runs |
| POST | `/api/incidents/{id}/evaluations/{evaluation_id}/review` | Persist developer assessments for OFF/ON: correct_cause_rank, correct_fix_identified, explanation_quality, and notes |
| GET | `/api/metrics` | Incident counts, service states, investigations, retained incidents |
| WS | `/ws/events` | `{ "type": "metrics", "data": {...} }` every two seconds |

Resolution payload:

```json
{
  "root_cause": "Incorrect Cloudflare R2 public bucket configuration",
  "successful_fix": "Enabled the correct public origin in isolated configuration",
  "verification": "Synthetic origin request now returns 200",
  "lessons_learned": "Validate asset origin access before deployments",
  "failed_attempts": ["Purged image cache"],
  "successful": true
}
```

This records the developer's verification. It executes no fix. Learning is a separate explicit call, and requires the latest resolution to be successful and the incident to remain resolved.

Scenario keys: `images`, `database`, `http500`, `auth`, `memory`, `rate_limit`.

Example:

```bash
curl -X POST http://localhost:8000/api/simulate \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"images","recurring":false}'
curl http://localhost:8000/api/incidents
```
