import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchGameState,
  fetchSessions,
  patchGameState,
  postResetGameState,
  resolveApiBase,
  sessionVmixUrl,
} from "./api";
import {
  gameStateToPatchJson,
  normalizeMmSsLike,
  SERVER_DEFAULT_GAME_STATE,
  type GameState,
} from "./gameState";
import "./App.css";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export type AppVariant = "full" | "mobile";

function buildEmptyState(): GameState {
  return {
    ...SERVER_DEFAULT_GAME_STATE,
    Timer: "",
    TimerBaseline: "",
  };
}

export default function App({ variant }: { variant: AppVariant }) {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const nav = useNavigate();
  const [state, setState] = useState<GameState>(buildEmptyState);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [vmixUrl, setVmixUrl] = useState("");
  const [httpBase, setHttpBase] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutosave = useRef(true);
  const fromServer = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        await fetchSessions();
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.message === "401") {
          nav(
            `/login?next=${encodeURIComponent(
              variant === "mobile"
                ? `/mobile/${sessionId}`
                : `/editor/${sessionId}`,
            )}`,
            { replace: true },
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, nav, variant]);

  const redirectIfUnauthorized = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "401" || msg.includes("login required")) {
        nav(
          `/login?next=${encodeURIComponent(
            variant === "mobile"
              ? `/mobile/${sessionId}`
              : `/editor/${sessionId}`,
          )}`,
          { replace: true },
        );
        return true;
      }
      return false;
    },
    [nav, sessionId, variant],
  );

  const flushPatch = useCallback(
    async (next: GameState) => {
      if (!sessionId) return;
      setSaveStatus("saving");
      setLastError(null);
      try {
        const g = await patchGameState(sessionId, gameStateToPatchJson(next));
        fromServer.current = true;
        setState(g);
        setSaveStatus("saved");
      } catch (e) {
        if (redirectIfUnauthorized(e)) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "403" || msg.includes("no access")) {
          setSaveStatus("error");
          setLastError("Нет доступа к этому сеансу.");
          return;
        }
        setSaveStatus("error");
        setLastError(msg);
      }
    },
    [sessionId, redirectIfUnauthorized],
  );

  const schedulePatch = useCallback(
    (next: GameState) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void flushPatch(next);
      }, 160);
    },
    [flushPatch],
  );

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const base = await resolveApiBase();
        const g = await fetchGameState(sessionId);
        if (cancelled) return;
        setState(g);
        setHttpBase(base);
        setVmixUrl(sessionVmixUrl(base, sessionId));
        setHydrated(true);
        skipAutosave.current = true;
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "403") {
            nav("/", { replace: true, state: { sessionAccessDenied: true } });
            return;
          }
          setLastError(msg);
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, nav]);

  /**
   * На /mobile периодически подтягиваем состояние с сервера.
   * При идущем таймере — каждую секунду; в полной панели — только пока Running.
   */
  useEffect(() => {
    if (!hydrated) return;
    if (variant === "full" && !state.Running) return;

    const poll = () => {
      void fetchGameState(sessionId)
        .then((g) => {
          fromServer.current = true;
          setState(g);
        })
        .catch(() => {});
    };
    poll();
    const intervalMs =
      variant === "mobile" && !state.Running ? 2000 : 1000;
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [state.Running, hydrated, variant, sessionId]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    if (fromServer.current) {
      fromServer.current = false;
      return;
    }
    schedulePatch(state);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated, schedulePatch]);

  async function applyQuickPatch(patch: Partial<GameState>) {
    if (!sessionId) return;
    setSaveStatus("saving");
    setLastError(null);
    try {
      const g = await patchGameState(sessionId, patch);
      fromServer.current = true;
      setState(g);
      setSaveStatus("saved");
    } catch (e) {
      if (redirectIfUnauthorized(e)) return;
      setSaveStatus("error");
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }

  async function reset() {
    if (!sessionId) return;
    try {
      const g = await postResetGameState(sessionId);
      fromServer.current = true;
      setState(g);
      setSaveStatus("saved");
      setLastError(null);
    } catch (e) {
      if (!redirectIfUnauthorized(e)) {
        setLastError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  function update<K extends keyof GameState>(key: K, value: GameState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  if (!sessionId) {
    return (
      <div className="app page">
        <div className="error-banner">Не указан сеанс в URL.</div>
        <p className="muted">
          <Link className="inline-link" to="/">
            К списку сеансов
          </Link>
        </p>
      </div>
    );
  }

  const controlDeck = (
      <section className="control-deck" aria-label="Пульт управления">
        <h2 className="deck-title">Пульт</h2>

        <div className="deck-block">
          <h3>Таймер</h3>
          <p className="deck-hint">
            Текущее время: <strong>{state.Timer}</strong>
            {state.Running
              ? " — секунды убывают на сервере (видно и в OBS при опросе API)."
              : " — нажмите «Старт»."}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="big-btn big-btn-go"
              onClick={() => void applyQuickPatch({ Running: true })}
            >
              Старт
            </button>
            <button
              type="button"
              className="big-btn big-btn-stop"
              onClick={() => void applyQuickPatch({ Running: false })}
            >
              Стоп
            </button>
            <button
              type="button"
              className="big-btn"
              onClick={() => {
                const s = stateRef.current;
                const t =
                  normalizeMmSsLike(s.TimerBaseline).trim() ||
                  normalizeMmSsLike(s.Timer).trim() ||
                  "20:00";
                void applyQuickPatch({
                  Timer: t,
                  Running: false,
                });
              }}
            >
              Сброс (
              {normalizeMmSsLike(state.TimerBaseline).trim() || "…"})
            </button>
          </div>
        </div>

        <div className="deck-block deck-scores">
          <h3>Счёт {state.FieldCount === 1 ? "(поле А)" : ""}</h3>
          <p className="deck-hint muted small">
            Хозяева (H) · гости (G)
            {state.FieldCount === 2 ? " · два поля на табло" : ""}
          </p>
          {state.FieldCount === 2 ? (
            <p className="deck-hint muted small">Поле А</p>
          ) : null}
          <div className="score-pair">
            <span className="team-tag">{state.TeamHA || "HA"}</span>
            <span className="score-readout">{state.ScoreHA}</span>
            <div className="btn-pair">
              <button
                type="button"
                className="big-btn big-btn-minus"
                onClick={() => {
                  const s = stateRef.current;
                  void applyQuickPatch({
                    ScoreHA: Math.max(0, s.ScoreHA - 1),
                  });
                }}
              >
                −1
              </button>
              <button
                type="button"
                className="big-btn big-btn-plus"
                onClick={() => {
                  const s = stateRef.current;
                  void applyQuickPatch({ ScoreHA: s.ScoreHA + 1 });
                }}
              >
                +1
              </button>
            </div>
          </div>
          <div className="score-pair">
            <span className="team-tag">{state.TeamGA || "GA"}</span>
            <span className="score-readout">{state.ScoreGA}</span>
            <div className="btn-pair">
              <button
                type="button"
                className="big-btn big-btn-minus"
                onClick={() => {
                  const s = stateRef.current;
                  void applyQuickPatch({
                    ScoreGA: Math.max(0, s.ScoreGA - 1),
                  });
                }}
              >
                −1
              </button>
              <button
                type="button"
                className="big-btn big-btn-plus"
                onClick={() => {
                  const s = stateRef.current;
                  void applyQuickPatch({ ScoreGA: s.ScoreGA + 1 });
                }}
              >
                +1
              </button>
            </div>
          </div>
          {state.FieldCount === 2 ? (
            <>
              <p className="deck-hint muted small">Поле Б</p>
              <div className="score-pair">
                <span className="team-tag">{state.TeamHB || "HB"}</span>
                <span className="score-readout">{state.ScoreHB}</span>
                <div className="btn-pair">
                  <button
                    type="button"
                    className="big-btn big-btn-minus"
                    onClick={() => {
                      const s = stateRef.current;
                      void applyQuickPatch({
                        ScoreHB: Math.max(0, s.ScoreHB - 1),
                      });
                    }}
                  >
                    −1
                  </button>
                  <button
                    type="button"
                    className="big-btn big-btn-plus"
                    onClick={() => {
                      const s = stateRef.current;
                      void applyQuickPatch({ ScoreHB: s.ScoreHB + 1 });
                    }}
                  >
                    +1
                  </button>
                </div>
              </div>
              <div className="score-pair">
                <span className="team-tag">{state.TeamGB || "GB"}</span>
                <span className="score-readout">{state.ScoreGB}</span>
                <div className="btn-pair">
                  <button
                    type="button"
                    className="big-btn big-btn-minus"
                    onClick={() => {
                      const s = stateRef.current;
                      void applyQuickPatch({
                        ScoreGB: Math.max(0, s.ScoreGB - 1),
                      });
                    }}
                  >
                    −1
                  </button>
                  <button
                    type="button"
                    className="big-btn big-btn-plus"
                    onClick={() => {
                      const s = stateRef.current;
                      void applyQuickPatch({ ScoreGB: s.ScoreGB + 1 });
                    }}
                  >
                    +1
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="deck-block">
          <h3>Период</h3>
          <p className="deck-hint">Сейчас: {state.Period}</p>
          <div className="btn-row">
            <button
              type="button"
              className="big-btn big-btn-minus"
              onClick={() => {
                const s = stateRef.current;
                void applyQuickPatch({
                  Period: Math.max(1, s.Period - 1),
                });
              }}
            >
              −1
            </button>
            <button
              type="button"
              className="big-btn big-btn-plus"
              onClick={() => {
                const s = stateRef.current;
                void applyQuickPatch({ Period: s.Period + 1 });
              }}
            >
              +1
            </button>
          </div>
        </div>

        <div className="deck-block">
          <h3>Броски (все поля)</h3>
          <div className="subs-grid">
            <div className="subs-item">
              <span className="subs-label">Хозяева (H)</span>
              <span className="subs-val">{state.ShotsH}</span>
              <div className="btn-pair">
                <button
                  type="button"
                  className="touch-mini"
                  onClick={() => {
                    const s = stateRef.current;
                    void applyQuickPatch({
                      ShotsH: Math.max(0, s.ShotsH - 1),
                    });
                  }}
                >
                  −
                </button>
                <button
                  type="button"
                  className="touch-mini"
                  onClick={() => {
                    const s = stateRef.current;
                    void applyQuickPatch({ ShotsH: s.ShotsH + 1 });
                  }}
                >
                  +
                </button>
              </div>
            </div>
            <div className="subs-item">
              <span className="subs-label">Гости (G)</span>
              <span className="subs-val">{state.ShotsG}</span>
              <div className="btn-pair">
                <button
                  type="button"
                  className="touch-mini"
                  onClick={() => {
                    const s = stateRef.current;
                    void applyQuickPatch({
                      ShotsG: Math.max(0, s.ShotsG - 1),
                    });
                  }}
                >
                  −
                </button>
                <button
                  type="button"
                  className="touch-mini"
                  onClick={() => {
                    const s = stateRef.current;
                    void applyQuickPatch({ ShotsG: s.ShotsG + 1 });
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="deck-block">
          <h3>Большинство</h3>
          <button
            type="button"
            className={`big-btn pp-wide ${state.PowerPlayActive ? "active-toggle" : ""}`}
            onClick={() => {
              const s = stateRef.current;
              void applyQuickPatch({ PowerPlayActive: !s.PowerPlayActive });
            }}
          >
            Power play: {state.PowerPlayActive ? "вкл" : "выкл"}
          </button>
        </div>

        <div className="deck-block">
          <h3>Табло</h3>
          <button
            type="button"
            className="big-btn pp-wide"
            onClick={() => {
              const s = stateRef.current;
              void applyQuickPatch({ Visible: !s.Visible });
            }}
          >
            {state.Visible ? "Скрыть табло" : "Показать табло"}
          </button>
        </div>
      </section>
  );

  return (
    <div
      className={`app ${variant === "full" ? "app--panel" : ""} ${variant === "mobile" ? "app--mobile" : ""}`}
    >
      {variant === "full" ? (
        <header className="header panel-header">
          <div className="panel-header__brand">
            <span className="panel-header__badge" aria-hidden>
              HS
            </span>
            <div>
              <h1>Панель управления</h1>
              <p className="muted panel-header__subtitle">
                Сеанс · внешний API для Hockey Desktop Host
              </p>
            </div>
          </div>
          <p className="muted panel-header__hint">
            Вставьте в Host этот URL (опрос ~каждые 800 мс). Ответ — JSON-массив
            из одного объекта (формат арены).
          </p>
          <div className="url-row">
            <code className="url url--prominent">{vmixUrl || "…"}</code>
          </div>
          <nav className="panel-header__nav muted small">
            <Link className="nav-pill" to="/">
              Все сеансы
            </Link>
            <Link className="nav-pill nav-pill--accent" to={`/mobile/${sessionId}`}>
              Пульт на телефон
            </Link>
            {httpBase ? (
              <span className="panel-header__muted">
                Полный URL пульта:{" "}
                <code className="url-inline">
                  {httpBase}/mobile/{sessionId}
                </code>
              </span>
            ) : null}
          </nav>
        </header>
      ) : (
        <header className="header header--mobile">
          <h1>Пульт</h1>
          <p className="muted small">
            <Link className="inline-link" to={`/editor/${sessionId}`}>
              Полная панель
            </Link>
            {" · "}
            <Link className="inline-link" to="/">
              Сеансы
            </Link>
          </p>
        </header>
      )}

      {variant === "mobile" ? controlDeck : null}

      {variant === "full" ? (
        <>
          <section className="toolbar panel-toolbar">
            <button type="button" className="btn-ghost" onClick={() => void reset()}>
              Сброс полей к значениям по умолчанию
            </button>
            <span className={`save-badge save-badge--${saveStatus}`}>
              {saveStatus === "idle" && "Готово к редактированию"}
              {saveStatus === "saving" && "Сохранение…"}
              {saveStatus === "saved" && "Сохранено"}
              {saveStatus === "error" && "Ошибка сохранения"}
            </span>
          </section>

          {lastError && <div className="error-banner">{lastError}</div>}

          <main className="grid panel-grid">
        <fieldset className="form-card">
          <legend>Общее</legend>
          <label>
            FieldCount
            <select
              className="select-input"
              value={state.FieldCount}
              onChange={(e) =>
                update("FieldCount", Number(e.target.value) === 1 ? 1 : 2)
              }
            >
              <option value={2}>2 — два поля (А и Б)</option>
              <option value={1}>1 — только поле А</option>
            </select>
          </label>
          <p className="field-hint">
            При одном поле в API для поля Б всегда отдаются «None» / нули; на
            сервере поле Б сбрасывается автоматически.
          </p>
          <label>
            TournamentTitle
            <input
              value={state.TournamentTitle}
              onChange={(e) => update("TournamentTitle", e.target.value)}
            />
          </label>
          <label>
            SeriesInfo
            <input
              value={state.SeriesInfo}
              onChange={(e) => update("SeriesInfo", e.target.value)}
            />
          </label>
          <label>
            BrandingImage
            <input
              value={state.BrandingImage}
              onChange={(e) => update("BrandingImage", e.target.value)}
            />
          </label>
          <label>
            logoLeagues (URL лиги)
            <input
              value={state.logoLeagues}
              onChange={(e) => update("logoLeagues", e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="form-card">
          <legend>Поле А (HA / GA)</legend>
          <label>
            TeamHA
            <input
              value={state.TeamHA}
              onChange={(e) => update("TeamHA", e.target.value)}
            />
          </label>
          <label>
            TeamHAFull
            <input
              value={state.TeamHAFull}
              onChange={(e) => update("TeamHAFull", e.target.value)}
            />
          </label>
          <label>
            TeamGA
            <input
              value={state.TeamGA}
              onChange={(e) => update("TeamGA", e.target.value)}
            />
          </label>
          <label>
            TeamGAFull
            <input
              value={state.TeamGAFull}
              onChange={(e) => update("TeamGAFull", e.target.value)}
            />
          </label>
          <label>
            LogoHA
            <input
              value={state.LogoHA}
              onChange={(e) => update("LogoHA", e.target.value)}
            />
          </label>
          <label>
            LogoGA
            <input
              value={state.LogoGA}
              onChange={(e) => update("LogoGA", e.target.value)}
            />
          </label>
          <label>
            ScoreHA
            <input
              type="number"
              value={state.ScoreHA}
              onChange={(e) =>
                update("ScoreHA", Number.parseInt(e.target.value || "0", 10))
              }
            />
          </label>
          <label>
            ScoreGA
            <input
              type="number"
              value={state.ScoreGA}
              onChange={(e) =>
                update("ScoreGA", Number.parseInt(e.target.value || "0", 10))
              }
            />
          </label>
        </fieldset>

        {state.FieldCount === 2 ? (
          <fieldset className="form-card">
            <legend>Поле Б (HB / GB)</legend>
            <label>
              TeamHB
              <input
                value={state.TeamHB}
                onChange={(e) => update("TeamHB", e.target.value)}
              />
            </label>
            <label>
              TeamHBFull
              <input
                value={state.TeamHBFull}
                onChange={(e) => update("TeamHBFull", e.target.value)}
              />
            </label>
            <label>
              TeamGB
              <input
                value={state.TeamGB}
                onChange={(e) => update("TeamGB", e.target.value)}
              />
            </label>
            <label>
              TeamGBFull
              <input
                value={state.TeamGBFull}
                onChange={(e) => update("TeamGBFull", e.target.value)}
              />
            </label>
            <label>
              LogoHB
              <input
                value={state.LogoHB}
                onChange={(e) => update("LogoHB", e.target.value)}
              />
            </label>
            <label>
              LogoGB
              <input
                value={state.LogoGB}
                onChange={(e) => update("LogoGB", e.target.value)}
              />
            </label>
            <label>
              ScoreHB
              <input
                type="number"
                value={state.ScoreHB}
                onChange={(e) =>
                  update("ScoreHB", Number.parseInt(e.target.value || "0", 10))
                }
              />
            </label>
            <label>
              ScoreGB
              <input
                type="number"
                value={state.ScoreGB}
                onChange={(e) =>
                  update("ScoreGB", Number.parseInt(e.target.value || "0", 10))
                }
              />
            </label>
          </fieldset>
        ) : null}

        <fieldset className="form-card">
          <legend>Броски и период</legend>
          <label>
            ShotsH
            <input
              type="number"
              value={state.ShotsH}
              onChange={(e) =>
                update("ShotsH", Number.parseInt(e.target.value || "0", 10))
              }
            />
          </label>
          <label>
            ShotsG
            <input
              type="number"
              value={state.ShotsG}
              onChange={(e) =>
                update("ShotsG", Number.parseInt(e.target.value || "0", 10))
              }
            />
          </label>
          <label>
            Period
            <input
              type="number"
              value={state.Period}
              onChange={(e) =>
                update("Period", Number.parseInt(e.target.value || "0", 10))
              }
            />
          </label>
        </fieldset>

        <fieldset className="form-card">
          <legend>Штрафы и таймеры</legend>
          <label>
            PenaltyH
            <input
              value={state.PenaltyH}
              onChange={(e) => update("PenaltyH", e.target.value)}
            />
          </label>
          <label>
            PenaltyG
            <input
              value={state.PenaltyG}
              onChange={(e) => update("PenaltyG", e.target.value)}
            />
          </label>
          <label>
            Timer (MM:SS)
            <input
              value={state.Timer}
              onChange={(e) => update("Timer", e.target.value)}
              onBlur={() => {
                setState((s) => ({
                  ...s,
                  Timer: normalizeMmSsLike(s.Timer),
                }));
              }}
              placeholder="20:00 или 15 → 15:00"
            />
          </label>
          <p className="field-hint">
            На паузе выставьте длительность периода в Timer — это же значение
            пойдёт в «Сброс» на пульте{" "}
            <Link to={`/mobile/${sessionId}`}>/mobile</Link> (после старта база
            фиксируется при запуске отсчёта).
          </p>
          <label>
            PowerPlayTimer (MM:SS)
            <input
              value={state.PowerPlayTimer}
              onChange={(e) => update("PowerPlayTimer", e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={state.PowerPlayActive}
              onChange={(e) => update("PowerPlayActive", e.target.checked)}
            />
            PowerPlayActive
          </label>
        </fieldset>

        <fieldset className="form-card">
          <legend>Флаги</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={state.Running}
              onChange={(e) => update("Running", e.target.checked)}
            />
            Running
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={state.Visible}
              onChange={(e) => update("Visible", e.target.checked)}
            />
            Visible
          </label>
        </fieldset>
      </main>
        </>
      ) : (
        <>
          <span className={`mobile-status status status-${saveStatus}`}>
            {saveStatus === "saving" && "Сохранение…"}
            {saveStatus === "error" && "Ошибка"}
          </span>
          {lastError && <div className="error-banner">{lastError}</div>}
        </>
      )}
    </div>
  );
}
