mod game_state;
mod server;

use game_state::{merge_patch, tick_timers, GameState};
use server::{try_bind, HttpState, PREFERRED_HTTP_PORT};
use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tokio::sync::RwLock;

pub struct AppState {
    pub game: Arc<RwLock<GameState>>,
    pub http_port: u16,
}

#[tauri::command]
async fn get_game_state(state: tauri::State<'_, AppState>) -> Result<GameState, String> {
    Ok(state.game.read().await.clone())
}

#[tauri::command]
async fn patch_game_state(
    state: tauri::State<'_, AppState>,
    patch: serde_json::Value,
) -> Result<GameState, String> {
    let mut w = state.game.write().await;
    let current = (*w).clone();
    let merged = merge_patch(&current, &patch)?;
    *w = merged;
    Ok((*w).clone())
}

#[tauri::command]
async fn reset_game_state(state: tauri::State<'_, AppState>) -> Result<GameState, String> {
    let mut w = state.game.write().await;
    *w = GameState::default();
    Ok((*w).clone())
}

#[tauri::command]
fn get_external_api_url(state: tauri::State<'_, AppState>) -> String {
    format!("http://127.0.0.1:{}/api/vmix", state.http_port)
}

#[tauri::command]
fn get_http_base_url(state: tauri::State<'_, AppState>) -> String {
    format!("http://127.0.0.1:{}", state.http_port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let game = Arc::new(RwLock::new(GameState::default()));

            let (listener, port) = tauri::async_runtime::block_on(try_bind(PREFERRED_HTTP_PORT))
                .map_err(|e| format!("TCP bind: {e}"))?;

            let app_state = AppState {
                game: game.clone(),
                http_port: port,
            };
            app.manage(app_state);

            let game_clock = game.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    let mut w = game_clock.write().await;
                    tick_timers(&mut w);
                }
            });

            let http = HttpState { game };
            tauri::async_runtime::spawn(async move {
                server::serve(listener, http).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_game_state,
            patch_game_state,
            reset_game_state,
            get_external_api_url,
            get_http_base_url
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::Exit = event {
                // axum завершится вместе с процессом
            }
        });
}
