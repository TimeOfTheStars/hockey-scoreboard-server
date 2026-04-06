"""HTTP smoke test: lifespan + DB + auth (Starlette TestClient)."""

from __future__ import annotations

from starlette.testclient import TestClient


def test_login_and_session_flow(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "db.sqlite"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "secret")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)

    from hockey_server.config import Settings
    from hockey_server.main import build_app

    app = build_app(Settings())
    with TestClient(app) as client:
        r = client.post("/api/auth/login", json={"username": "admin", "password": "secret"})
        assert r.status_code == 200, r.text
        client.cookies.update(r.cookies)
        r2 = client.post("/api/sessions", json={"name": "m"})
        assert r2.status_code == 200, r2.text
        sid = r2.json()["id"]
        pub = client.get(f"/api/sessions/{sid}/vmix")
        assert pub.status_code == 200
        assert pub.json()["Timer"] == "20:00"
        r3 = client.patch(f"/api/sessions/{sid}/state", json={"ScoreA": 3})
        assert r3.status_code == 200, r3.text
        assert r3.json()["ScoreA"] == 3


def test_operator_only_assigned_sessions(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "db.sqlite"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "secret")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)

    from hockey_server.config import Settings
    from hockey_server.main import build_app

    app = build_app(Settings())
    with TestClient(app) as client:
        r = client.post("/api/auth/login", json={"username": "admin", "password": "secret"})
        assert r.status_code == 200
        client.cookies.update(r.cookies)

        m1 = client.post("/api/sessions", json={"name": "match1"})
        m2 = client.post("/api/sessions", json={"name": "match2"})
        assert m1.status_code == 200 and m2.status_code == 200
        id1, id2 = m1.json()["id"], m2.json()["id"]

        u = client.post(
            "/api/users",
            json={"username": "op", "password": "opsecret", "role": "operator"},
        )
        assert u.status_code == 200, u.text
        op_id = u.json()["id"]

        assert (
            client.put(f"/api/users/{op_id}/sessions", json={"session_ids": [id1]}).status_code
            == 200
        )

        client.post("/api/auth/logout")
        r_op = client.post(
            "/api/auth/login", json={"username": "op", "password": "opsecret"}
        )
        assert r_op.status_code == 200
        client.cookies.update(r_op.cookies)

        assert client.post("/api/sessions", json={"name": "x"}).status_code == 403

        listed = client.get("/api/sessions")
        assert listed.status_code == 200
        ids = {row["id"] for row in listed.json()}
        assert ids == {id1}

        assert client.get(f"/api/sessions/{id1}/state").status_code == 200
        assert client.get(f"/api/sessions/{id2}/state").status_code == 200
        client.cookies.clear()
        assert client.get(f"/api/sessions/{id1}/vmix").status_code == 200
