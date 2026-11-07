import copy

import pytest

from backend.models.database import Incident, Session, engine
from backend.routers.api import investigator, memory
from simulator.scenarios import SCENARIOS


def incident(client, scenario="images", recurring=False):
    r = client.post(
        "/api/simulate", json={"scenario": scenario, "recurring": recurring}
    )
    assert r.status_code == 201
    return r.json()


def resolution(successful=True):
    return dict(
        root_cause="Incorrect Cloudflare R2 public bucket configuration",
        successful_fix="Enable public bucket endpoint",
        verification="Synthetic origin request returned 200",
        lessons_learned="Verify origin access before deploying assets",
        failed_attempts=["Cache purge"],
        successful=successful,
    )


def diagnosis(memory_enabled=False):
    return dict(
        root_causes=[
            dict(
                cause=resolution()["root_cause"],
                evidence=["AccessDenied"],
                checks=["Check R2 public access"],
                fix="Enable public access",
            )
        ],
        explanation="Hypothesis based on origin 403",
        memory_influence="Historical evidence compared with current logs",
        cited_memory_ids=[],
        memory_enabled=memory_enabled,
        memories=[],
        duration_ms=15,
        model="test-model",
        prompt_version="v1",
        tools=["collect_logs"],
        verified=False,
    )


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_simulator(client, scenario):
    d = incident(client, scenario)
    assert (
        d["simulated"]
        and d["logs"]
        and d["expected_root_cause"]
        and d["environment"] == "isolated-simulator"
    )
    assert client.get("/api/incidents/" + d["id"]).json()["id"] == d["id"]


def test_variant(client):
    a = incident(client)
    b = incident(client, recurring=True)
    assert (
        a["logs"] != b["logs"] and a["expected_root_cause"] == b["expected_root_cause"]
    )


def test_errors(client):
    assert client.get("/api/incidents/missing").status_code == 404
    assert client.post("/api/simulate", json={"scenario": "nope"}).status_code == 422
    assert client.post("/api/incidents", json={}).status_code == 422
    assert (
        client.post(
            "/api/incidents",
            json={
                "title": "Manual incident",
                "service": "api",
                "symptoms": "timeout on request",
            },
        ).status_code
        == 201
    )


def test_unconfigured_services_honest(client):
    d = incident(client)
    assert client.get("/api/health").json()["llm_configured"] is False
    assert (
        client.post(
            "/api/incidents/" + d["id"] + "/investigate", json={"memory_enabled": False}
        ).status_code
        == 503
    )
    assert client.get("/api/memories").status_code == 503
    assert (
        client.post(
            "/api/memories/reflect", json={"query": "What happened?"}
        ).status_code
        == 503
    )


def test_verified_cycle_and_restart_persistence(client, monkeypatch):
    d = incident(client)
    id = d["id"]
    assert client.post(f"/api/incidents/{id}/learn").status_code == 409
    assert (
        client.post(f"/api/incidents/{id}/resolve", json=resolution(False)).json()[
            "status"
        ]
        == "active"
    )
    assert client.post(f"/api/incidents/{id}/learn").status_code == 409
    assert (
        client.post(f"/api/incidents/{id}/resolve", json=resolution()).json()["status"]
        == "resolved"
    )
    assert client.post(f"/api/incidents/{id}/learn").status_code == 503
    assert client.get(f"/api/incidents/{id}").json()["memory_status"] == "pending"
    calls = []
    monkeypatch.setattr(
        memory, "retain", lambda i, r: calls.append((copy.deepcopy(i), r))
    )
    assert client.post(f"/api/incidents/{id}/learn").json()["memory_status"] == "saved"
    assert client.post(f"/api/incidents/{id}/learn").status_code == 200
    assert len(calls) == 1 and calls[0][1]["verification"]
    engine.dispose()
    with Session() as s:
        assert s.get(Incident, id).data["memory_status"] == "saved"
    assert client.post(f"/api/incidents/{id}/reopen").json()["status"] == "active"
    assert client.post(f"/api/incidents/{id}/learn").status_code == 409
    metrics = client.get("/api/metrics").json()
    assert metrics["active"] == 1


def test_investigation_and_comparison_consistency(client, monkeypatch):
    d = incident(client)
    seen = []

    def fake(i, enabled):
        seen.append((copy.deepcopy(i), enabled))
        r = diagnosis(enabled)
        if enabled:
            r["memories"] = [{"id": "past", "text": "Historical R2 incident"}]
        return r

    monkeypatch.setattr(investigator, "investigate", fake)
    r = client.post("/api/evaluate", json={"incident_id": d["id"]})
    assert r.status_code == 200
    report = r.json()
    assert seen[0][0] == seen[1][0] and [x[1] for x in seen] == [False, True]
    assert (
        report["on"]["exact_root_cause_rank"] == 1
        and report["off"]["duration_ms"] == 15
    )
    assert len(report["on"]["memories"]) == 1
    assert client.get("/api/incidents/" + d["id"]).json()["evaluations"]
    assert (
        client.post(
            "/api/incidents/" + d["id"] + "/investigate", json={"memory_enabled": True}
        ).status_code
        == 200
    )
    assert len(client.get("/api/incidents/" + d["id"]).json()["investigations"]) == 1


def test_comparison_unknown_not_invented_failure(client, monkeypatch):
    d = incident(client)

    def fake(i, e):
        r = diagnosis(e)
        r["root_causes"][0]["cause"] = "Semantically similar wording"
        return r

    monkeypatch.setattr(investigator, "investigate", fake)
    r = client.post("/api/evaluate", json={"incident_id": d["id"]}).json()
    assert r["on"]["correct_solution_identified"] is None


def test_ws(client):
    with client.websocket_connect("/ws/events") as ws:
        event = ws.receive_json()
        assert event["type"] == "metrics" and event["data"]["total"] == 0


def test_reviewer_assessment_persists_without_inventing_quality(client, monkeypatch):
    d = incident(client)
    monkeypatch.setattr(investigator, "investigate", lambda i, e: diagnosis(e))
    report = client.post("/api/evaluate", json={"incident_id": d["id"]}).json()
    assert "review" not in report
    path = f"/api/incidents/{d['id']}/evaluations/{report['id']}/review"
    observation = dict(
        correct_cause_rank=1,
        correct_fix_identified=True,
        explanation_quality="adequate",
    )
    review = dict(
        off=observation,
        on=observation,
        notes="Both explanations reference origin 403; assess fixes against the simulator key.",
    )
    saved = client.post(path, json=review)
    assert saved.status_code == 200
    assert saved.json()["review"]["method"] == "developer_assessment"
    assert (
        client.get("/api/incidents/" + d["id"]).json()["evaluations"][0]["review"][
            "notes"
        ]
        == review["notes"]
    )
    review["on"] = dict(observation, correct_cause_rank=2)
    assert client.post(path, json=review).status_code == 422
