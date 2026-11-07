"""Explicit setup command; never silently creates a bank during investigation."""

from backend.config import settings
from backend.memory.hindsight import memory

if __name__ == "__main__":
    with memory.client() as client:
        client.create_bank(bank_id=settings.hindsight_bank_id, name="J76 IncidentMind")
    print(
        "Memory bank provisioned. Existing bank errors can be ignored after checking its identity."
    )
