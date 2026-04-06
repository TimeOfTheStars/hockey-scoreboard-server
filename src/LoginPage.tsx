import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginRequest } from "./api";
import "./App.css";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await loginRequest(user, pass);
      nav(next, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app page page-login">
      <div className="login-card card-elevated">
        <div className="login-card__accent" aria-hidden />
        <div className="login-card__header">
          <span className="login-card__badge">HS</span>
          <div>
            <h1 className="login-card__title">Вход</h1>
            <p className="muted small login-card__subtitle">
              Панель и пульт — после входа. Чтение Host по URL{" "}
              <code className="url-inline">…/vmix</code> без cookie; правки табло и
              список матчей — с авторизацией (у операторов — только назначенные сеансы).
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="login-form">
          <label>
            Логин
            <input
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              required
            />
          </label>
          {err && <div className="error-banner">{err}</div>}
          <button type="submit" className="btn-primary btn-primary--wide" disabled={busy}>
            {busy ? "Вход…" : "Войти"}
          </button>
          <p className="muted small login-card__footer">
            <Link className="inline-link" to="/">
              К списку сеансов
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
