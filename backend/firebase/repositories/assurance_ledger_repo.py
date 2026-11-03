from firebase.repository import FirestoreRepository

# Hash-chained outcome-audit history (core.audit_ledger), one chain per user.
assurance_ledger_repo = FirestoreRepository(collection_name="assuranceLedger")
