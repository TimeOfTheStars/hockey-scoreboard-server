/** Снимок табло для внешнего API (имена ключей как в §3). */
export type GameState = {
  TournamentTitle: string;
  SeriesInfo: string;
  BrandingImage: string;
  TeamA: string;
  TeamAFull: string;
  TeamB: string;
  TeamBFull: string;
  penalty_a: string;
  penalty_b: string;
  ScoreA: number;
  ScoreB: number;
  ShotsA: number;
  ShotsB: number;
  logo_a: string;
  logo_b: string;
  Timer: string;
  /** Запомненная длина периода для «Сброс» на пульте (сервер: `sync_timer_baseline`). */
  TimerBaseline: string;
  PowerPlayTimer: string;
  PowerPlayActive: boolean;
  Period: number;
  Running: boolean;
  Visible: boolean;
};

/** Как в Rust `GameState::default().timer` — сброс таймера на пульте. */
export const DEFAULT_TIMER_MMSS = "20:00";

/** Совпадает с дефолтами в Rust `GameState::default`. */
export const RUST_DEFAULT_GAME_STATE: GameState = {
  TournamentTitle: "Регулярный турнир по хоккею с шайбой",
  SeriesInfo: "",
  BrandingImage: "",
  TeamA: "A",
  TeamAFull: "Team A",
  TeamB: "B",
  TeamBFull: "Team B",
  penalty_a: "None",
  penalty_b: "None",
  ScoreA: 0,
  ScoreB: 0,
  ShotsA: 0,
  ShotsB: 0,
  logo_a: "team-a.png",
  logo_b: "team-b.png",
  Timer: DEFAULT_TIMER_MMSS,
  TimerBaseline: DEFAULT_TIMER_MMSS,
  PowerPlayTimer: "02:00",
  PowerPlayActive: false,
  Period: 1,
  Running: false,
  Visible: true,
};

/** `15` или `5` → `15:00` / `5:00` для полей MM:SS. */
export function normalizeMmSsLike(v: string): string {
  const t = v.trim();
  if (!t) return t;
  if (/^\d{1,3}$/.test(t)) return `${t}:00`;
  return t;
}

function pickStr(r: Record<string, unknown>, key: string, fallback: string): string {
  const v = r[key];
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function pickNum(r: Record<string, unknown>, key: string, fallback: number): number {
  const v = r[key];
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function pickBool(r: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = r[key];
  if (typeof v === "boolean") return v;
  return fallback;
}

/**
 * После JSON.parse все ключи гарантированно есть — иначе автосохранение могло
 * не отправлять часть полей (`JSON.stringify` опускает undefined).
 */
export function coerceGameState(raw: unknown): GameState {
  const r =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = RUST_DEFAULT_GAME_STATE;
  return {
    TournamentTitle: pickStr(r, "TournamentTitle", d.TournamentTitle),
    SeriesInfo: pickStr(r, "SeriesInfo", d.SeriesInfo),
    BrandingImage: pickStr(r, "BrandingImage", d.BrandingImage),
    TeamA: pickStr(r, "TeamA", d.TeamA),
    TeamAFull: pickStr(r, "TeamAFull", d.TeamAFull),
    TeamB: pickStr(r, "TeamB", d.TeamB),
    TeamBFull: pickStr(r, "TeamBFull", d.TeamBFull),
    penalty_a: pickStr(r, "penalty_a", d.penalty_a),
    penalty_b: pickStr(r, "penalty_b", d.penalty_b),
    ScoreA: pickNum(r, "ScoreA", d.ScoreA),
    ScoreB: pickNum(r, "ScoreB", d.ScoreB),
    ShotsA: pickNum(r, "ShotsA", d.ShotsA),
    ShotsB: pickNum(r, "ShotsB", d.ShotsB),
    logo_a: pickStr(r, "logo_a", d.logo_a),
    logo_b: pickStr(r, "logo_b", d.logo_b),
    Timer: pickStr(r, "Timer", d.Timer),
    TimerBaseline: pickStr(r, "TimerBaseline", d.TimerBaseline),
    PowerPlayTimer: pickStr(r, "PowerPlayTimer", d.PowerPlayTimer),
    PowerPlayActive: pickBool(r, "PowerPlayActive", d.PowerPlayActive),
    Period: pickNum(r, "Period", d.Period),
    Running: pickBool(r, "Running", d.Running),
    Visible: pickBool(r, "Visible", d.Visible),
  };
}

/** Явный объект для PATCH — все ключи всегда в теле запроса. */
export function gameStateToPatchJson(s: GameState): Record<string, unknown> {
  const timer = normalizeMmSsLike(s.Timer);
  const baseline = normalizeMmSsLike(s.TimerBaseline);
  return {
    TournamentTitle: s.TournamentTitle,
    SeriesInfo: s.SeriesInfo,
    BrandingImage: s.BrandingImage,
    TeamA: s.TeamA,
    TeamAFull: s.TeamAFull,
    TeamB: s.TeamB,
    TeamBFull: s.TeamBFull,
    penalty_a: s.penalty_a,
    penalty_b: s.penalty_b,
    ScoreA: s.ScoreA,
    ScoreB: s.ScoreB,
    ShotsA: s.ShotsA,
    ShotsB: s.ShotsB,
    logo_a: s.logo_a,
    logo_b: s.logo_b,
    Timer: timer || RUST_DEFAULT_GAME_STATE.Timer,
    TimerBaseline: baseline || RUST_DEFAULT_GAME_STATE.TimerBaseline,
    PowerPlayTimer: s.PowerPlayTimer,
    PowerPlayActive: s.PowerPlayActive,
    Period: s.Period,
    Running: s.Running,
    Visible: s.Visible,
  };
}
