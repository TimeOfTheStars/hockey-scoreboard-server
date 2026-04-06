use serde::{Deserialize, Serialize};

/// Соответствует полям §3 external_api (имена ключей в JSON — как в контракте).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GameState {
    #[serde(rename = "TournamentTitle")]
    pub tournament_title: String,
    #[serde(rename = "SeriesInfo")]
    pub series_info: String,
    #[serde(rename = "BrandingImage")]
    pub branding_image: String,
    #[serde(rename = "TeamA")]
    pub team_a: String,
    #[serde(rename = "TeamAFull")]
    pub team_a_full: String,
    #[serde(rename = "TeamB")]
    pub team_b: String,
    #[serde(rename = "TeamBFull")]
    pub team_b_full: String,
    #[serde(rename = "penalty_a")]
    pub penalty_a: String,
    #[serde(rename = "penalty_b")]
    pub penalty_b: String,
    #[serde(rename = "ScoreA")]
    pub score_a: i64,
    #[serde(rename = "ScoreB")]
    pub score_b: i64,
    #[serde(rename = "ShotsA")]
    pub shots_a: i64,
    #[serde(rename = "ShotsB")]
    pub shots_b: i64,
    #[serde(rename = "logo_a")]
    pub logo_a: String,
    #[serde(rename = "logo_b")]
    pub logo_b: String,
    #[serde(rename = "Timer")]
    pub timer: String,
    /// Длина периода для кнопки «Сброс» на пульте (не тикает; обновляется правилами `sync_timer_baseline`).
    #[serde(rename = "TimerBaseline", default = "default_timer_baseline")]
    pub timer_baseline: String,
    #[serde(rename = "PowerPlayTimer")]
    pub power_play_timer: String,
    #[serde(rename = "PowerPlayActive")]
    pub power_play_active: bool,
    #[serde(rename = "Period")]
    pub period: i64,
    #[serde(rename = "Running")]
    pub running: bool,
    #[serde(rename = "Visible")]
    pub visible: bool,
}

fn default_timer_baseline() -> String {
    "20:00".to_string()
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            tournament_title: "Регулярный турнир по хоккею с шайбой".to_string(),
            series_info: String::new(),
            branding_image: String::new(),
            team_a: "A".to_string(),
            team_a_full: "Team A".to_string(),
            team_b: "B".to_string(),
            team_b_full: "Team B".to_string(),
            penalty_a: "None".to_string(),
            penalty_b: "None".to_string(),
            score_a: 0,
            score_b: 0,
            shots_a: 0,
            shots_b: 0,
            logo_a: "team-a.png".to_string(),
            logo_b: "team-b.png".to_string(),
            timer: "20:00".to_string(),
            timer_baseline: default_timer_baseline(),
            power_play_timer: "02:00".to_string(),
            power_play_active: false,
            period: 1,
            running: false,
            visible: true,
        }
    }
}

/// Разбор строки `MM:SS` (минуты могут быть любой длины). Возвращает общее число секунд.
pub fn parse_mmss(s: &str) -> Option<u32> {
    let s = s.trim();
    let mut parts = s.split(':');
    let mm: u32 = parts.next()?.parse().ok()?;
    let ss: u32 = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    if ss >= 60 {
        return None;
    }
    Some(mm.saturating_mul(60).saturating_add(ss))
}

pub fn format_mmss(total_secs: u32) -> String {
    let mm = total_secs / 60;
    let ss = total_secs % 60;
    format!("{mm:02}:{ss:02}")
}

/// Минус одна секунда основного таймера. При `00:00` выключает `running`.
fn tick_main_timer(gs: &mut GameState) {
    let Some(t) = parse_mmss(&gs.timer) else {
        return;
    };
    if t == 0 {
        gs.running = false;
        return;
    }
    let nt = t - 1;
    gs.timer = format_mmss(nt);
    if nt == 0 {
        gs.running = false;
    }
}

/// Таймер большинства — только если идёт игра и активен PP.
fn tick_power_play(gs: &mut GameState) {
    let Some(t) = parse_mmss(&gs.power_play_timer) else {
        return;
    };
    if t == 0 {
        gs.power_play_active = false;
        return;
    }
    let nt = t - 1;
    gs.power_play_timer = format_mmss(nt);
    if nt == 0 {
        gs.power_play_active = false;
    }
}

/// Вызывается раз в секунду из фоновой задачи Tokio.
pub fn tick_timers(gs: &mut GameState) {
    if !gs.running {
        return;
    }
    tick_main_timer(gs);
    if gs.running && gs.power_play_active {
        tick_power_play(gs);
    }
}

/// Поверхностное слияние JSON-объекта патча поверх сериализованного текущего состояния.
pub fn merge_patch(base: &GameState, patch: &serde_json::Value) -> Result<GameState, String> {
    let patch_obj = patch
        .as_object()
        .ok_or_else(|| "тело PATCH должно быть JSON-объектом".to_string())?;
    let mut base_val =
        serde_json::to_value(base).map_err(|e| format!("serialize base: {e}"))?;
    let base_map = base_val
        .as_object_mut()
        .ok_or_else(|| "внутренняя ошибка: состояние не объект".to_string())?;
    for (k, v) in patch_obj {
        base_map.insert(k.clone(), v.clone());
    }
    serde_json::from_value(base_val).map_err(|e| format!("merge result: {e}"))
}

/// База для «Сброс» на пульте: при старте = длина периода; на паузе при смене `Timer` = новое значение; после «Стоп» не затираем базу остатком времени.
pub fn sync_timer_baseline(prev: &GameState, next: &mut GameState) {
    if next.running {
        if !prev.running {
            next.timer_baseline = next.timer.clone();
        }
        return;
    }
    if prev.running && !next.running {
        return;
    }
    if prev.timer != next.timer {
        next.timer_baseline = next.timer.clone();
    }
}

pub fn merge_patch_and_sync(prev: &GameState, patch: &serde_json::Value) -> Result<GameState, String> {
    let mut merged = merge_patch(prev, patch)?;
    sync_timer_baseline(prev, &mut merged);
    Ok(merged)
}
