"""Generic Firestore repository with common CRUD operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Generic, Protocol, TypeVar

from google.cloud.firestore import (
    Client as FirestoreClient,
    DocumentSnapshot,
    SERVER_TIMESTAMP,
    Transaction,
)

from firebase.client import get_firestore

T = TypeVar("T")


class Serializer(Protocol[T]):
    def to_dict(self, obj: T) -> dict[str, Any]: ...
    def from_dict(self, data: dict[str, Any]) -> T: ...


@dataclass
class FirestoreRepository(Generic[T]):
    collection_name: str
    serializer: Serializer[T] | None = None

    def _col(self, client: FirestoreClient | None = None) -> Any:
        db = client or get_firestore()
        return db.collection(self.collection_name)

    def create(self, obj: T, doc_id: str | None = None) -> str:
        db = get_firestore()
        data = self.serializer.to_dict(obj) if self.serializer else obj  # type: ignore[arg-type]
        data["created_at"] = data.get("created_at", SERVER_TIMESTAMP)
        data["updated_at"] = SERVER_TIMESTAMP

        if doc_id:
            db.collection(self.collection_name).document(doc_id).set(data)
            return doc_id
        _, doc_ref = db.collection(self.collection_name).add(data)
        return doc_ref.id

    def get(self, doc_id: str) -> dict[str, Any] | None:
        doc = get_firestore().collection(self.collection_name).document(doc_id).get()
        if not doc.exists:
            return None
        return self._with_id(doc)

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
        from google.api_core.exceptions import FailedPrecondition

        query = get_firestore().collection(self.collection_name)
        if filters:
            for field, op, value in filters:
                query = query.where(field, op, value)

        try:
            q = query
            if order_by:
                field, direction = order_by
                q = q.order_by(field, direction=direction)
            if limit:
                q = q.limit(limit)
            docs = list(q.stream())
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

                reverse = (direction == "DESCENDING" or direction == "DESC")
                results.sort(key=sort_key, reverse=reverse)
                if limit:
                    results = results[:limit]
                return results
            else:
                raise exc

    def update(self, doc_id: str, data: dict[str, Any]) -> None:
        data["updated_at"] = SERVER_TIMESTAMP
        get_firestore().collection(self.collection_name).document(doc_id).update(data)

    def delete(self, doc_id: str) -> None:
        get_firestore().collection(self.collection_name).document(doc_id).delete()

    def delete_all(self, filters: list[tuple[str, str, Any]]) -> int:
        db = get_firestore()
        query = db.collection(self.collection_name)
        for field, op, value in filters:
            query = query.where(field, op, value)
        docs = list(query.stream())
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        return len(docs)

    def transaction(self) -> Transaction:
        return get_firestore().transaction()

    @staticmethod
    def _with_id(doc: DocumentSnapshot) -> dict[str, Any]:
        data = doc.to_dict() or {}
        data["id"] = doc.id
        return data
