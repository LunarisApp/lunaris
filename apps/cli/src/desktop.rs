use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use url::Url;

use crate::args::Access;
use crate::config::StoredCredential;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairCreated {
    code: String,
    request_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairStatus {
    client_id: Option<String>,
    scopes: Option<Vec<String>>,
    status: String,
    token: Option<String>,
}

pub async fn pair(
    client: &reqwest::Client,
    base_url: &str,
    access: &Access,
    client_name: &str,
    timeout_seconds: u64,
    show_code: bool,
) -> Result<StoredCredential, String> {
    let base = Url::parse(base_url).map_err(|_| "Desktop API URL is invalid".to_owned())?;
    let response = client
        .post(
            base.join("/v1/agent/pair")
                .map_err(|_| "Desktop pairing URL is invalid".to_owned())?,
        )
        .json(&json!({
            "access": access.as_str(),
            "clientName": client_name,
        }))
        .send()
        .await
        .map_err(|_| "Lunaris Desktop is unavailable".to_owned())?;
    let status = response.status();
    let value = response
        .json::<serde_json::Value>()
        .await
        .unwrap_or_default();
    if !status.is_success() {
        return Err(api_message(&value, status.as_u16()));
    }
    let created = serde_json::from_value::<PairCreated>(value)
        .map_err(|_| "Lunaris Desktop returned an invalid pairing response".to_owned())?;
    if show_code {
        eprintln!(
            "Approve “{client_name}” in Lunaris Settings → Local Data. Pairing code: {}",
            created.code
        );
    }
    let deadline = Instant::now() + Duration::from_secs(timeout_seconds);
    while Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(750)).await;
        let response = client
            .get(
                base.join(&format!("/v1/agent/pair/{}", created.request_id))
                    .map_err(|_| "Desktop pairing URL is invalid".to_owned())?,
            )
            .send()
            .await
            .map_err(|_| "Lunaris Desktop is unavailable".to_owned())?;
        let status = response.status();
        let value = response
            .json::<serde_json::Value>()
            .await
            .unwrap_or_default();
        if !status.is_success() {
            return Err(api_message(&value, status.as_u16()));
        }
        let result = serde_json::from_value::<PairStatus>(value)
            .map_err(|_| "Lunaris Desktop returned an invalid pairing response".to_owned())?;
        if result.status != "approved" {
            continue;
        }
        let client_id = result
            .client_id
            .ok_or_else(|| "Desktop pairing returned no client ID".to_owned())?;
        let scopes = result
            .scopes
            .ok_or_else(|| "Desktop pairing returned no scopes".to_owned())?;
        let token = result
            .token
            .ok_or_else(|| "Desktop pairing returned no token".to_owned())?;
        return Ok(StoredCredential::Desktop {
            client_id,
            scopes,
            token,
        });
    }
    Err("Desktop pairing timed out".into())
}

fn api_message(value: &serde_json::Value, status: u16) -> String {
    value
        .get("message")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| format!("Lunaris Desktop returned {status}"))
}
