import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  externalApiUrlFromBase,
  fetchGameState,
  patchGameState,
  postResetGameState,
  resolveApiBase,
} from "./api";
import {
  DEFAULT_TIMER_MMSS,
  gameStateToPatchJson,
  normalizeMmSsLike,
  type GameState,
} from "./gameState";
import "./App.css";

const FALLBACK_PORT_HINT = "8765";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export type AppVariant = "full" | "mobile";

function buildEmptyState(): GameState {
  return {
    TournamentTitle: "",
    SeriesInfo: "",
    BrandingImage: "",
    TeamA: "",
    TeamAFull: "",
    TeamB: "",
    TeamBFull: "",
    penalty_a: "",
    penalty_b: "",
    ScoreA: 0,
    ScoreB: 0,
    ShotsA: 0,
    ShotsB: 0,
    logo_a: "",
    logo_b: "",
    Timer: "",
    PowerPlayTimer: "",
    PowerPlayActive: false,
    Period: 0,
    Running: false,
    Visible: true,
  };
}

export default function App({ variant }: { variant: AppVariant }) {
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

  const listenPort = httpBase
    ? (() => {
        try {
          return new URL(httpBase).port || FALLBACK_PORT_HINT;
        } catch {
          return FALLBACK_PORT_HINT;
        }
      })()
    : "";

  const flushPatch = useCallback(async (next: GameState) => {
    setSaveStatus("saving");
    setLastError(null);
    try {
      const g = await patchGameState(gameStateToPatchJson(next));
      fromServer.current = true;
      setState(g);
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, []);

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
    let cancelled = false;
    (async () => {
      try {
        const base = await resolveApiBase();
        const g = await fetchGameState();
        if (cancelled) return;
        setState(g);
        setHttpBase(base);
        setVmixUrl(externalApiUrlFromBase(base));
        setHydrated(true);
        skipAutosave.current = true;
      } catch (e) {
        if (!cancelled) {
          setLastError(e instanceof Error ? e.message : String(e));
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * На /mobile периодически подтягиваем состояние с сервера.
   * При идущем таймере — каждую секунду; в полной панели — только пока Running.
   */
  useEffect(() => {
    if (!hydrated) return;
    if (variant === "full" && !state.Running) return;

    const poll = () => {
      void fetchGameState()
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
  }, [state.Running, hydrated, variant]);

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
    setSaveStatus("saving");
    setLastError(null);
    try {
      const g = await patchGameState(patch);
      fromServer.current = true;
      setState(g);
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }

  async function reset() {
    try {
      const g = await postResetGameState();
      fromServer.current = true;
      setState(g);
      setSaveStatus("saved");
      setLastError(null);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }

  function update<K extends keyof GameState>(key: K, value: GameState[K]) {
    setState((s) => ({ ...s, [key]: value }));
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
              onClick={() =>
                void applyQuickPatch({
                  Timer: DEFAULT_TIMER_MMSS,
                  Running: false,
                })
              }
            >
              Сброс ({DEFAULT_TIMER_MMSS})
            </button>
          </div>
        </div>

        <div className="deck-block deck-scores">
          <h3>Счёт</h3>
          <div className="score-pair">
            <span className="team-tag">{state.TeamA || "A"}</span>
            <span className="score-readout">{state.ScoreA}</span>
            <div className="btn-pair">
            <button
              type="button"
              className="big-btn big-btn-minus"
              onClick={() => {
                const s = stateRef.current;
                void applyQuickPatch({
                  ScoreA: Math.max(0, s.ScoreA - 1),
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
                void applyQuickPatch({ ScoreA: s.ScoreA + 1 });
              }}
            >
              +1
            </button>
            </div>
          </div>
          <div className="score-pair">
            <span className="team-tag">{state.TeamB || "B"}</span>
            <span className="score-readout">{state.ScoreB}</span>
            <div className="btn-pair">
              <button
                type="button"
                className="big-btn big-btn-minus"
              onClick={() => {
                const s = stateRef.current;
                void applyQuickPatch({
                  ScoreB: Math.max(0, s.ScoreB - 1),
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
                void applyQuickPatch({ ScoreB: s.ScoreB + 1 });
              }}
              >
                +1
              </button>
            </div>
          </div>
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
          <h3>Броски</h3>
          <div className="subs-grid">
            <div className="subs-item">
              <span className="subs-label">{state.TeamA || "A"}</span>
              <span className="subs-val">{state.ShotsA}</span>
              <div className="btn-pair">
                <button
                  type="button"
                  className="touch-mini"
                  onClick={() => {
                    const s = stateRef.current;
                    void applyQuickPatch({
                      ShotsA: Math.max(0, s.ShotsA - 1),
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
                    void applyQuickPatch({ ShotsA: s.ShotsA + 1 });
                  }}
                >
                  +
                </button>
              </div>
            </div>
            <div className="subs-item">
              <span className="subs-label">{state.TeamB || "B"}</span>
              <span className="subs-val">{state.ShotsB}</span>
              <div className="btn-pair">
                <button
                  type="button"
                  className="touch-mini"
                  onClick={() => {
                    const s = stateRef.current;
                    void applyQuickPatch({
                      ShotsB: Math.max(0, s.ShotsB - 1),
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
                    void applyQuickPatch({ ShotsB: s.ShotsB + 1 });
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
    <div className={`app ${variant === "mobile" ? "app--mobile" : ""}`}>
      {variant === "full" ? (
        <header className="header">
          <h1>Hockey Scoreboard — панель управления</h1>
          <p className="muted">
            В Hockey Desktop Host укажите URL внешнего API (на этом ПК обычно
            127.0.0.1):
          </p>
          <div className="url-row">
            <code className="url">{vmixUrl || "…"}</code>
          </div>
          <p className="muted small">
            Пульт с телефона:{" "}
            <Link className="inline-link" to="/mobile">
              /mobile
            </Link>{" "}
            — в той же Wi‑Fi:{" "}
            <code className="url-inline">
              http://&lt;IP-этого-ПК&gt;:{listenPort || FALLBACK_PORT_HINT}
              /mobile
            </code>
            . Нужен <code>npm run build</code>, затем запуск приложения.
          </p>
        </header>
      ) : (
        <header className="header header--mobile">
          <h1>Пульт</h1>
          <p className="muted small">
            <Link className="inline-link" to="/">
              Полная панель
            </Link>
          </p>
        </header>
      )}

      {variant === "mobile" ? controlDeck : null}

      {variant === "full" ? (
        <>
          <section className="toolbar">
            <button type="button" onClick={() => void reset()}>
              Сброс всех полей по умолчанию
            </button>
            <span className={`status status-${saveStatus}`}>
              {saveStatus === "idle" && "Готово"}
              {saveStatus === "saving" && "Сохранение…"}
              {saveStatus === "saved" && "Сохранено"}
              {saveStatus === "error" && "Ошибка сохранения"}
            </span>
          </section>

          {lastError && <div className="error-banner">{lastError}</div>}

          <main className="grid">
        <fieldset>
          <legend>Общее</legend>
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
        </fieldset>

        <fieldset>
          <legend>Команды</legend>
          <label>
            TeamA
            <input
              value={state.TeamA}
              onChange={(e) => update("TeamA", e.target.value)}
            />
          </label>
          <label>
            TeamAFull
            <input
              value={state.TeamAFull}
              onChange={(e) => update("TeamAFull", e.target.value)}
            />
          </label>
          <label>
            TeamB
            <input
              value={state.TeamB}
              onChange={(e) => update("TeamB", e.target.value)}
            />
          </label>
          <label>
            TeamBFull
            <input
              value={state.TeamBFull}
              onChange={(e) => update("TeamBFull", e.target.value)}
            />
          </label>
          <label>
            logo_a
            <input
              value={state.logo_a}
              onChange={(e) => update("logo_a", e.target.value)}
            />
          </label>
          <label>
            logo_b
            <input
              value={state.logo_b}
              onChange={(e) => update("logo_b", e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Счёт и броски</legend>
          <label>
            ScoreA
            <input
              type="number"
              value={state.ScoreA}
              onChange={(e) =>
                update("ScoreA", Number.parseInt(e.target.value || "0", 10))
              }
            />
          </label>
          <label>
            ScoreB
            <input
              type="number"
              value={state.ScoreB}
              onChange={(e) =>
                update("ScoreB", Number.parseInt(e.target.value || "0", 10))
              }
            />
          </label>
          <label>
            ShotsA
            <input
              type="number"
              value={state.ShotsA}
              onChange={(e) =>
                update("ShotsA", Number.parseInt(e.target.value || "0", 10))
              }
            />
          </label>
          <label>
            ShotsB
            <input
              type="number"
              value={state.ShotsB}
              onChange={(e) =>
                update("ShotsB", Number.parseInt(e.target.value || "0", 10))
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

        <fieldset>
          <legend>Штрафы / таймеры</legend>
          <label>
            penalty_a
            <input
              value={state.penalty_a}
              onChange={(e) => update("penalty_a", e.target.value)}
            />
          </label>
          <label>
            penalty_b
            <input
              value={state.penalty_b}
              onChange={(e) => update("penalty_b", e.target.value)}
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
            Один таймер для табло и оверлей. На пульте{" "}
            <Link to="/mobile">/mobile</Link> «Сброс» ставит {DEFAULT_TIMER_MMSS}{" "}
            и останавливает отсчёт.
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

        <fieldset>
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
