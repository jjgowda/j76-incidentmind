from datetime import datetime, timezone
from uuid import uuid4

SCENARIOS = {
    "images": (
        "Product images unavailable",
        "media-gateway",
        "high",
        "Incorrect Cloudflare R2 public bucket configuration",
        "Enable the R2 public bucket endpoint and update the asset origin",
        [
            "GET /products/42/image.webp 403",
            "asset proxy: upstream AccessDenied",
            "deployment: ASSET_ORIGIN changed; cache MISS",
        ],
    ),
    "database": (
        "Database connection failure",
        "orders-db",
        "critical",
        "Database connection pool exhausted",
        "Release leaked connections and bound the connection pool",
        [
            "sqlalchemy QueuePool limit reached",
            "checkout timeout after 30s",
            "active connections 100/100",
        ],
    ),
    "http500": (
        "Checkout API returns HTTP 500",
        "checkout-api",
        "critical",
        "Missing checkout tax configuration",
        "Restore TAX_REGION and validate deployment configuration",
        [
            "POST /checkout 500",
            "ValueError: TAX_REGION is missing",
            "deployment config revision changed",
        ],
    ),
    "auth": (
        "Authentication token expired",
        "identity-service",
        "high",
        "Expired JWT signing session",
        "Refresh the session token and verify clock synchronization",
        [
            "GET /account 401",
            "JWT validation: exp claim in past",
            "refresh session required",
        ],
    ),
    "memory": (
        "Server memory exhaustion",
        "worker-service",
        "critical",
        "Unbounded job queue retaining payloads",
        "Bound the queue and release completed job payloads",
        [
            "container OOMKilled exit=137",
            "RSS 2048MiB / limit 2048MiB",
            "pending payload queue increasing",
        ],
    ),
    "rate_limit": (
        "Upstream API rate limiting",
        "integration-api",
        "high",
        "Upstream quota exceeded without request backoff",
        "Apply exponential backoff and honor Retry-After",
        [
            "GET /partner/catalog 429",
            "Retry-After: 60",
            "retry loop issued 1200 requests/min",
        ],
    ),
}


def simulate(scenario: str, recurring: bool = False):
    title, service, severity, cause, fix, logs = SCENARIOS[scenario]
    if scenario == "images" and recurring:
        title = "Catalogue thumbnails disappear after deployment"
        logs = [
            "GET /thumbnail/87.avif 502",
            "image transformer: origin fetch forbidden",
            "new asset hostname deployed; origin status 403",
        ]
    now = datetime.now(timezone.utc).isoformat()
    return dict(
        id="INC-" + uuid4().hex[:8].upper(),
        title=title,
        service=service,
        severity=severity,
        scenario=scenario,
        simulated=True,
        environment="isolated-simulator",
        status="active",
        created_at=now,
        logs=[dict(timestamp=now, level="ERROR", message=x) for x in logs],
        service_info={
            "environment": "isolated-simulator",
            "deployment": "synthetic-2026.11",
            "service": service,
        },
        expected_root_cause=cause,
        expected_fix=fix,
        investigations=[],
        resolutions=[],
        history=[
            dict(timestamp=now, status="active", note="Simulated incident created")
        ],
        memory_status="not_saved",
    )
