use powersync::{CrudEntry, CrudTransaction, UpdateType};
use serde::Serialize;
use serde_json::{Map, Value};

pub(super) const BATCH_SIZE: usize = 100;
pub(super) const UPLOAD_EVENT: &str = "powersync-upload";

#[derive(Serialize)]
pub(super) struct UploadPayload {
    transactions: Vec<UploadTransaction>,
}

#[derive(Serialize)]
struct UploadTransaction {
    #[serde(rename = "transactionId", skip_serializing_if = "Option::is_none")]
    transaction_id: Option<i64>,
    crud: Vec<UploadEntry>,
}

#[derive(Serialize)]
struct UploadEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Map<String, Value>>,
    id: String,
    op: UpdateType,
    #[serde(rename = "type")]
    table: String,
}

impl From<&CrudEntry> for UploadEntry {
    fn from(entry: &CrudEntry) -> Self {
        Self {
            data: entry.data.clone(),
            id: entry.id.clone(),
            op: match entry.update_type {
                UpdateType::Put => UpdateType::Put,
                UpdateType::Patch => UpdateType::Patch,
                UpdateType::Delete => UpdateType::Delete,
            },
            table: entry.table.clone(),
        }
    }
}

pub(super) fn upload_payload(transactions: &[CrudTransaction<'_>]) -> UploadPayload {
    UploadPayload {
        transactions: transactions
            .iter()
            .map(|transaction| UploadTransaction {
                transaction_id: transaction.id,
                crud: transaction.crud.iter().map(UploadEntry::from).collect(),
            })
            .collect(),
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum UploadOutcomeType {
    ClientError,
    Error,
    Success,
}

#[derive(Clone, Serialize)]
pub(super) struct UploadOutcome {
    pub(super) handle: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) status: Option<u16>,
    #[serde(rename = "type")]
    pub(super) outcome_type: UploadOutcomeType,
}

pub(super) fn should_defer_transaction(
    batch_is_empty: bool,
    batch_entries: usize,
    transaction_entries: usize,
) -> bool {
    !batch_is_empty && batch_entries + transaction_entries > BATCH_SIZE
}

#[cfg(test)]
mod tests {
    use powersync::{CrudEntry, UpdateType};
    use serde_json::{json, Map};

    use super::{should_defer_transaction, UploadEntry};

    #[test]
    fn batches_transactions_without_splitting_them() {
        assert!(!should_defer_transaction(true, 0, 101));
        assert!(!should_defer_transaction(false, 40, 60));
        assert!(should_defer_transaction(false, 40, 61));
        assert!(should_defer_transaction(false, 0, 101));
    }

    #[test]
    fn serializes_existing_upload_shape() {
        let entry = CrudEntry {
            client_id: 1,
            transaction_id: 2,
            update_type: UpdateType::Put,
            table: "workspaces".to_owned(),
            id: "workspace-id".to_owned(),
            metadata: None,
            data: Some(Map::from_iter([("name".to_owned(), json!("Lunaris"))])),
            previous_values: None,
        };

        assert_eq!(
            serde_json::to_value(UploadEntry::from(&entry)).unwrap(),
            json!({
                "data": { "name": "Lunaris" },
                "id": "workspace-id",
                "op": "PUT",
                "type": "workspaces"
            })
        );
    }
}
