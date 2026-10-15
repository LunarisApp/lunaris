use async_trait::async_trait;
use futures_lite::StreamExt;
use powersync::error::PowerSyncError;
use powersync::{BackendConnector, PowerSyncCredentials, PowerSyncDatabase};
use reqwest::{Client, Response, StatusCode};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Runtime};
use url::Url;

use super::api::RegionApi;
use super::target::validate_powersync_url;
use super::upload::{
    should_defer_transaction, upload_payload, UploadOutcome, UploadOutcomeType, BATCH_SIZE,
    UPLOAD_EVENT,
};

#[derive(Clone)]
pub(super) struct LunarisConnector<R: Runtime> {
    api: RegionApi,
    app: AppHandle<R>,
    database: PowerSyncDatabase,
    handle: usize,
}

#[derive(Deserialize)]
struct CredentialsResponse {
    #[serde(rename = "powersyncUrl")]
    powersync_url: String,
    token: String,
}

impl<R: Runtime> LunarisConnector<R> {
    pub(super) fn new(
        api_url: Url,
        app: AppHandle<R>,
        client: Client,
        database: PowerSyncDatabase,
        handle: usize,
        region_id: String,
    ) -> Self {
        Self {
            api: RegionApi::new(api_url, client, region_id),
            app,
            database,
            handle,
        }
    }

    fn emit(&self, outcome_type: UploadOutcomeType, status: Option<StatusCode>) {
        let _ = self.app.emit(
            UPLOAD_EVENT,
            UploadOutcome {
                handle: self.handle,
                status: status.map(|value| value.as_u16()),
                outcome_type,
            },
        );
    }

    async fn upload_batch(
        &self,
        transactions: &[powersync::CrudTransaction<'_>],
    ) -> Result<(), PowerSyncError> {
        let payload = upload_payload(transactions);
        let response = self
            .api
            .request(reqwest::Method::POST, "/v1/sync/ingest")?
            .json(&payload)
            .send()
            .await
            .map_err(|error| {
                self.emit(UploadOutcomeType::Error, None);
                PowerSyncError::from(error)
            })?;
        self.api.merge_response_cookies(&response)?;
        self.handle_upload_response(response).await
    }

    async fn handle_upload_response(&self, response: Response) -> Result<(), PowerSyncError> {
        if response.status().is_success() {
            self.emit(UploadOutcomeType::Success, None);
            return Ok(());
        }
        let status = response.status();
        if status.is_client_error() {
            self.emit(UploadOutcomeType::ClientError, Some(status));
        } else {
            self.emit(UploadOutcomeType::Error, Some(status));
        }
        Err(response
            .error_for_status()
            .expect_err("non-success status")
            .into())
    }
}

#[async_trait]
impl<R: Runtime> BackendConnector for LunarisConnector<R> {
    async fn fetch_credentials(&self) -> Result<PowerSyncCredentials, PowerSyncError> {
        let response = self
            .api
            .request(reqwest::Method::GET, "/v1/sync/credentials")?
            .send()
            .await?;
        self.api.merge_response_cookies(&response)?;
        let body = response
            .error_for_status()?
            .json::<CredentialsResponse>()
            .await?;
        Ok(PowerSyncCredentials {
            endpoint: validate_powersync_url(&body.powersync_url, cfg!(debug_assertions))?,
            token: body.token,
        })
    }

    async fn upload_data(&self) -> Result<(), PowerSyncError> {
        let mut stream = self.database.crud_transactions();
        let mut pending = None;

        loop {
            let mut batch = Vec::new();
            let mut entries = 0;
            loop {
                let transaction = match pending.take() {
                    Some(transaction) => Some(transaction),
                    None => stream.try_next().await?,
                };
                let Some(transaction) = transaction else {
                    break;
                };
                let count = transaction.crud.len();
                if should_defer_transaction(batch.is_empty(), entries, count) {
                    pending = Some(transaction);
                    break;
                }
                entries += count;
                batch.push(transaction);
                if entries >= BATCH_SIZE {
                    break;
                }
            }
            if batch.is_empty() {
                return Ok(());
            }
            self.upload_batch(&batch).await?;
            batch.pop().expect("batch is non-empty").complete().await?;
        }
    }
}
