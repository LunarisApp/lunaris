use powersync::error::PowerSyncError;
use reqwest::header::COOKIE;
use reqwest::{Client, Method, RequestBuilder, Response};
use url::Url;

use super::cookies::{cookie_header, merge_response_cookies};
use super::target::powersync_error;

#[derive(Clone)]
pub(super) struct RegionApi {
    api_url: Url,
    client: Client,
    region_id: String,
}

impl RegionApi {
    pub(super) fn new(api_url: Url, client: Client, region_id: String) -> Self {
        Self {
            api_url,
            client,
            region_id,
        }
    }

    fn endpoint(&self, path: &str) -> Url {
        self.api_url.join(path).expect("validated API URL")
    }

    pub(super) fn request(
        &self,
        method: Method,
        path: &str,
    ) -> Result<RequestBuilder, PowerSyncError> {
        let cookie = cookie_header(&self.region_id).map_err(powersync_error)?;
        let request = self.client.request(method, self.endpoint(path));
        Ok(if cookie.is_empty() {
            request
        } else {
            request.header(COOKIE, cookie)
        })
    }

    pub(super) fn merge_response_cookies(&self, response: &Response) -> Result<(), PowerSyncError> {
        merge_response_cookies(&self.region_id, response).map_err(powersync_error)
    }
}
