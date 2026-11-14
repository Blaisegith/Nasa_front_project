"""Fixtures de test — base SQLite temporaire, client HTTP asynchrone."""

from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# La configuration doit être figée avant l'import de l'application.
_TMP_DIR = tempfile.mkdtemp(prefix="techlabs-test-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP_DIR}/test.db"
os.environ["AVATAR_DIR"] = os.path.join(_TMP_DIR, "avatars")
os.environ["BACKEND_ENV"] = "test"
os.environ["RATE_LIMIT_PER_MINUTE"] = "500"
os.environ["SESSION_COOKIE_SECURE"] = "false"

from app.core.db import Base, get_db  # noqa: E402
from app.core.ratelimit import reset_rate_limit  # noqa: E402
from app.main import app  # noqa: E402

_test_engine = create_async_engine(os.environ["DATABASE_URL"])
_TestSession = async_sessionmaker(_test_engine, expire_on_commit=False)


async def _override_get_db() -> AsyncIterator:
    async with _TestSession() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


@pytest.fixture(scope="session", autouse=True)
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture(autouse=True)
async def _prepare_database() -> AsyncIterator[None]:
    async with _test_engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    app.dependency_overrides[get_db] = _override_get_db
    reset_rate_limit()
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client


@pytest_asyncio.fixture
async def alice(client: AsyncClient) -> AsyncClient:
    response = await client.post(
        "/api/v1/auth/session",
        json={"email": "alice@example.com", "display_name": "Alice Martin"},
    )
    assert response.status_code == 201, response.text
    return client


@pytest_asyncio.fixture
async def bob() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        response = await http_client.post(
            "/api/v1/auth/session",
            json={"email": "bob@example.com", "display_name": "Bob Durand"},
        )
        assert response.status_code == 201, response.text
        yield http_client