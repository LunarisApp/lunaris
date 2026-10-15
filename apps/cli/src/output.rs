use std::io::IsTerminal;

use lunaris_agent_mcp::AgentError;
use serde_json::Value;

pub fn print_result(value: &Value, force_json: bool) {
    if force_json || !std::io::stdout().is_terminal() {
        println!("{}", serde_json::json!({ "data": value, "ok": true }));
        return;
    }
    println!(
        "{}",
        serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
    );
    if value
        .pointer("/snapshot/completeness")
        .and_then(Value::as_str)
        == Some("partial")
    {
        let state = value
            .pointer("/snapshot/syncState")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        eprintln!("Warning: Desktop cache is incomplete ({state}).");
    }
    if let Some(cursor) = value.get("nextCursor").and_then(Value::as_str) {
        eprintln!("Next cursor: {cursor}");
    }
}

pub fn print_error(message: &str, json: bool) {
    if json {
        eprintln!(
            "{}",
            serde_json::json!({
                "error": { "code": "CLI_ERROR", "message": message },
                "ok": false
            })
        );
    } else {
        eprintln!("Error: {message}");
    }
}

pub fn print_agent_error(error: &AgentError, json: bool) {
    if json {
        eprintln!(
            "{}",
            serde_json::json!({
                "error": {
                    "code": error.code,
                    "details": error.details,
                    "message": error.message,
                    "status": error.status,
                },
                "ok": false
            })
        );
    } else {
        eprintln!("{}: {}", error.code, error.message);
    }
}

pub fn exit_code(status: u16) -> i32 {
    match status {
        401 | 403 => 3,
        409 | 412 => 4,
        429 => 5,
        _ => 2,
    }
}
