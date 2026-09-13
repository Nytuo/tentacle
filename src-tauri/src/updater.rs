use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

const RELEASES_URL: &str = "https://github.com/Nytuo/tentacle/releases";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();

    if let Ok(endpoint) = std::env::var("UPDATER_ENDPOINT") {
        let url = tauri::Url::parse(&endpoint)
            .map_err(|e| format!("Invalid UPDATER_ENDPOINT URL: {e}"))?;
        builder = builder
            .endpoints(vec![url])
            .map_err(|e| format!("Failed to set endpoint: {e}"))?;
    }

    if let Ok(pubkey) = std::env::var("UPDATER_PUBKEY") {
        builder = builder.pubkey(pubkey);
    }

    builder
        .build()
        .map_err(|e| format!("Updater build failed: {e}"))
}

fn emit_progress(app: &AppHandle, stage: &str, downloaded: u64, total: u64, percentage: u8) {
    let _ = app.emit(
        "updater-progress",
        serde_json::json!({
            "stage": stage,
            "downloaded": downloaded,
            "total": total,
            "percentage": percentage,
        }),
    );
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = build_updater(&app)?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?;

    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        body: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    }))
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = build_updater(&app)?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?
        .ok_or_else(|| "No update available".to_string())?;

    emit_progress(&app, "downloading", 0, 0, 0);

    let on_chunk = {
        let app = app.clone();
        let mut downloaded: u64 = 0;
        move |chunk: usize, content_length: Option<u64>| {
            downloaded += chunk as u64;
            let total = content_length.unwrap_or(0);
            let percentage = downloaded
                .saturating_mul(100)
                .checked_div(total)
                .map_or(0, |p| p.min(100) as u8);
            emit_progress(&app, "downloading", downloaded, total, percentage);
        }
    };
    let on_downloaded = {
        let app = app.clone();
        move || emit_progress(&app, "installing", 0, 0, 99)
    };

    update
        .download_and_install(on_chunk, on_downloaded)
        .await
        .map_err(|e| format!("Update install failed: {e}"))?;

    emit_progress(&app, "done", 0, 0, 100);
    Ok(())
}

#[tauri::command]
pub async fn open_releases_page(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(RELEASES_URL, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {e}"))
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}
