use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use cookie::Cookie;
use reqwest::header::SET_COOKIE;
use reqwest::Response;
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::auth_keys::auth_cookie_key;
use crate::auth_store::{secret_get, secret_set};

#[derive(Deserialize, Serialize)]
struct StoredCookie {
    expires: Option<String>,
    value: String,
}

fn bare_cookie_name(name: &str) -> &str {
    name.strip_prefix("__Secure-")
        .or_else(|| name.strip_prefix("__Host-"))
        .unwrap_or(name)
}

fn is_allowed_auth_cookie(name: &str) -> bool {
    let bare = bare_cookie_name(name);
    matches!(
        bare,
        "lunaris.session_token"
            | "lunaris.dont_remember"
            | "lunaris.last_used_login_method"
            | "lunaris.session_data"
            | "lunaris.account_data"
    ) || ["lunaris.session_data.", "lunaris.account_data."]
        .iter()
        .any(|prefix| {
            bare.strip_prefix(prefix).is_some_and(|chunk| {
                !chunk.is_empty() && chunk.bytes().all(|byte| byte.is_ascii_digit())
            })
        })
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn is_cookie_expired(cookie: &Cookie<'_>) -> bool {
    cookie
        .max_age()
        .is_some_and(|age| age.is_negative() || age.is_zero())
        || cookie
            .expires_datetime()
            .is_some_and(|expires| expires.unix_timestamp() <= now_unix())
}

fn cookie_expiry(cookie: &Cookie<'_>) -> Option<String> {
    cookie
        .max_age()
        .and_then(|age| OffsetDateTime::now_utc().checked_add(age))
        .or_else(|| cookie.expires_datetime())
        .and_then(|date| date.format(&Rfc3339).ok())
}

fn parse_cookie_jar(value: Option<String>) -> BTreeMap<String, StoredCookie> {
    value
        .and_then(|stored| serde_json::from_str::<BTreeMap<String, StoredCookie>>(&stored).ok())
        .unwrap_or_default()
        .into_iter()
        .filter(|(name, cookie)| {
            is_allowed_auth_cookie(name)
                && cookie.expires.as_ref().is_none_or(|expires| {
                    OffsetDateTime::parse(expires, &Rfc3339)
                        .map(|date| date.unix_timestamp() > now_unix())
                        .unwrap_or(false)
                })
        })
        .collect()
}

pub(super) fn cookie_header(region_id: &str) -> Result<String, String> {
    let jar = parse_cookie_jar(secret_get(&auth_cookie_key(region_id))?);
    let cookies = jar
        .into_iter()
        .map(|(name, cookie)| format!("{name}={}", cookie.value))
        .collect::<Vec<_>>();
    Ok(cookies.join("; "))
}

pub(super) fn merge_response_cookies(region_id: &str, response: &Response) -> Result<(), String> {
    let key = auth_cookie_key(region_id);
    let mut jar = parse_cookie_jar(secret_get(&key)?);
    let mut changed = false;

    for header in response.headers().get_all(SET_COOKIE) {
        let Ok(raw) = header.to_str() else { continue };
        let Ok(cookie) = Cookie::parse(raw.to_owned()) else {
            continue;
        };
        if !is_allowed_auth_cookie(cookie.name()) {
            continue;
        }
        if is_cookie_expired(&cookie) {
            changed |= jar.remove(cookie.name()).is_some();
            continue;
        }
        jar.insert(
            cookie.name().to_owned(),
            StoredCookie {
                expires: cookie_expiry(&cookie),
                value: cookie.value().to_owned(),
            },
        );
        changed = true;
    }
    if changed {
        let serialized = serde_json::to_string(&jar).map_err(|error| error.to_string())?;
        secret_set(&key, &serialized)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_auth_cookie, is_cookie_expired, parse_cookie_jar, StoredCookie};
    use cookie::Cookie;
    use std::collections::BTreeMap;

    #[test]
    fn filters_auth_cookie_names_and_expired_values() {
        assert!(is_allowed_auth_cookie("__Secure-lunaris.session_token"));
        assert!(is_allowed_auth_cookie("__Host-lunaris.account_data.2"));
        assert!(is_allowed_auth_cookie("lunaris.last_used_login_method"));
        assert!(!is_allowed_auth_cookie("lunaris.account_data.bad"));
        assert!(!is_allowed_auth_cookie("foreign.session_token"));
        assert!(!is_allowed_auth_cookie("lunaris_csrf"));
        let jar = BTreeMap::from([
            (
                "lunaris.session_token".to_owned(),
                StoredCookie {
                    expires: None,
                    value: "kept".to_owned(),
                },
            ),
            (
                "lunaris.account_data.2".to_owned(),
                StoredCookie {
                    expires: Some("1970-01-01T00:00:00Z".to_owned()),
                    value: "expired".to_owned(),
                },
            ),
            (
                "lunaris.last_used_login_method".to_owned(),
                StoredCookie {
                    expires: None,
                    value: "google".to_owned(),
                },
            ),
            (
                "__Secure-lunaris.last_used_login_method".to_owned(),
                StoredCookie {
                    expires: Some("1970-01-01T00:00:00Z".to_owned()),
                    value: "expired".to_owned(),
                },
            ),
            (
                "foreign".to_owned(),
                StoredCookie {
                    expires: None,
                    value: "dropped".to_owned(),
                },
            ),
        ]);
        let filtered = parse_cookie_jar(Some(serde_json::to_string(&jar).unwrap()));
        assert_eq!(filtered.len(), 2);
        assert_eq!(filtered["lunaris.session_token"].value, "kept");
        assert_eq!(filtered["lunaris.last_used_login_method"].value, "google");
    }

    #[test]
    fn detects_cookie_deletions() {
        let deleted = Cookie::parse("lunaris.session_token=; Max-Age=0").unwrap();
        let retained = Cookie::parse("lunaris.session_token=value; Max-Age=60").unwrap();

        assert!(is_cookie_expired(&deleted));
        assert!(!is_cookie_expired(&retained));
    }
}
