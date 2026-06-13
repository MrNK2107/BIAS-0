"""Generic Firestore repository with common CRUD operations.

Falls back to an in-memory store when Firestore is unavailable,
so the application can function in local/dev mode without Firebase credentials.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Generic, Protocol, TypeVar

from firebase.client import get_firestore, is_firestore_available

T = TypeVar("T")


class Serializer(Protocol[T]):
    def to_dict(self, obj: T) -> dict[str, Any]: ...
    def from_dict(self, data: dict[str, Any]) -> T: ...


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class FirestoreRepository(Generic[T]):
    collection_name: str
    serializer: Serializer[T] | None = None
    _memory_store: dict[str, dict[str, Any]] = field(default_factory=dict, repr=False)
    _memory_id_counter: int = field(default=0, repr=False)

    @property
    def _db_available(self) -> bool:
        return is_firestore_available()

    def create(self, obj: T, doc_id: str | None = None) -> str:
        data: dict[str, Any] = self.serializer.to_dict(obj) if self.serializer else obj  # type: ignore[arg-type]
        data["created_at"] = data.get("created_at", _now())
        data["updated_at"] = _now()

        if not self._db_available:
            rid = doc_id or str(uuid.uuid4())
            record = {**data, "id": rid}
            self._memory_store[rid] = record
            return rid

        from google.cloud.firestore import SERVER_TIMESTAMP

        data["created_at"] = data.get("created_at", SERVER_TIMESTAMP)
        data["updated_at"] = SERVER_TIMESTAMP

        db = get_firestore()
        if doc_id:
            db.collection(self.collection_name).document(doc_id).set(data)
            return doc_id
        _, doc_ref = db.collection(self.collection_name).add(data)
        return doc_ref.id

    def _memory_get(self, doc_id: str) -> dict[str, Any] | None:
        doc = self._memory_store.get(doc_id)
        if doc is None:
            return None
        return {**doc, "id": doc_id}

    def _memory_list(
        self,
        filters: list[tuple[str, str, Any]] | None = None,
        order_by: tuple[str, str] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        results = [dict(r) for r in self._memory_store.values()]
        if filters:
            for field, op, value in filters:
                filtered = []
                for r in results:
                    rv = r.get(field)
                    if op == "==" and rv == value:
                        filtered.append(r)
                    elif op == "!=" and rv != value:
                        filtered.append(r)
                    elif op == ">" and rv is not None and rv > value:
                        filtered.append(r)
                    elif op == ">=" and rv is not None and rv >= value:
                        filtered.append(r)
                    elif op == "<" and rv is not None and rv < value:
                        filtered.append(r)
                    elif op == "<=" and rv is not None and rv <= value:
                        filtered.append(r)
                results = filtered
        if order_by:
            field, direction = order_by
            reverse = direction == "DESCENDING" or direction == "DESC"
            results.sort(key=lambda x: x.get(field) or "", reverse=reverse)
        if limit:
            results = results[:limit]
        return results

    def get(self, doc_id: str) -> dict[str, Any] | None:
        if not self._db_available:
            return self._memory_get(doc_id)
        from google.cloud.firestore import DocumentSnapshot

        doc: DocumentSnapshot = (
            get_firestore().collection(self.collection_name).document(doc_id).get()
        )
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["id"] = doc.id
        return data

    def get_or_raise(self, doc_id: str, detail: str = "Not found") -> dict[str, Any]:
        doc = self.get(doc_id)
        if doc is None:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail=detail)
        return doc

    def list(
        self,
        filters: list[tuple[str, str, Any]] | None = None,
        order_by: tuple[str, str] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        if not self._db_available:
            return self._memory_list(filters, order_by, limit)

        from google.api_core.exceptions import FailedPrecondition
        from google.cloud.firestore import DocumentSnapshot

        db = get_firestore()
        query = db.collection(self.collection_name)
        if filters:
            for field, op, value in filters:
                query = query.where(field_path=field, op_string=op, value=value)

        try:
            q = query
            if order_by:
                field, direction = order_by
                q = q.order_by(field, direction=direction)
            if limit:
                q = q.limit(limit)
            docs: list[DocumentSnapshot] = list(q.stream())
            return [self._with_id(d) for d in docs]
        except FailedPrecondition as exc:
            if order_by:
                docs = list(query.stream())
                results = [self._with_id(d) for d in docs]
                field, direction = order_by

                def sort_key(x):
                    val = x.get(field)
                    if val is None:
                        return ""
                    if hasattr(val, "isoformat"):
                        return val.isoformat()
                    return str(val)

                reverse = direction == "DESCENDING" or direction == "DESC"
                results.sort(key=sort_key, reverse=reverse)
                if limit:
                    results = results[:limit]
                return results
            raise exc

    def update(self, doc_id: str, data: dict[str, Any]) -> None:
        data["updated_at"] = _now()
        if not self._db_available:
            if doc_id in self._memory_store:
                self._memory_store[doc_id].update(data)
            return
        from google.cloud.firestore import SERVER_TIMESTAMP

        data["updated_at"] = SERVER_TIMESTAMP
        get_firestore().collection(self.collection_name).document(doc_id).update(data)

    def delete(self, doc_id: str) -> None:
        if not self._db_available:
            self._memory_store.pop(doc_id, None)
            return
        get_firestore().collection(self.collection_name).document(doc_id).delete()

    def delete_all(self, filters: list[tuple[str, str, Any]]) -> int:
        if not self._db_available:
            ids = [r.get("id") for r in self._memory_list(filters)]
            for rid in ids:
                self._memory_store.pop(rid, None)
            return len(ids)

        db = get_firestore()
        from google.cloud.firestore import DocumentSnapshot

        query = db.collection(self.collection_name)
        for field, op, value in filters:
            query = query.where(field_path=field, op_string=op, value=value)
        docs: list[DocumentSnapshot] = list(query.stream())
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        return len(docs)

    def transaction(self):
        if not self._db_available:
            return None
        return get_firestore().transaction()

    @staticmethod
    def _with_id(doc) -> dict[str, Any]:
        data = doc.to_dict() or {}
        data["id"] = doc.id
        return data
