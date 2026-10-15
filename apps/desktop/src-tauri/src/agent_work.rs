use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tauri::{ipc::Channel, Manager};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

#[derive(Default)]
pub struct AgentWork(pub Mutex<Option<(String, CommandChild)>>);

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentWorkOutput {
    Line { data: String },
    Closed,
}

#[tauri::command]
pub fn agent_work_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentWork>,
    connection_id: String,
    scope: String,
    events: Channel<AgentWorkOutput>,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    if current.is_some() {
        return Err("Agent Work is already open in another window".into());
    }
    let scope_hash = format!("{:x}", Sha256::digest(scope.as_bytes()));
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("agent-work")
        .join(scope_hash);
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let (mut receiver, child) = app
        .shell()
        .sidecar("lunaris-agent")
        .map_err(|e| e.to_string())?
        .args([directory.to_string_lossy().as_ref()])
        .spawn()
        .map_err(|e| e.to_string())?;
    *current = Some((connection_id.clone(), child));
    drop(current);
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let _ = events.send(AgentWorkOutput::Line {
                        data: String::from_utf8_lossy(&bytes).into_owned(),
                    });
                }
                CommandEvent::Terminated(_) | CommandEvent::Error(_) => break,
                _ => {} // Never relay provider stderr, which can contain secrets.
            }
        }
        if let Ok(mut current) = app.state::<AgentWork>().0.lock() {
            if current.as_ref().is_some_and(|(id, _)| *id == connection_id) {
                if let Some((_, child)) = current.take() {
                    let _ = child.kill();
                }
            }
        }
        let _ = events.send(AgentWorkOutput::Closed);
    });
    Ok(())
}

#[tauri::command]
pub fn agent_work_send(
    state: tauri::State<'_, AgentWork>,
    connection_id: String,
    message: serde_json::Value,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    let (id, child) = current.as_mut().ok_or("Agent Work is disconnected")?;
    if *id != connection_id {
        return Err("Agent Work connection changed".into());
    }
    let mut bytes = serde_json::to_vec(&message).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    child.write(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn agent_work_stop(
    state: tauri::State<'_, AgentWork>,
    connection_id: String,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    if current.as_ref().is_some_and(|(id, _)| *id == connection_id) {
        if let Some((_, child)) = current.take() {
            child.kill().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
