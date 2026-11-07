from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from backend.agents.investigator import investigator
from backend.config import settings
from backend.memory.hindsight import memory
from backend.models.database import Incident, Session
from simulator.scenarios import SCENARIOS, simulate

router = APIRouter(prefix="/api")


def now():
    return datetime.now(timezone.utc).isoformat()


def get(id):
    with Session() as s:
        item = s.get(Incident, id)
        if not item:
            raise HTTPException(404, "Incident not found")
        return item.data


def save(data):
    with Session.begin() as s:
        s.merge(Incident(id=data["id"], data=data))
    return data


def all_incidents():
    with Session() as s:
        return sorted(
            [r.data for r in s.scalars(select(Incident)).all()],
            key=lambda x: x["created_at"],
            reverse=True,
        )


class Simulation(BaseModel):
    scenario: str
    recurring: bool = False


class Create(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    service: str = Field(min_length=2, max_length=100)
    symptoms: str = Field(min_length=5, max_length=10000)
    severity: str = Field(default="high", pattern="^(low|high|critical)$")


class Investigation(BaseModel):
    memory_enabled: bool = True


class Resolution(BaseModel):
    root_cause: str = Field(min_length=3, max_length=2000)
    successful_fix: str = Field(min_length=3, max_length=5000)
    verification: str = Field(min_length=3, max_length=5000)
    lessons_learned: str = Field(min_length=3, max_length=5000)
    failed_attempts: list[str] = Field(default_factory=list, max_length=30)
    successful: bool


class Evaluation(BaseModel):
    incident_id: str


@router.get("/health")
def health():
    with Session() as s:
        s.execute(select(Incident.id).limit(1))
    return dict(
        status="ok",
        database="connected",
        llm_configured=bool(settings.llm_api_key),
        hindsight_configured=bool(settings.hindsight_url),
        model=settings.llm_model,
        bank=settings.hindsight_bank_id,
        note="Configured does not mean live connection verified",
    )


@router.get("/scenarios")
def scenarios():
    return [
        dict(id=k, title=v[0], service=v[1], severity=v[2])
        for k, v in SCENARIOS.items()
    ]


@router.get("/incidents")
def listing():
    return all_incidents()


@router.post("/simulate", status_code=201)
def simulation(body: Simulation):
    if body.scenario not in SCENARIOS:
        raise HTTPException(422, "Unknown simulator scenario")
    return save(simulate(body.scenario, body.recurring))


@router.post("/incidents", status_code=201)
def create(body: Create):
    data = simulate("http500")
    data.update(
        id="INC-" + uuid4().hex[:8].upper(),
        title=body.title,
        service=body.service,
        severity=body.severity,
        simulated=False,
        scenario="manual",
        expected_root_cause=None,
        expected_fix=None,
        logs=[dict(timestamp=now(), level="ERROR", message=body.symptoms)],
        service_info={"service": body.service, "environment": "manual-evidence"},
        environment="manual-evidence",
    )
    return save(data)


@router.get("/incidents/{id}")
def detail(id: str):
    return get(id)


@router.post("/incidents/{id}/investigate")
def investigate(id: str, body: Investigation):
    data = get(id)
    result = investigator.investigate(data, body.memory_enabled)
    # Re-read after network work so simultaneous runs do not overwrite one another.
    data = get(id)
    data["investigations"].append(dict(**result, timestamp=now()))
    data["history"].append(
        dict(
            timestamp=now(),
            status=data["status"],
            note="AI investigation completed (unverified hypotheses)",
        )
    )
    save(data)
    return result


@router.post("/incidents/{id}/resolve")
def resolve(id: str, body: Resolution):
    data = get(id)
    resolution = dict(
        **body.model_dump(), timestamp=now(), revision=len(data["resolutions"]) + 1
    )
    data["resolutions"].append(resolution)
    data["status"] = "resolved" if body.successful else "active"
    data["memory_status"] = "pending" if body.successful else "not_saved"
    data["history"].append(
        dict(
            timestamp=now(),
            status=data["status"],
            note="Developer verified fix"
            if body.successful
            else "Fix unsuccessful; incident remains active",
        )
    )
    save(data)
    return data


@router.post("/incidents/{id}/learn")
def learn(id: str):
    data = get(id)
    if (
        data["status"] != "resolved"
        or not data["resolutions"]
        or not data["resolutions"][-1]["successful"]
    ):
        raise HTTPException(
            409, "Only the latest successfully verified resolution may be retained"
        )
    if data["memory_status"] == "saved":
        return data
    memory.retain(data, data["resolutions"][-1])
    data = get(id)
    data["memory_status"] = "saved"
    data["history"].append(
        dict(
            timestamp=now(),
            status=data["status"],
            note="Verified learning retained in Hindsight",
        )
    )
    return save(data)


@router.post("/incidents/{id}/reopen")
def reopen(id: str):
    data = get(id)
    data["status"] = "active"
    data["history"].append(
        dict(
            timestamp=now(),
            status="active",
            note="Reopened by developer; older learning remains historical evidence",
        )
    )
    return save(data)


@router.get("/incidents/{id}/memory")
def related(id: str):
    data = get(id)
    return dict(results=memory.recall(data["service"] + " " + data["title"]))


@router.get("/memories")
def memories(q: str = "incident resolution"):
    return dict(results=memory.recall(q[:2000] or "incident resolution"))


class Reflection(BaseModel):
    query: str = Field(min_length=3, max_length=2000)


@router.post("/memories/reflect")
def reflect(body: Reflection):
    return dict(text=memory.reflect(body.query))


@router.post("/evaluate")
def evaluate(body: Evaluation):
    data = get(body.incident_id)
    # Both runs receive the same snapshot, model, temperature, prompt and tools.
    off = investigator.investigate(data, False)
    on = investigator.investigate(data, True)
    for result in (off, on):
        expected = data.get("expected_root_cause")
        rank = next(
            (
                i + 1
                for i, c in enumerate(result["root_causes"])
                if expected
                and c["cause"].casefold().strip() == expected.casefold().strip()
            ),
            None,
        )
        fix_match = (
            any(
                c["cause"].casefold().strip() == (expected or "").casefold().strip()
                and c["fix"].casefold().strip()
                == (data.get("expected_fix") or "").casefold().strip()
                for c in result["root_causes"]
            )
            if expected
            else False
        )
        result.update(
            exact_root_cause_rank=rank,
            correct_solution_identified=True if fix_match else None,
            explanation_evidence_count=sum(
                len(c["evidence"]) for c in result["root_causes"]
            ),
        )
    report = dict(
        id=uuid4().hex,
        incident_id=data["id"],
        timestamp=now(),
        off=off,
        on=on,
        expected_root_cause=data.get("expected_root_cause"),
        scoring="Exact text match only. No match is unadjudicated, not an incorrect diagnosis. Evidence count is not an explanation-quality score. Review both explanations manually.",
    )
    data = get(data["id"])
    data.setdefault("evaluations", []).append(report)
    save(data)
    return report


@router.get("/metrics")
def metrics():
    items = all_incidents()
    services = {}
    for x in items:
        services[x["service"]] = (
            "degraded"
            if x["status"] == "active" or services.get(x["service"]) == "degraded"
            else "healthy"
        )
    return dict(
        total=len(items),
        active=sum(x["status"] == "active" for x in items),
        resolved=sum(x["status"] == "resolved" for x in items),
        critical=sum(
            x["severity"] == "critical" and x["status"] == "active" for x in items
        ),
        services=services,
        investigations=sum(len(x["investigations"]) for x in items),
        retained=sum(x["memory_status"] == "saved" for x in items),
    )


class Assessment(BaseModel):
    correct_cause_rank: int | None = Field(default=None, ge=1, le=5)
    correct_fix_identified: bool
    explanation_quality: str = Field(pattern="^(poor|adequate|strong)$")


class Review(BaseModel):
    off: Assessment
    on: Assessment
    notes: str = Field(min_length=3, max_length=5000)


@router.post("/incidents/{id}/evaluations/{evaluation_id}/review")
def review_evaluation(id: str, evaluation_id: str, body: Review):
    data = get(id)
    report = next(
        (e for e in data.get("evaluations", []) if e["id"] == evaluation_id), None
    )
    if report is None:
        raise HTTPException(404, "Evaluation not found")
    for mode in ("off", "on"):
        rank = getattr(body, mode).correct_cause_rank
        if rank and rank > len(report[mode]["root_causes"]):
            raise HTTPException(422, "Rank exceeds the returned hypotheses")
    report["review"] = dict(
        **body.model_dump(), timestamp=now(), method="developer_assessment"
    )
    save(data)
    return report
