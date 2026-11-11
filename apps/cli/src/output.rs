use std::io::IsTerminal;

use lunaris_agent_mcp::AgentError;
use serde_json::Value;

pub fn print_result(value: &Value, force_json: bool) {
    if force_json || !std::io::stdout().is_terminal() {
        println!("{}", serde_json::json!({ "data": value, "ok": true }));
        return;
    }
    println!("{}", format_human(value));
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
        eprintln!("More results available. Continue with --cursor {cursor}");
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
        if let Some(details) = error.details.as_ref().filter(|value| !value.is_null()) {
            eprintln!("Details:\n{}", format_human(details));
        }
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

// Keep every field, including revision and preview tokens, available for follow-up commands.
fn format_human(value: &Value) -> String {
    let mut lines = Vec::new();
    append_value(value, 0, &mut lines);
    lines.join("\n")
}

fn append_value(value: &Value, depth: usize, lines: &mut Vec<String>) {
    let indent = "  ".repeat(depth);
    match value {
        Value::Object(fields) if !fields.is_empty() => {
            for (key, value) in fields {
                let key = display_scalar(&Value::String(key.clone()));
                if value.is_object() || value.is_array() {
                    lines.push(format!("{indent}{key}:"));
                    append_value(value, depth + 1, lines);
                } else {
                    lines.push(format!("{indent}{key}: {}", display_scalar(value)));
                }
            }
        }
        Value::Array(items) if !items.is_empty() => {
            for (index, item) in items.iter().enumerate() {
                if item.is_object() || item.is_array() {
                    lines.push(format!("{indent}{}.", index + 1));
                    append_value(item, depth + 1, lines);
                } else {
                    lines.push(format!("{indent}{}. {}", index + 1, display_scalar(item)));
                }
            }
        }
        Value::Array(_) => lines.push(format!("{indent}(empty list)")),
        _ => lines.push(format!("{indent}{}", display_scalar(value))),
    }
}

fn display_scalar(value: &Value) -> String {
    match value {
        // Escape control characters so names cannot inject terminal commands or extra rows.
        Value::String(text) if !text.is_empty() => {
            let mut output = String::new();
            for character in text.chars() {
                if character.is_control() {
                    output.extend(character.escape_default());
                } else {
                    output.push(character);
                }
            }
            output
        }
        _ => value.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn human_output_preserves_nested_fields_and_follow_up_tokens() {
        let value =
            json!({"items": [{"name": "Roadmap", "revision": "rev_123"}], "nextCursor": "page_2"});
        assert_eq!(
            format_human(&value),
            "items:\n  1.\n    name: Roadmap\n    revision: rev_123\nnextCursor: page_2"
        );
        assert_eq!(
            format_human(&json!({"previewToken": "token_123"})),
            "previewToken: token_123"
        );
    }

    #[test]
    fn human_output_distinguishes_empty_values() {
        assert_eq!(format_human(&json!([])), "(empty list)");
        assert_eq!(format_human(&json!({})), "{}");
        assert_eq!(format_human(&Value::Null), "null");
        assert_eq!(format_human(&json!("")), "\"\"");
    }

    #[test]
    fn human_output_escapes_terminal_controls() {
        assert_eq!(
            format_human(&json!("Hello\n\u{1b}[31m")),
            "Hello\\n\\u{1b}[31m"
        );
    }
}
