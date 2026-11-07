import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.memory.hindsight import ProviderError
from backend.models.database import init_db
from backend.routers.api import metrics, router


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="J76 IncidentMind", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(ProviderError)
async def provider_error(request: Request, exc: ProviderError):
    return JSONResponse(
        status_code=503, content={"detail": str(exc), "code": "provider_unavailable"}
    )


app.include_router(router)


@app.websocket("/ws/events")
async def events(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            snapshot = await asyncio.to_thread(metrics)
            await ws.send_json({"type": "metrics", "data": snapshot})
            await asyncio.sleep(2)
    except (WebSocketDisconnect, RuntimeError):
        pass
