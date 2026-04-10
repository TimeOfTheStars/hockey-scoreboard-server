/** Состояние сеанса (ключи как в JSON API сервера). */
export type GameState = {
  FieldCount: 1 | 2;
  TournamentTitle: string;
  SeriesInfo: string;
  BrandingImage: string;
  TeamHA: string;
  TeamHAFull: string;
  TeamGA: string;
  TeamGAFull: string;
  TeamHB: string;
  TeamHBFull: string;
  TeamGB: string;
  TeamGBFull: string;
  PenaltyH: string;
  PenaltyG: string;
  ScoreHA: number;
  ScoreGA: number;
  ScoreHB: number;
  ScoreGB: number;
  ShotsH: number;
  ShotsG: number;
  LogoHA: string;
  LogoGA: string;
  LogoHB: string;
  LogoGB: string;
  logoLeagues: string;
  Timer: string;
  TimerBaseline: string;
  PowerPlayTimer: string;
  PowerPlayActive: boolean;
  Period: number;
  Running: boolean;
  Visible: boolean;
};

export const DEFAULT_TIMER_MMSS = "20:00";

export const SERVER_DEFAULT_GAME_STATE: GameState = {
  FieldCount: 2,
  TournamentTitle: "Регулярный турнир по хоккею с шайбой",
  SeriesInfo: "",
  BrandingImage: "",
  TeamHA: "A",
  TeamHAFull: "Team A",
  TeamGA: "B",
  TeamGAFull: "Team B",
  TeamHB: "C",
  TeamHBFull: "Team C",
  TeamGB: "D",
  TeamGBFull: "Team D",
  PenaltyH: "None",
  PenaltyG: "None",
  ScoreHA: 0,
  ScoreGA: 0,
  ScoreHB: 0,
  ScoreGB: 0,
  ShotsH: 0,
  ShotsG: 0,
  LogoHA: "",
  LogoGA: "",
  LogoHB: "",
  LogoGB: "",
  logoLeagues: "",
  Timer: DEFAULT_TIMER_MMSS,
  TimerBaseline: DEFAULT_TIMER_MMSS,
  PowerPlayTimer: "02:00",
  PowerPlayActive: false,
  Period: 1,
  Running: false,
  Visible: true,
};

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

function pickFieldCount(r: Record<string, unknown>): 1 | 2 {
  const v = r.FieldCount;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number.parseInt(v, 10)
        : 2;
  return n === 1 ? 1 : 2;
}

export function coerceGameState(raw: unknown): GameState {
  const r =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = SERVER_DEFAULT_GAME_STATE;

  if ("TeamHA" in r) {
    return {
      FieldCount: pickFieldCount(r),
      TournamentTitle: pickStr(r, "TournamentTitle", d.TournamentTitle),
      SeriesInfo: pickStr(r, "SeriesInfo", d.SeriesInfo),
      BrandingImage: pickStr(r, "BrandingImage", d.BrandingImage),
      TeamHA: pickStr(r, "TeamHA", d.TeamHA),
      TeamHAFull: pickStr(r, "TeamHAFull", d.TeamHAFull),
      TeamGA: pickStr(r, "TeamGA", d.TeamGA),
      TeamGAFull: pickStr(r, "TeamGAFull", d.TeamGAFull),
      TeamHB: pickStr(r, "TeamHB", d.TeamHB),
      TeamHBFull: pickStr(r, "TeamHBFull", d.TeamHBFull),
      TeamGB: pickStr(r, "TeamGB", d.TeamGB),
      TeamGBFull: pickStr(r, "TeamGBFull", d.TeamGBFull),
      PenaltyH: pickStr(r, "PenaltyH", d.PenaltyH),
      PenaltyG: pickStr(r, "PenaltyG", d.PenaltyG),
      ScoreHA: pickNum(r, "ScoreHA", d.ScoreHA),
      ScoreGA: pickNum(r, "ScoreGA", d.ScoreGA),
      ScoreHB: pickNum(r, "ScoreHB", d.ScoreHB),
      ScoreGB: pickNum(r, "ScoreGB", d.ScoreGB),
      ShotsH: pickNum(r, "ShotsH", d.ShotsH),
      ShotsG: pickNum(r, "ShotsG", d.ShotsG),
      LogoHA: pickStr(r, "LogoHA", d.LogoHA),
      LogoGA: pickStr(r, "LogoGA", d.LogoGA),
      LogoHB: pickStr(r, "LogoHB", d.LogoHB),
      LogoGB: pickStr(r, "LogoGB", d.LogoGB),
      logoLeagues: pickStr(r, "logoLeagues", d.logoLeagues),
      Timer: pickStr(r, "Timer", d.Timer),
      TimerBaseline: pickStr(r, "TimerBaseline", d.TimerBaseline),
      PowerPlayTimer: pickStr(r, "PowerPlayTimer", d.PowerPlayTimer),
      PowerPlayActive: pickBool(r, "PowerPlayActive", d.PowerPlayActive),
      Period: pickNum(r, "Period", d.Period),
      Running: pickBool(r, "Running", d.Running),
      Visible: pickBool(r, "Visible", d.Visible),
    };
  }

  return {
    FieldCount: 1,
    TournamentTitle: pickStr(r, "TournamentTitle", d.TournamentTitle),
    SeriesInfo: pickStr(r, "SeriesInfo", d.SeriesInfo),
    BrandingImage: pickStr(r, "BrandingImage", d.BrandingImage),
    TeamHA: pickStr(r, "TeamA", d.TeamHA),
    TeamHAFull: pickStr(r, "TeamAFull", d.TeamHAFull),
    TeamGA: pickStr(r, "TeamB", d.TeamGA),
    TeamGAFull: pickStr(r, "TeamBFull", d.TeamGAFull),
    TeamHB: "None",
    TeamHBFull: "",
    TeamGB: "None",
    TeamGBFull: "",
    PenaltyH: pickStr(r, "penalty_a", d.PenaltyH),
    PenaltyG: pickStr(r, "penalty_b", d.PenaltyG),
    ScoreHA: pickNum(r, "ScoreA", d.ScoreHA),
    ScoreGA: pickNum(r, "ScoreB", d.ScoreGA),
    ScoreHB: 0,
    ScoreGB: 0,
    ShotsH: pickNum(r, "ShotsA", d.ShotsH),
    ShotsG: pickNum(r, "ShotsB", d.ShotsG),
    LogoHA: pickStr(r, "logo_a", d.LogoHA),
    LogoGA: pickStr(r, "logo_b", d.LogoGA),
    LogoHB: "",
    LogoGB: "",
    logoLeagues: pickStr(r, "BrandingImage", d.logoLeagues),
    Timer: pickStr(r, "Timer", d.Timer),
    TimerBaseline: pickStr(r, "TimerBaseline", d.TimerBaseline),
    PowerPlayTimer: pickStr(r, "PowerPlayTimer", d.PowerPlayTimer),
    PowerPlayActive: pickBool(r, "PowerPlayActive", d.PowerPlayActive),
    Period: pickNum(r, "Period", d.Period),
    Running: pickBool(r, "Running", d.Running),
    Visible: pickBool(r, "Visible", d.Visible),
  };
}

export function gameStateToPatchJson(s: GameState): Record<string, unknown> {
  const timer = normalizeMmSsLike(s.Timer);
  const baseline = normalizeMmSsLike(s.TimerBaseline);
  return {
    FieldCount: s.FieldCount,
    TournamentTitle: s.TournamentTitle,
    SeriesInfo: s.SeriesInfo,
    BrandingImage: s.BrandingImage,
    TeamHA: s.TeamHA,
    TeamHAFull: s.TeamHAFull,
    TeamGA: s.TeamGA,
    TeamGAFull: s.TeamGAFull,
    TeamHB: s.TeamHB,
    TeamHBFull: s.TeamHBFull,
    TeamGB: s.TeamGB,
    TeamGBFull: s.TeamGBFull,
    PenaltyH: s.PenaltyH,
    PenaltyG: s.PenaltyG,
    ScoreHA: s.ScoreHA,
    ScoreGA: s.ScoreGA,
    ScoreHB: s.ScoreHB,
    ScoreGB: s.ScoreGB,
    ShotsH: s.ShotsH,
    ShotsG: s.ShotsG,
    LogoHA: s.LogoHA,
    LogoGA: s.LogoGA,
    LogoHB: s.LogoHB,
    LogoGB: s.LogoGB,
    logoLeagues: s.logoLeagues,
    Timer: timer || SERVER_DEFAULT_GAME_STATE.Timer,
    TimerBaseline: baseline || SERVER_DEFAULT_GAME_STATE.TimerBaseline,
    PowerPlayTimer: s.PowerPlayTimer,
    PowerPlayActive: s.PowerPlayActive,
    Period: s.Period,
    Running: s.Running,
    Visible: s.Visible,
  };
}
