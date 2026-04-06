import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  createSession,
  deleteSession,
  fetchSessions,
  logoutRequest,
  resolveApiBase,
  sessionVmixUrl,
  type SessionRow,
} from "./api";
import { useAuth } from "./AuthContext";
import "./App.css";

export default function SessionHome() {
  const { me } = useAuth();
  const location = useLocation();
  const [accessDeniedFlash, setAccessDeniedFlash] = useState(false);
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [base, setBase] = useState("");
  const [name, setName] = useState("");
  const nav = useNavigate();

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    const st = location.state as { sessionAccessDenied?: boolean } | undefined;
    if (st?.sessionAccessDenied) {
      setAccessDeniedFlash(true);
      nav(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, nav]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [list, b] = await Promise.all([fetchSessions(), resolveApiBase()]);
      setRows(list);
      setBase(b);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "401") {
        nav(`/login?next=${encodeURIComponent("/")}`, { replace: true });
        return;
      }
      setErr(msg);
      setRows([]);
    }
  }, [nav]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const s = await createSession(name);
      setName("");
      nav(`/editor/${s.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Удалить этот сеанс?")) return;
    setErr(null);
    try {
      await deleteSession(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function onLogout() {
    await logoutRequest();
    nav("/login", { replace: true });
  }

  return (
    <div className="app page page-sessions">
      <header className="page-hero">
        <div className="page-hero__row">
          <div>
            <p className="page-hero__eyebrow">Hockey Scoreboard</p>
            <h1 className="page-hero__title">Сеансы</h1>
            <p className="muted page-hero__lead">
              Один сеанс — один матч. Для Hockey Desktop Host скопируйте URL{" "}
              <code className="url-inline">…/api/sessions/&lt;id&gt;/vmix</code>{" "}
              из карточки.
            </p>
          </div>
          <div className="page-hero__actions">
            {isAdmin ? (
              <Link className="btn-secondary" to="/admin/users">
                Пользователи
              </Link>
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              Обновить
            </button>
            <button type="button" className="btn-outline" onClick={() => void onLogout()}>
              Выйти
            </button>
          </div>
        </div>
      </header>

      {accessDeniedFlash && (
        <div className="error-banner">
          Нет доступа к выбранному сеансу. Обратитесь к администратору, если нужны
          права на этот матч.
        </div>
      )}

      {err && <div className="error-banner">{err}</div>}

      {isAdmin ? (
        <section className="session-create card-elevated">
          <h2 className="session-create__title">Новый сеанс</h2>
          <form onSubmit={onCreate} className="inline-form">
            <input
              className="input-grow"
              placeholder="Название матча (необязательно)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn-primary">
              Создать и открыть панель
            </button>
          </form>
        </section>
      ) : null}

      {rows === null || me === undefined ? (
        <p className="muted state-loading">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="muted state-empty">
          {isAdmin
            ? "Сеансов пока нет — создайте первый выше."
            : "Нет доступных матчей. Администратор должен создать сеанс и выдать вам к нему доступ на странице «Пользователи»."}
        </p>
      ) : (
        <ul className="session-list">
          {rows.map((s) => (
            <li key={s.id} className="session-card card-elevated">
              <div className="session-card__head">
                <div>
                  <h3 className="session-card__title">{s.name || "Без названия"}</h3>
                  <code className="session-card__id">{s.id}</code>
                </div>
              </div>
              <div className="session-card__actions">
                <Link className="btn-chip" to={`/editor/${s.id}`}>
                  Панель
                </Link>
                <Link className="btn-chip btn-chip--accent" to={`/mobile/${s.id}`}>
                  Пульт
                </Link>
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn-chip btn-chip--danger"
                    onClick={() => void onDelete(s.id)}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
              {base ? (
                <div className="session-card__host">
                  <span className="session-card__host-label">URL для Host</span>
                  <code className="url url--compact">{sessionVmixUrl(base, s.id)}</code>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
