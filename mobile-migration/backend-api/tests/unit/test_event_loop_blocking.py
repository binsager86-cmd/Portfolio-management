"""Portfolio endpoints must not block the event loop.

A handler declared `async def` that does synchronous DB / network work freezes the
whole server while it runs: every other request (the Score tab included) waits
behind it. Handlers without an `await` must be plain `def`, which FastAPI runs in a
threadpool.
"""

import ast
import asyncio
import time
from pathlib import Path

import httpx
import pytest

from app.main import app

APP_DIR = Path(__file__).resolve().parents[2] / "app"
PORTFOLIO_MODULES = [APP_DIR / "api" / "portfolio.py", APP_DIR / "api" / "v1" / "portfolio.py"]
SLOW_SECONDS = 0.8


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.parametrize("path", PORTFOLIO_MODULES, ids=lambda p: str(p.relative_to(APP_DIR)))
def test_no_async_handler_without_await(path):
    tree = ast.parse(path.read_text())
    offenders = []
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.decorator_list:
            awaits = any(isinstance(n, (ast.Await, ast.AsyncFor, ast.AsyncWith)) for n in ast.walk(node))
            if not awaits:
                offenders.append(node.name)
    assert not offenders, f"async handlers that never await block the event loop: {offenders}"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "module, path",
    [
        ("app.api.portfolio", "/api/portfolio/overview"),
        ("app.api.v1.portfolio", "/api/v1/portfolio/overview"),
    ],
)
async def test_slow_overview_does_not_delay_other_requests(monkeypatch, module, path):
    import importlib

    from app.api.deps import get_current_user as v1_user
    from app.core.security import TokenData
    from app.services.auth_service import get_current_user as legacy_user

    mod = importlib.import_module(module)
    monkeypatch.setattr(mod, "get_complete_overview", lambda *_a, **_k: (time.sleep(SLOW_SECONDS), {})[1])
    user = TokenData(user_id=1, username="t")
    app.dependency_overrides[v1_user] = lambda: user
    app.dependency_overrides[legacy_user] = lambda: user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            slow = asyncio.create_task(client.get(path))
            await asyncio.sleep(0.1)  # let the slow request start running
            t0 = time.perf_counter()
            cheap = await client.get("/docs")
            cheap_s = time.perf_counter() - t0
            slow_resp = await slow
        assert slow_resp.status_code == 200
        assert cheap.status_code == 200
        assert cheap_s < SLOW_SECONDS / 2, f"cheap request waited {cheap_s:.2f}s behind the slow handler"
    finally:
        app.dependency_overrides.pop(v1_user, None)
        app.dependency_overrides.pop(legacy_user, None)
