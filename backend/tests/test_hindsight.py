"""SDK contract tests are isolated; live test requires explicit opt-in and real server."""

import json
import os
from uuid import uuid4

import pytest

from backend.config import settings
from backend.memory.hindsight import Memory
from simulator.scenarios import simulate


class Result:
    results = []
    text = "Patterns supported by incident history"


class Fake:
    calls = []

    def __init__(self, **kw):
        self.kw = kw

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def recall(self, **kw):
        self.calls.append(("recall", kw))
        return Result()

    def reflect(self, **kw):
        self.calls.append(("reflect", kw))
        return Result()

    def retain(self, **kw):
        self.calls.append(("retain", kw))
        return {"success": True}


def test_sdk_contract(monkeypatch):
    monkeypatch.setattr(settings, "hindsight_url", "http://example.test")
    monkeypatch.setattr("backend.memory.hindsight.Hindsight", Fake)
    Fake.calls = []
    m = Memory()
    i = simulate("images")
    r = dict(
        revision=1,
        root_cause=i["expected_root_cause"],
        successful_fix=i["expected_fix"],
        failed_attempts=[],
        verification="Synthetic request succeeded",
        lessons_learned="Validate origin",
    )
    m.retain(i, r)
    assert m.recall("images") == []
    assert m.reflect("patterns")
    call = Fake.calls[0][1]
    data = json.loads(call["content"])
    assert call["retain_async"] is False and call["document_id"].endswith(
        "resolution-1"
    )
    assert (
        data["verification_status"] == "developer_verified"
        and data["logs"]
        and data["environment"]
    )


@pytest.mark.skipif(
    os.getenv("RUN_LIVE_HINDSIGHT") != "1",
    reason="Requires real Hindsight endpoint and credentials; no local fallback",
)
def test_live_retain_recall_across_client_recreation(monkeypatch):
    from hindsight_client import Hindsight

    from backend.config import Settings

    live = Settings()
    url = live.hindsight_url
    key = live.hindsight_api_key or None
    assert url, "Set HINDSIGHT_URL in .env or environment for live integration testing"
    bank = "j76-integration-" + uuid4().hex[:10]
    marker = "J76 persistence probe " + uuid4().hex
    with Hindsight(base_url=url, api_key=key, timeout=180) as c:
        c.create_bank(bank_id=bank, name="IncidentMind integration test")
        c.retain(
            bank_id=bank,
            content=marker + " verified R2 configuration fixed images",
            retain_async=False,
        )
    # Fresh client proves server-side persistence, not an in-process cache.
    with Hindsight(base_url=url, api_key=key, timeout=180) as c:
        results = c.recall(bank_id=bank, query=marker)
        assert results.results
        assert c.reflect(bank_id=bank, query="Which fix restored images?").text
    print("Test bank retained for inspection:", bank)
