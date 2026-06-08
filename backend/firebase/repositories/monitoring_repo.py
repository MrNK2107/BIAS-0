from firebase.repository import FirestoreRepository

monitoring_event_repo = FirestoreRepository(collection_name="monitoringEvents")
monitoring_log_repo = FirestoreRepository(collection_name="monitoringLogs")
