use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use crate::game_state::{merge_patch_and_sync, GameState};

pub const PREFERRED_HTTP_PORT: u16 = 8765;

#[derive(Clone)]
pub struct HttpState {
    pub game: Arc<RwLock<GameState>>,
}

/// Слушаем все интерфейсы — с телефона: `http://<IP-этого-ПК>:порт/`.
pub async fn try_bind(preferred: u16) -> std::io::Result<(TcpListener, u16)> {
    let addr = format!("0.0.0.0:{preferred}");
    match TcpListener::bind(&addr).await {
        Ok(l) => Ok((l, preferred)),
        Err(_) => {
            let l = TcpListener::bind("0.0.0.0:0").await?;
            let port = l.local_addr()?.port();
            Ok((l, port))
        }
    }
}

async fn get_vmix(State(state): State<HttpState>) -> Json<serde_json::Value> {
    let g = state.game.read().await;
    Json(serde_json::to_value(&*g).unwrap_or(serde_json::Value::Null))
}

async fn get_editor_state(State(state): State<HttpState>) -> Json<serde_json::Value> {
    let g = state.game.read().await;
    Json(serde_json::to_value(&*g).unwrap_or(serde_json::Value::Null))
}

async fn patch_editor_state(
    State(state): State<HttpState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut w = state.game.write().await;
    let merged = {
        let current = (*w).clone();
        merge_patch_and_sync(&current, &body).map_err(|_| StatusCode::BAD_REQUEST)?
    };
    *w = merged;
    serde_json::to_value(&*w)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn reset_editor_state(
    State(state): State<HttpState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut w = state.game.write().await;
    *w = GameState::default();
    serde_json::to_value(&*w)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn router(http_state: HttpState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let dist = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
    let index_path = dist.join("index.html");

    let api = Router::new()
        .route("/api/vmix", get(get_vmix))
        .route(
            "/api/editor/state",
            get(get_editor_state).patch(patch_editor_state),
        )
        .route("/api/editor/reset", post(reset_editor_state));

    if dist.is_dir() && index_path.is_file() {
        api.fallback_service(
            ServeDir::new(&dist).not_found_service(ServeFile::new(index_path)),
        )
    } else {
        eprintln!(
            "hockey-scoreboard-server: нет ../dist/index.html — для браузера выполните npm run build"
        );
        api.fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                "Соберите фронт (npm run build), чтобы открыть панель с телефона по HTTP.",
            )
        })
    }
    .layer(cors)
    .with_state(http_state)
}

pub async fn serve(listener: TcpListener, http_state: HttpState) {
    let app = router(http_state);
    if axum::serve(listener, app).await.is_err() {
        eprintln!("hockey-scoreboard-server: HTTP server stopped");
    }
}
