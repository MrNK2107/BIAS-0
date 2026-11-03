"""Outcome audit (Mode A) API: audit a decision log, no model access needed.

- ``POST /assurance/inspect``: columns of a CSV with suggested roles.
- ``POST /assurance/outcome-audit``: the full audit as JSON, with provenance.
- ``POST /assurance/outcome-audit/report``: the same audit as a self-contained
  HTML assurance report (print to PDF from the browser).
- ``GET /assurance/samples``: the bundled synthetic logs with their column mappings.
- ``GET /assurance/sample?name=lending|hiring``: one bundled log (default lending).
- ``GET /assurance/frameworks``: the regulatory frameworks the mapping covers.
- ``POST /assurance/tradeoff``: accuracy versus disparity for group thresholds.
- ``GET /assurance/history``: the caller's hash-chained audit ledger, verified.
- ``POST /assurance/paired``: paired-probe results (matched applications that differ in one signal):
  flip rate, exact McNemar test, rate and score differences with CIs. ``GET /assurance/paired/sample``.
- ``POST /assurance/paired/probes``: the name-swapped probe set to send to a screener (CSV or JSONL,
  two groups of names, seeded). Sending them is done client-side (``python -m cli probes run``).
- ``POST /assurance/ll144-summary``: the NYC LL144 public summary (6 RCNY 5-303) as HTML.
- ``POST /assurance/verify-report``: a report plus its decision log: does the file match the
  report's SHA-256, and does re-running the recorded settings reproduce its numbers?

The report is recomputed from the uploaded file rather than accepted from the
client, so its numbers always match the input hash printed on it.
"""

from __future__ import annotations

import io
import json
from datetime import UTC, datetime
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel, Field

from core.assurance_report import render_report
from core.audit_ledger import GENESIS, build_entry, compare_to_previous, verify_chain
from core.auth import require_user
from core.evidence import BIAS0_VERSION, display_name, library_versions, sha256_hex
from core.frameworks import FRAMEWORKS
from core.outcome_audit import (
    AUDIT_SCHEMA_VERSION,
    AuditInputError,
    binarise,
    run_outcome_audit,
    suggest_roles,
)
from core.ll144_summary import render_public_summary
from core.paired import paired_probe
from core.probes import DEFAULT_GROUPS, ROLE_SKILLS, generate_probes, probes_to_csv, probes_to_jsonl
from core.report_verify import ReportFormatError, extract_fingerprint, reproduce
from core.tradeoff import TradeoffInputError, threshold_tradeoff
from repositories import assurance_ledger_repo
from utils.paired_probe_sample import PAIRED_SAMPLE_PATH
from utils.samples import SAMPLES, public_samples

router = APIRouter(prefix="/assurance", tags=["assurance"])

MAX_UPLOAD = 50 * 1024 * 1024  # 50 MB, the same limit as the other uploads
MAX_ROWS = 500_000


async def _read_csv(file: UploadFile) -> tuple[pd.DataFrame, bytes]:
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB).")
    if not data.strip():
        raise HTTPException(status_code=400, detail="The file is empty.")
    try:
        df = pd.read_csv(io.BytesIO(data), nrows=MAX_ROWS + 1)
    except (pd.errors.ParserError, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Not a readable CSV: {exc}")
    if len(df) > MAX_ROWS:
        raise HTTPException(status_code=413, detail=f"At most {MAX_ROWS:,} decisions per upload.")
    if df.empty:
        raise HTTPException(status_code=400, detail="The CSV has a header but no rows.")
    return df, data


def _group_list(raw: str) -> list[str]:
    raw = (raw or "").strip()
    if raw.startswith("["):
        try:
            values = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail=f"group_cols is not valid JSON: {exc}")
        return [str(v) for v in values if str(v).strip()]
    return [c.strip() for c in raw.split(",") if c.strip()]


def _blank(value: str | None) -> str | None:
    return value if value is not None and value.strip() != "" else None


async def _audit(
    file: UploadFile,
    decision_col: str,
    group_cols: str,
    outcome_col: str | None,
    score_col: str | None,
    time_col: str | None,
    positive_decision: str | None,
    positive_outcome: str | None,
    period: str,
    threshold: float,
    min_group_size: int | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    df, raw = await _read_csv(file)
    config: dict[str, Any] = {}
    if min_group_size is not None:
        if not 5 <= min_group_size <= 10_000:
            raise HTTPException(status_code=422, detail="min_group_size must be between 5 and 10000.")
        config["min_group_size"] = min_group_size
    if period not in ("auto", "W", "M", "Q"):
        raise HTTPException(status_code=422, detail="period must be auto, W, M or Q.")
    try:
        # CPU-bound (bootstrap): off the event loop, so other requests are not blocked meanwhile.
        result = await run_in_threadpool(
            run_outcome_audit,
            df,
            decision_col,
            _group_list(group_cols),
            outcome_col=_blank(outcome_col),
            score_col=_blank(score_col),
            time_col=_blank(time_col),
            positive_decision=_blank(positive_decision),
            positive_outcome=_blank(positive_outcome),
            period=period,
            threshold=threshold,
            config=config,
        )
    except AuditInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    provenance = {
        "filename": display_name(file.filename),
        "sha256": sha256_hex(raw),
        "size_bytes": len(raw),
        "rows": len(df),
        "columns": int(df.shape[1]),
        "audit_schema": AUDIT_SCHEMA_VERSION,
        "bias0_version": BIAS0_VERSION,
        "libraries": library_versions(),
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    result["provenance"] = provenance
    return result, provenance


def _user_entries(uid: str) -> list[dict[str, Any]]:
    entries = assurance_ledger_repo.list(filters=[("uid", "==", uid)])
    return sorted(entries, key=lambda e: e.get("seq", 0))


def _record(uid: str, result: dict[str, Any], provenance: dict[str, Any], system_name: str | None) -> dict[str, Any]:
    """Append the audit to the caller's ledger and return the entry plus comparison."""
    history = _user_entries(uid)
    last = history[-1] if history else None
    entry = build_entry(
        result,
        provenance,
        uid=uid,
        seq=(last["seq"] + 1) if last else 1,
        prev_entry_sha256=last["entry_sha256"] if last else GENESIS,
        system_name=system_name,
    )
    assurance_ledger_repo.create(dict(entry), doc_id=f"{uid}-{entry['seq']:06d}")
    return {
        "seq": entry["seq"],
        "entry_sha256": entry["entry_sha256"],
        "prev_entry_sha256": entry["prev_entry_sha256"],
        "compared_to_previous": compare_to_previous(entry, history),
    }


@router.post("/inspect")
async def inspect_columns(file: UploadFile = File(...), uid: str = Depends(require_user)) -> dict[str, Any]:
    df, raw = await _read_csv(file)
    out = suggest_roles(df)
    out["filename"] = display_name(file.filename)
    out["sha256"] = sha256_hex(raw)
    return out


@router.post("/outcome-audit")
async def outcome_audit(
    file: UploadFile = File(...),
    decision_col: str = Form(...),
    group_cols: str = Form(...),
    outcome_col: str | None = Form(None),
    score_col: str | None = Form(None),
    time_col: str | None = Form(None),
    positive_decision: str | None = Form(None),
    positive_outcome: str | None = Form(None),
    period: str = Form("auto"),
    threshold: float = Form(0.8),
    min_group_size: int | None = Form(None),
    system_name: str | None = Form(None, max_length=200),
    record: str | None = Form(None),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    result, provenance = await _audit(
        file, decision_col, group_cols, outcome_col, score_col, time_col,
        positive_decision, positive_outcome, period, threshold, min_group_size,
    )
    keep = (record or "true").strip().lower() not in ("false", "0", "no", "off")
    result["ledger"] = _record(uid, result, provenance, _blank(system_name)) if keep else None
    return result


@router.post("/outcome-audit/report", response_class=HTMLResponse)
async def outcome_audit_report(
    file: UploadFile = File(...),
    decision_col: str = Form(...),
    group_cols: str = Form(...),
    outcome_col: str | None = Form(None),
    score_col: str | None = Form(None),
    time_col: str | None = Form(None),
    positive_decision: str | None = Form(None),
    positive_outcome: str | None = Form(None),
    period: str = Form("auto"),
    threshold: float = Form(0.8),
    min_group_size: int | None = Form(None),
    system_name: str | None = Form(None, max_length=200),
    organisation: str | None = Form(None, max_length=200),
    uid: str = Depends(require_user),
) -> HTMLResponse:
    result, provenance = await _audit(
        file, decision_col, group_cols, outcome_col, score_col, time_col,
        positive_decision, positive_outcome, period, threshold, min_group_size,
    )
    body = render_report(result, provenance=provenance, system_name=_blank(system_name), organisation=_blank(organisation))
    return HTMLResponse(body, headers={"Content-Disposition": 'inline; filename="bias0-assurance-report.html"'})


@router.post("/paired")
async def paired(
    file: UploadFile = File(...),
    pair_col: str = Form(...),
    variant_col: str = Form(...),
    decision_col: str = Form(...),
    score_col: str | None = Form(None),
    positive_decision: str | None = Form(None),
    reference: str | None = Form(None),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    """Mode B, offline: did matched applications that differ in one signal get different decisions?"""
    df, raw = await _read_csv(file)
    try:
        result = await run_in_threadpool(
            paired_probe, df, pair_col, variant_col, decision_col,
            score_col=_blank(score_col), positive_decision=_blank(positive_decision), reference=_blank(reference),
        )
    except AuditInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    result["provenance"] = {"filename": display_name(file.filename), "sha256": sha256_hex(raw), "rows": len(df)}
    return result


@router.get("/paired/sample")
async def paired_sample() -> FileResponse:
    """Synthetic paired-probe results: an LLM resume screener tested with name-swapped pairs."""
    if not PAIRED_SAMPLE_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample not found; run python -m utils.paired_probe_sample.")
    return FileResponse(PAIRED_SAMPLE_PATH, media_type="text/csv", filename=PAIRED_SAMPLE_PATH.name)


class ProbeGroup(BaseModel):
    label: str = Field(..., max_length=40)
    names: list[str]


class ProbeRequest(BaseModel):
    n_pairs: int = 200
    seed: int = 7
    groups: list[ProbeGroup] | None = None
    roles: list[str] | None = None
    format: str = Field("csv", pattern="^(csv|jsonl)$")


@router.get("/paired/probes/defaults")
async def probe_defaults() -> dict[str, Any]:
    """Default name groups and roles for the probe generator."""
    return {"groups": DEFAULT_GROUPS, "roles": list(ROLE_SKILLS), "n_pairs": 200, "seed": 7}


@router.post("/paired/probes")
async def paired_probes(req: ProbeRequest) -> Response:
    """The name-swapped probe set: two probes per pair, identical but for the first name. Same input, same file."""
    groups = [g.model_dump() for g in req.groups] if req.groups is not None else None
    try:
        rows = await run_in_threadpool(generate_probes, req.n_pairs, req.seed, groups, req.roles)
    except AuditInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    set_id = rows[0]["probe_set"]
    if req.format == "jsonl":
        body, media, ext = probes_to_jsonl(rows), "application/x-ndjson", "jsonl"
    else:
        body, media, ext = probes_to_csv(rows), "text/csv", "csv"
    return Response(
        body, media_type=f"{media}; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="bias0-probes-{set_id}.{ext}"',
            "X-Probe-Set": set_id,
            "Access-Control-Expose-Headers": "X-Probe-Set, Content-Disposition",
        },
    )


@router.post("/ll144-summary", response_class=HTMLResponse)
async def ll144_summary(
    file: UploadFile = File(...),
    decision_col: str = Form(...),
    group_cols: str = Form(...),
    outcome_col: str | None = Form(None),
    score_col: str | None = Form(None),
    time_col: str | None = Form(None),
    positive_decision: str | None = Form(None),
    positive_outcome: str | None = Form(None),
    period: str = Form("auto"),
    threshold: float = Form(0.8),
    min_group_size: int | None = Form(None),
    system_name: str | None = Form(None, max_length=200),
    organisation: str | None = Form(None, max_length=200),
    distribution_date: str | None = Form(None, max_length=40),
    auditor: str | None = Form(None, max_length=200),
    uid: str = Depends(require_user),
) -> HTMLResponse:
    """The public summary an NYC employer posts for an AEDT, drafted from the audit."""
    result, provenance = await _audit(
        file, decision_col, group_cols, outcome_col, score_col, time_col,
        positive_decision, positive_outcome, period, threshold, min_group_size,
    )
    body = render_public_summary(
        result, provenance=provenance, tool_name=_blank(system_name), employer=_blank(organisation),
        distribution_date=_blank(distribution_date), auditor=_blank(auditor),
    )
    return HTMLResponse(body, headers={"Content-Disposition": 'inline; filename="ll144-bias-audit-summary.html"'})


@router.post("/verify-report")
async def verify_report(
    file: UploadFile = File(..., description="The decision log the report claims to be made from"),
    report: UploadFile = File(..., description="A BIAS-0 assurance report (.html)"),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    """Reproduce a report: SHA-256 of the file, then the audit re-run with the report's recorded settings."""
    body = await report.read(5 * 1024 * 1024 + 1)
    if len(body) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Report too large (max 5 MB).")
    try:
        fp = extract_fingerprint(body.decode("utf-8", errors="replace"))
    except ReportFormatError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    df, raw = await _read_csv(file)
    try:
        out = await run_in_threadpool(reproduce, fp, df, raw)
    except AuditInputError as exc:
        raise HTTPException(status_code=422, detail=f"The file cannot be audited with the report's settings: {exc}")
    out["report_filename"] = display_name(report.filename)
    out["filename"] = display_name(file.filename)
    return out


@router.get("/samples")
async def list_samples() -> dict[str, Any]:
    """Bundled synthetic decision logs (no real people) and the mapping each needs."""
    return {"samples": public_samples()}


@router.get("/sample")
async def sample_decision_log(name: str = "lending") -> FileResponse:
    """One bundled synthetic decision log for demos."""
    sample = SAMPLES.get(name)
    if sample is None:
        raise HTTPException(status_code=404, detail=f"Unknown sample '{name}'. Choose one of: {', '.join(SAMPLES)}.")
    path = sample["path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sample not found; regenerate it with python -m utils.decision_log_sample or utils.hiring_log_sample.")
    return FileResponse(path, media_type="text/csv", filename=path.name)


@router.post("/tradeoff")
async def tradeoff(
    file: UploadFile = File(...),
    score_col: str = Form(...),
    outcome_col: str = Form(...),
    group_col: str = Form(...),
    decision_col: str | None = Form(None),
    positive_outcome: str | None = Form(None),
    positive_decision: str | None = Form(None),
    threshold: float = Form(0.8),
    min_group_size: int = Form(30),
    time_col: str | None = Form(None),
    since: str | None = Form(None),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    """Accuracy / impact-ratio curve for group-specific score thresholds (holdout-evaluated).

    ``time_col`` + ``since`` (a date or ``YYYY-MM``) restrict the curve to recent
    decisions, for example everything since a model update.
    """
    df, raw = await _read_csv(file)
    window = None
    if _blank(since):
        if not _blank(time_col) or time_col not in df.columns:
            raise HTTPException(status_code=422, detail="'since' needs a time_col that is in the file.")
        start = pd.to_datetime(since, errors="coerce")
        if pd.isna(start):
            raise HTTPException(status_code=422, detail=f"'since' is not a date: {since!r}.")
        dates = pd.to_datetime(df[time_col], errors="coerce", format="mixed")
        df = df[(dates >= start).to_numpy()].reset_index(drop=True)
        window = {"time_col": time_col, "since": start.strftime("%Y-%m-%d"), "rows": int(len(df))}
    if not 0.5 <= threshold <= 1.0:
        raise HTTPException(status_code=422, detail="threshold must be between 0.5 and 1.0.")
    if not 5 <= min_group_size <= 10_000:
        raise HTTPException(status_code=422, detail="min_group_size must be between 5 and 10000.")
    try:
        outcome, _ = binarise(df, outcome_col, _blank(positive_outcome))
        baseline = None
        if _blank(decision_col):
            decisions, _ = binarise(df, decision_col, _blank(positive_decision))
            baseline = float(pd.Series(decisions).mean())
        result = await run_in_threadpool(
            threshold_tradeoff,
            df, score_col, outcome, group_col,
            threshold=threshold, min_group_size=min_group_size, baseline_rate=baseline,
        )
    except (AuditInputError, TradeoffInputError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    result["input_sha256"] = sha256_hex(raw)
    result["window"] = window
    return result


@router.get("/history")
async def history(limit: int = 50, uid: str = Depends(require_user)) -> dict[str, Any]:
    """The caller's audit ledger, newest first, with a full chain verification."""
    entries = _user_entries(uid)
    chain = verify_chain(entries)
    clean = [
        {k: v for k, v in e.items() if k not in ("id", "created_at", "updated_at", "uid")}
        for e in reversed(entries)
    ][: max(1, min(limit, 500))]
    return {"chain": chain, "entries": clean}


@router.get("/frameworks")
async def frameworks() -> dict[str, Any]:
    return {"frameworks": FRAMEWORKS}
