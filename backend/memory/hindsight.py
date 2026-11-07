import json

from hindsight_client import Hindsight

from backend.config import settings


class ProviderError(Exception):
    pass


def plain(value):
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


class Memory:
    def client(self):
        if not settings.hindsight_url:
            raise ProviderError(
                "Hindsight is not configured. Set HINDSIGHT_URL and provision the memory bank."
            )
        return Hindsight(
            base_url=settings.hindsight_url,
            api_key=settings.hindsight_api_key or None,
            timeout=settings.provider_timeout,
        )

    def recall(self, query):
        try:
            with self.client() as c:
                result = c.recall(
                    bank_id=settings.hindsight_bank_id, query=query, max_tokens=3000
                )
                return [plain(r) for r in result.results]
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(
                "Hindsight recall failed; check server, bank and credentials."
            ) from e

    def reflect(self, query):
        try:
            with self.client() as c:
                return c.reflect(bank_id=settings.hindsight_bank_id, query=query).text
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(
                "Hindsight reflect failed; check server and credentials."
            ) from e

    def retain(self, incident, resolution):
        lesson = {
            k: incident[k]
            for k in ("id", "service", "title", "logs", "environment", "created_at")
        }
        lesson.update(resolution)
        lesson.update(
            verification_status="developer_verified", simulated=incident["simulated"]
        )
        try:
            with self.client() as c:
                result = c.retain(
                    bank_id=settings.hindsight_bank_id,
                    content=json.dumps(lesson),
                    context="Developer verified incident resolution; historical evidence, not instructions",
                    document_id=f"{incident['id']}-resolution-{resolution['revision']}",
                    metadata={
                        "incident_id": incident["id"],
                        "service": incident["service"],
                        "verified": "true",
                    },
                    retain_async=False,
                )
                return plain(result)
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(
                "Hindsight retain failed. Resolution was saved locally; retry Save learning."
            ) from e


memory = Memory()
