import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createUser,
  deleteUser,
  fetchSessions,
  listUsers,
  logoutRequest,
  putUserSessions,
  type SessionRow,
  type UserRow,
} from "./api";
import { useAuth } from "./AuthContext";
import "./App.css";

export default function AdminUsers() {
  const nav = useNavigate();
  const { me, refresh: refreshAuth } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "operator">("operator");

  const accessDraft = useMemo(() => {
    const m = new Map<number, Set<string>>();
    if (!users) return m;
    for (const u of users) {
      m.set(u.id, new Set(u.session_ids));
    }
    return m;
  }, [users]);

  const [draft, setDraft] = useState<Map<number, Set<string>>>(new Map());

  useEffect(() => {
    if (!users) return;
    const next = new Map<number, Set<string>>();
    for (const u of users) {
      next.set(u.id, new Set(u.session_ids));
    }
    setDraft(next);
  }, [users]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [ul, sl] = await Promise.all([listUsers(), fetchSessions()]);
      setUsers(ul);
      setSessions(sl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "401") {
        nav(`/login?next=${encodeURIComponent("/admin/users")}`, {
          replace: true,
        });
        return;
      }
      if (msg === "403") {
        nav("/", { replace: true });
        return;
      }
      setErr(msg);
      setUsers([]);
    }
  }, [nav]);

  useEffect(() => {
    if (me === undefined) return;
    if (!me || me.role !== "admin") {
      nav("/", { replace: true });
      return;
    }
    void load();
  }, [me, nav, load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await createUser(newName.trim(), newPass, newRole);
      setNewName("");
      setNewPass("");
      setNewRole("operator");
      await load();
      await refreshAuth();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number, username: string) {
    if (!confirm(`Удалить пользователя «${username}»?`)) return;
    setErr(null);
    try {
      await deleteUser(id);
      await load();
      await refreshAuth();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function toggleSession(uid: number, sid: string) {
    setDraft((prev) => {
      const m = new Map(prev);
      const set = new Set(m.get(uid) ?? []);
      if (set.has(sid)) set.delete(sid);
      else set.add(sid);
      m.set(uid, set);
      return m;
    });
  }

  async function saveAccess(uid: number) {
    setErr(null);
    setBusy(true);
    try {
      const set = draft.get(uid) ?? new Set();
      await putUserSessions(uid, [...set]);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function draftDirty(u: UserRow): boolean {
    if (u.role !== "operator") return false;
    const a = accessDraft.get(u.id);
    const b = draft.get(u.id);
    if (!a || !b) return false;
    if (a.size !== b.size) return true;
    for (const x of a) if (!b.has(x)) return true;
    return false;
  }

  async function onLogout() {
    await logoutRequest();
    nav("/login", { replace: true });
  }

  if (me === undefined || (me && me.role === "admin" && users === null)) {
    return (
      <div className="app page page-sessions">
        <p className="muted state-loading">Загрузка…</p>
      </div>
    );
  }

  if (!me || me.role !== "admin") {
    return null;
  }

  return (
    <div className="app page page-sessions">
      <header className="page-hero">
        <div className="page-hero__row">
          <div>
            <p className="page-hero__eyebrow">Hockey Scoreboard</p>
            <h1 className="page-hero__title">Пользователи</h1>
            <p className="muted page-hero__lead">
              Создание и удаление учётных записей. Для операторов укажите, к
              каким матчам (сеансам) есть доступ.
            </p>
          </div>
          <div className="page-hero__actions">
            <Link className="btn-secondary" to="/">
              К сеансам
            </Link>
            <button
              type="button"
              className="btn-outline"
              onClick={() => void onLogout()}
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      {err && <div className="error-banner">{err}</div>}

      <section className="session-create card-elevated">
        <h2 className="session-create__title">Новый пользователь</h2>
        <form onSubmit={onCreate} className="inline-form admin-user-form">
          <input
            className="input-grow"
            placeholder="Логин"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            disabled={busy}
          />
          <input
            className="input-grow"
            type="password"
            placeholder="Пароль"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            required
            disabled={busy}
          />
          <select
            className="select-input"
            value={newRole}
            onChange={(e) =>
              setNewRole(e.target.value as "admin" | "operator")
            }
            disabled={busy}
            aria-label="Роль нового пользователя"
          >
            <option value="operator">Оператор</option>
            <option value="admin">Администратор</option>
          </select>
          <button type="submit" className="btn-primary" disabled={busy}>
            Создать
          </button>
        </form>
      </section>

      {users && users.length === 0 ? (
        <p className="muted state-empty">Пользователей нет.</p>
      ) : (
        <ul className="session-list">
          {users?.map((u) => (
            <li key={u.id} className="session-card card-elevated">
              <div className="session-card__head">
                <div>
                  <h3 className="session-card__title">{u.username}</h3>
                  <p className="muted">
                    Роль:{" "}
                    {u.role === "admin" ? "администратор" : "оператор"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-chip btn-chip--danger"
                  onClick={() => void onDelete(u.id, u.username)}
                  disabled={busy || u.id === me.id}
                >
                  Удалить
                </button>
              </div>
              {u.role === "operator" && (
                <div className="admin-access-block">
                  <p className="muted admin-access-hint">
                    Доступ к матчам (сеансам):
                  </p>
                  {sessions.length === 0 ? (
                    <p className="muted">
                      Нет сеансов — сначала создайте их на главной странице.
                    </p>
                  ) : (
                    <ul className="admin-session-checks">
                      {sessions.map((s) => (
                        <li key={s.id}>
                          <label className="admin-check-label">
                            <input
                              type="checkbox"
                              checked={
                                draft.get(u.id)?.has(s.id) ?? false
                              }
                              onChange={() => toggleSession(u.id, s.id)}
                              disabled={busy}
                            />
                            <span>
                              {s.name || "Без названия"}{" "}
                              <code className="session-card__id">{s.id}</code>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="btn-primary admin-save-access"
                    disabled={busy || !draftDirty(u)}
                    onClick={() => void saveAccess(u.id)}
                  >
                    Сохранить доступ
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
