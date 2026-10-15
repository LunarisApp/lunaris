use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use url::Url;

use crate::config::StoredCredential;
use crate::discovery::control_url;

const SCOPES: &str = "openid profile offline_access organization:read organization:manage workspace:read workspace:write workspace:delete content:read file:read";
const CALLBACK_REQUEST_LIMIT: usize = 16_384;
const CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Deserialize)]
struct AuthorizationMetadata {
    authorization_endpoint: String,
    issuer: String,
    registration_endpoint: String,
    token_endpoint: String,
}

#[derive(Debug, Deserialize)]
struct ClientRegistration {
    client_id: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
    refresh_token: Option<String>,
    scope: Option<String>,
    token_type: String,
}

#[derive(Debug, Serialize)]
struct RegistrationRequest<'a> {
    client_name: &'a str,
    grant_types: [&'a str; 2],
    redirect_uris: [&'a str; 1],
    response_types: [&'a str; 1],
    scope: &'a str,
    token_endpoint_auth_method: &'a str,
    #[serde(rename = "type")]
    client_type: &'a str,
}

pub async fn login(
    client: &reqwest::Client,
    base_url: &str,
    timeout_seconds: u64,
    open_browser: bool,
) -> Result<StoredCredential, String> {
    validate_timeout(timeout_seconds)?;
    let resource = normalize_resource(base_url)?;
    let metadata = discover(client, &resource).await?;
    let mut state_bytes = [0_u8; 32];
    let mut verifier_bytes = [0_u8; 64];
    rand::rng().fill_bytes(&mut state_bytes);
    rand::rng().fill_bytes(&mut verifier_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "Could not start OAuth callback server".to_owned())?;
    let callback = format!(
        "http://127.0.0.1:{}/oauth/callback",
        listener
            .local_addr()
            .map_err(|_| "Could not read OAuth callback address".to_owned())?
            .port()
    );
    let registration =
        request_json::<ClientRegistration>(client.post(&metadata.registration_endpoint).json(
            &RegistrationRequest {
                client_name: "Lunaris CLI",
                grant_types: ["authorization_code", "refresh_token"],
                redirect_uris: [&callback],
                response_types: ["code"],
                scope: SCOPES,
                token_endpoint_auth_method: "none",
                client_type: "native",
            },
        ))
        .await?;
    if registration.client_id.is_empty() {
        return Err("OAuth registration returned no client ID".into());
    }
    let mut authorization_url = Url::parse(&metadata.authorization_endpoint)
        .map_err(|_| "OAuth authorization endpoint is invalid".to_owned())?;
    authorization_url
        .query_pairs_mut()
        .append_pair("client_id", &registration.client_id)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "consent")
        .append_pair("redirect_uri", &callback)
        .append_pair("resource", &resource)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPES)
        .append_pair("state", &state);
    eprintln!("Open this URL to sign in:\n{authorization_url}");
    if open_browser {
        let _ = open::that(authorization_url.as_str());
    }
    let code = tokio::time::timeout(
        Duration::from_secs(timeout_seconds),
        wait_for_callback(listener, &state, &metadata.issuer),
    )
    .await
    .map_err(|_| "OAuth login timed out".to_owned())??;
    let token = request_token(
        client,
        &metadata.token_endpoint,
        &[
            ("client_id", registration.client_id.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", callback.as_str()),
            ("resource", resource.as_str()),
        ],
    )
    .await?;
    credential_from_token(
        token,
        registration.client_id,
        metadata.issuer,
        resource,
        None,
        metadata.token_endpoint,
    )
}

pub async fn refresh(
    client: &reqwest::Client,
    credential: &StoredCredential,
    base_url: &str,
) -> Result<StoredCredential, String> {
    let StoredCredential::OAuth {
        client_id,
        issuer,
        refresh_token,
        resource,
        scopes: _,
        token_endpoint,
        ..
    } = credential
    else {
        return Err("OAuth credential required".into());
    };
    let refresh_token = refresh_token
        .as_deref()
        .ok_or_else(|| "OAuth session expired. Run `lunaris auth login` again.".to_owned())?;
    let expected_resource = normalize_resource(base_url)?;
    if &expected_resource != resource {
        return Err(
            "OAuth session belongs to another API URL. Run `lunaris auth login` again.".into(),
        );
    }
    let token_url = control_url(token_endpoint)?;
    if token_url.origin().ascii_serialization()
        != control_url(&expected_resource)?
            .origin()
            .ascii_serialization()
    {
        return Err("Stored OAuth token endpoint has an unexpected origin".into());
    }
    let token = request_token(
        client,
        token_endpoint,
        &[
            ("client_id", client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("resource", expected_resource.as_str()),
        ],
    )
    .await?;
    credential_from_token(
        token,
        client_id.clone(),
        issuer.clone(),
        expected_resource,
        Some(refresh_token.to_owned()),
        token_endpoint.clone(),
    )
}

pub fn access_token(credential: &StoredCredential) -> Option<&str> {
    match credential {
        StoredCredential::Desktop { token, .. } => Some(token),
        StoredCredential::OAuth { access_token, .. } => Some(access_token),
        StoredCredential::ApiKey { .. } => None,
    }
}

pub fn needs_refresh(credential: &StoredCredential) -> bool {
    match credential {
        StoredCredential::OAuth { expires_at, .. } => *expires_at <= now_ms() + 60_000,
        _ => false,
    }
}

async fn discover(
    client: &reqwest::Client,
    resource: &str,
) -> Result<AuthorizationMetadata, String> {
    let base = control_url(resource)?;
    let metadata_url = base
        .join("/.well-known/oauth-authorization-server")
        .map_err(|_| "OAuth metadata URL is invalid".to_owned())?;
    let mut metadata = request_json::<AuthorizationMetadata>(client.get(metadata_url)).await?;
    let expected_origin = base.origin().ascii_serialization();
    for value in [
        metadata.issuer.as_str(),
        metadata.authorization_endpoint.as_str(),
        metadata.registration_endpoint.as_str(),
        metadata.token_endpoint.as_str(),
    ] {
        let url = control_url(value)?;
        if url.origin().ascii_serialization() != expected_origin {
            return Err("OAuth server metadata points to an unexpected origin".into());
        }
    }
    metadata.issuer = normalize_resource(&metadata.issuer)?;
    Ok(metadata)
}

async fn request_token(
    client: &reqwest::Client,
    endpoint: &str,
    values: &[(&str, &str)],
) -> Result<TokenResponse, String> {
    let token = request_json::<TokenResponse>(
        client
            .post(endpoint)
            .header(reqwest::header::ACCEPT, "application/json")
            .form(values),
    )
    .await?;
    if token.access_token.is_empty()
        || !token.token_type.eq_ignore_ascii_case("bearer")
        || token.expires_in <= 0
    {
        return Err("OAuth token response is invalid".into());
    }
    Ok(token)
}

async fn request_json<T: for<'de> Deserialize<'de>>(
    request: reqwest::RequestBuilder,
) -> Result<T, String> {
    let response = request
        .send()
        .await
        .map_err(|error| format!("OAuth request failed: {error}"))?;
    let status = response.status();
    let body = response
        .json::<serde_json::Value>()
        .await
        .unwrap_or_default();
    if !status.is_success() {
        let message = body
            .get("error_description")
            .or_else(|| body.get("message"))
            .or_else(|| body.get("error"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("OAuth request failed");
        return Err(format!("OAuth request failed: {message}"));
    }
    serde_json::from_value(body).map_err(|_| "OAuth response is invalid".into())
}

async fn wait_for_callback(
    listener: TcpListener,
    expected_state: &str,
    expected_issuer: &str,
) -> Result<String, String> {
    loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|_| "OAuth callback server failed".to_owned())?;
        let request =
            match tokio::time::timeout(CALLBACK_READ_TIMEOUT, read_request_head(&mut stream)).await
            {
                Ok(Ok(request)) => request,
                _ => {
                    respond(&mut stream, 400, "Invalid OAuth callback").await;
                    continue;
                }
            };
        let Some(("GET", target)) = request.lines().next().and_then(|line| {
            let mut fields = line.split_whitespace();
            Some((fields.next()?, fields.next()?))
        }) else {
            respond(&mut stream, 400, "Invalid OAuth callback").await;
            continue;
        };
        let Ok(url) = Url::parse(&format!("http://127.0.0.1{target}")) else {
            respond(&mut stream, 400, "Invalid OAuth callback").await;
            continue;
        };
        if url.path() != "/oauth/callback" {
            respond(&mut stream, 404, "Not found").await;
            continue;
        }
        let query = url.query_pairs().into_owned().collect::<HashMap<_, _>>();
        let issuer = query
            .get("iss")
            .and_then(|issuer| normalize_resource(issuer).ok());
        if query.get("state").map(String::as_str) != Some(expected_state)
            || issuer.as_deref() != Some(expected_issuer)
        {
            respond(&mut stream, 400, "Invalid OAuth callback").await;
            continue;
        }
        if let Some(error) = query.get("error") {
            respond(&mut stream, 400, "Authorization denied").await;
            return Err(format!(
                "OAuth authorization failed: {}",
                query.get("error_description").unwrap_or(error)
            ));
        }
        let Some(code) = query.get("code") else {
            respond(&mut stream, 400, "Missing authorization code").await;
            continue;
        };
        respond(
            &mut stream,
            200,
            "Login complete. You can close this window.",
        )
        .await;
        return Ok(code.clone());
    }
}

async fn read_request_head(
    stream: &mut (impl tokio::io::AsyncRead + Unpin),
) -> Result<String, String> {
    let mut request = Vec::with_capacity(2_048);
    let mut chunk = [0_u8; 2_048];
    loop {
        let count = stream
            .read(&mut chunk)
            .await
            .map_err(|_| "OAuth callback could not be read".to_owned())?;
        if count == 0 {
            return Err("OAuth callback ended before its headers".into());
        }
        request.extend_from_slice(&chunk[..count]);
        if let Some(end) = request.windows(4).position(|window| window == b"\r\n\r\n") {
            if end + 4 > CALLBACK_REQUEST_LIMIT {
                return Err("OAuth callback headers are too large".into());
            }
            request.truncate(end + 4);
            return String::from_utf8(request)
                .map_err(|_| "OAuth callback is not valid UTF-8".into());
        }
        if request.len() >= CALLBACK_REQUEST_LIMIT {
            return Err("OAuth callback headers are too large".into());
        }
    }
}

async fn respond(stream: &mut tokio::net::TcpStream, status: u16, message: &str) {
    let reason = if status == 200 { "OK" } else { "Bad Request" };
    let body = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>Lunaris CLI</title><h1>Lunaris CLI</h1><p>{message}</p>"
    );
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
}

fn credential_from_token(
    token: TokenResponse,
    client_id: String,
    issuer: String,
    resource: String,
    existing_refresh_token: Option<String>,
    token_endpoint: String,
) -> Result<StoredCredential, String> {
    let scopes = token
        .scope
        .as_deref()
        .unwrap_or(SCOPES)
        .split_whitespace()
        .map(str::to_owned)
        .collect();
    Ok(StoredCredential::OAuth {
        access_token: token.access_token,
        client_id,
        expires_at: now_ms() + token.expires_in * 1_000,
        issuer,
        refresh_token: token.refresh_token.or(existing_refresh_token),
        resource,
        scopes,
        token_endpoint,
    })
}

fn normalize_resource(value: &str) -> Result<String, String> {
    let mut url = control_url(value)?;
    url.set_fragment(None);
    Ok(url.to_string().trim_end_matches('/').to_owned())
}

fn validate_timeout(value: u64) -> Result<(), String> {
    if (30..=1_800).contains(&value) {
        Ok(())
    } else {
        Err("login timeout must be 30-1800 seconds".into())
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    #[test]
    fn refresh_window_only_applies_to_oauth() {
        assert!(!needs_refresh(&StoredCredential::ApiKey {
            api_key: "key".into()
        }));
        assert!(needs_refresh(&StoredCredential::OAuth {
            access_token: "token".into(),
            client_id: "client".into(),
            expires_at: 0,
            issuer: "https://api.example".into(),
            refresh_token: None,
            resource: "https://api.example".into(),
            scopes: vec![],
            token_endpoint: "https://api.example/token".into(),
        }));
    }

    #[tokio::test]
    async fn reads_fragmented_callback_headers() {
        let (mut client, mut server) = tokio::io::duplex(256);
        let writer = tokio::spawn(async move {
            client.write_all(b"GET /oauth/call").await.unwrap();
            client
                .write_all(b"back?code=ok HTTP/1.1\r\nHost: localhost\r\n\r\n")
                .await
                .unwrap();
        });

        let request = read_request_head(&mut server).await.unwrap();

        assert!(request.starts_with("GET /oauth/callback?code=ok HTTP/1.1"));
        writer.await.unwrap();
    }
}
