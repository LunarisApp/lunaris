mod agent_broker;
mod agent_work;
mod auth_keys;
mod auth_store;
pub mod desktop_mcp;
mod extension_cache;
mod native_sync;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        .manage(agent_work::AgentWork::default())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_powersync::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            std::fs::create_dir_all(app.path().app_data_dir()?)?;
            let broker = agent_broker::AgentBroker::new(app.handle().clone())?;
            app.manage(broker.clone());
            tauri::async_runtime::spawn(async move {
                if let Err(error) = broker.run().await {
                    eprintln!("agent content broker failed: {error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_work::agent_work_start,
            agent_work::agent_work_send,
            agent_work::agent_work_stop,
            agent_broker::agent_access_status,
            agent_broker::agent_access_set_enabled,
            agent_broker::agent_access_set_session,
            agent_broker::agent_access_approve,
            agent_broker::agent_access_revoke,
            agent_broker::agent_content_respond,
            desktop_mcp::agent_mcp_setup,
            auth_store::auth_secret_get,
            auth_store::auth_secret_set,
            native_sync::powersync_connect,
            native_sync::powersync_database_size,
            native_sync::powersync_delete_database,
            extension_cache::extension_cache_get,
            extension_cache::extension_cache_put,
            extension_cache::extension_cache_delete,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Lunaris desktop app");
}
