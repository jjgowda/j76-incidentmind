import os
import tempfile
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///" + str(
    Path(tempfile.mkdtemp(prefix="j76-tests-")) / "tests.db"
)
import pytest
from fastapi.testclient import TestClient

from backend.config import settings
from backend.main import app
from backend.models.database import Base, engine


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.setattr(settings, "hindsight_url", "")


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
