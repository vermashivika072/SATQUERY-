import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    from app.core.rate_limit import login_limiter

    login_limiter.reset()