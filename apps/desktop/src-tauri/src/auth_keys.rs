const AUTH_PREFIX: &str = "lunaris-auth-";
const MAX_KEY_LENGTH: usize = 128;

pub(crate) fn is_valid_region_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

pub(crate) fn auth_cookie_key(region_id: &str) -> String {
    format!("{AUTH_PREFIX}{region_id}_cookie")
}

pub(crate) fn is_allowed_key(key: &str) -> bool {
    if key.len() > MAX_KEY_LENGTH {
        return false;
    }
    let Some(name) = key.strip_prefix(AUTH_PREFIX) else {
        return false;
    };
    ["_cookie", "_session_data"]
        .iter()
        .find_map(|suffix| name.strip_suffix(suffix))
        .is_some_and(is_valid_region_id)
}

#[cfg(test)]
mod tests {
    use super::{auth_cookie_key, is_allowed_key, is_valid_region_id};

    #[test]
    fn validates_region_ids() {
        assert!(is_valid_region_id("eu-west_1.test"));
        assert!(!is_valid_region_id(""));
        assert!(!is_valid_region_id("eu/west"));
    }

    #[test]
    fn formats_and_limits_auth_keys() {
        assert_eq!(auth_cookie_key("eu"), "lunaris-auth-eu_cookie");
        assert!(is_allowed_key("lunaris-auth-eu_cookie"));
        assert!(is_allowed_key("lunaris-auth-eu_session_data"));
        assert!(!is_allowed_key("lunaris-csrf-eu"));
        assert!(!is_allowed_key("lunaris-auth-eu_arbitrary"));
        assert!(!is_allowed_key("arbitrary-service-key"));
        assert!(!is_allowed_key("lunaris-auth-eu/../../secret"));
        assert!(!is_allowed_key(&auth_cookie_key(&"a".repeat(128))));
    }
}
