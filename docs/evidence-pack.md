# Evidence pack and bundle

BIAS-0 exports an audit as an **evidence bundle**: one ZIP (`bias0-evidence-<date>-<input hash>.zip`,
"Bundle (.zip)" on the Dashboard, "Evidence Bundle" on Compliance) that holds:

| file | what it is |
|---|---|
| `evidence-pack.json` | versioned pack (`bias0.evidence-pack@1.2.0`): provenance, config, metric versions, every gap with its CI, per-group rates, calibration bins, stress CIs, and (when exported from the Compliance page) the NYC LL144 impact-ratio table with any category excluded under 6 RCNY 5-301(d). Version 1.2.0 adds `nyc_ll144`. No record-level data. |
| `evidence.csv` | the same numbers as one long table (UTF-8 with BOM, formula-safe cells) |
| `report.html` | the human-readable audit report (prints to PDF from the browser) |
| `manifest.json` | `bias0.evidence-manifest@1.0.0`: the SHA-256 of each file above, the pack's canonical hash, the input file's hash |

## What the hashes cover

- **Input.** `provenance.input.sha256` is the SHA-256 of the exact bytes that were audited.
  `provenance.input.filename` is the name the file was uploaded under, and `stored_name` is the
  storage object it was read from (`<uuid>_<name>`, or `null` for a direct upload). Packs from runs
  recorded before provenance 1.1.0 only have the stored name in `filename`; the UI strips the uuid
  prefix to show the original name.
- **Positive class.** From provenance 1.2.0, `provenance.config.positive_label` is
  `{"value": <target label>, "source": "user" | "inferred"}`: the target value counted as the
  favourable / selected outcome, chosen in Step 2 or inferred (favourable wording, else the larger or
  later label). Older packs have no such field and the report says "not recorded".
- **Target encoding.** From provenance 1.3.0, `provenance.config.target_binarisation` records how the
  target became 0/1: `two_class`, `one_vs_rest` (the user's positive label on a target with more than
  two labels) or `median_threshold` (a numeric target with more than two values; above the median = 1),
  with a `note` that the report and CSV show. String targets with more than two labels and no positive
  label are rejected rather than split at the median of their alphabetical codes.
- **Files.** `manifest.artifacts[*].sha256` is over each file's exact bytes.
- **Pack self-hash.** `evidence-pack.json` carries `integrity.pack_sha256`: the SHA-256 of the pack with
  its `integrity` member removed, serialised with the JSON Canonicalization Scheme
  ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)). Re-indenting or re-ordering keys does not change it;
  changing any value does. A pack downloaded on its own ("Evidence JSON") carries the same self-hash.
- **Manifest self-hash.** `manifest_sha256` is the canonical hash of the manifest without that field.

The browser (`frontend/src/utils/integrity.ts`) and the verifier (`backend/core/evidence_integrity.py`)
implement RFC 8785 separately. `backend/tests/fixtures/canonical_vectors.json` holds shared vectors
(including the RFC's own number examples) that both test suites check, and
`backend/tests/fixtures/evidence_bundle_js.zip` is a bundle exported by the browser code that the Python
tests verify. Regenerate it with `npm run fixture:evidence` in `frontend/` after changing the export format.

## Verifying

```bash
cd backend
python -m core.evidence_integrity path/to/bias0-evidence-....zip   # or an unzipped folder, or a pack .json
# [ok] manifest self-hash ... VERIFIED   (exit code 0; 1 when any check fails)
```

or `POST /api/evidence/verify` with the file as multipart field `file` (the "Verify an evidence bundle"
panel on the Compliance page). Checks: manifest schema and self-hash; every listed file present with
matching size and SHA-256; no unlisted files; pack self-hash; manifest `pack_sha256` and `input_sha256`
agree with the pack.

## What this does not prove

The bundle is **not signed**. The hashes show that nothing changed after export *unless* whoever changed it
also recomputed every hash, which is easy. They do not show who exported the bundle. BIAS-0 ships no
signing key and does not generate one.

To bind a bundle to an issuer, sign `manifest.json` (it pins every other file) with a key the reviewer
already trusts, and send the signature alongside the ZIP. For example with an SSH key:

```bash
unzip bias0-evidence-....zip manifest.json
ssh-keygen -Y sign -f ~/.ssh/audit_signing_key -n bias0-evidence manifest.json   # writes manifest.json.sig
# reviewer, with an allowed_signers file listing the auditor's public key:
ssh-keygen -Y verify -f allowed_signers -I auditor@example.org -n bias0-evidence -s manifest.json.sig < manifest.json
python -m core.evidence_integrity bias0-evidence-....zip
```

minisign, GPG (`gpg --detach-sign manifest.json`) or a Sigstore signature work the same way. The manifest
has a `signature` field (always `null` today) reserved for an embedded signature in a later version.
