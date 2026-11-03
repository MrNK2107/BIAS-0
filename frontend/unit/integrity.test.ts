/** Evidence-pack integrity: RFC 8785 canonical JSON, pack self-hash, bundle manifest and ZIP. */
import { test } from "node:test";
import assert from "node:assert/strict";

import vectorsFile from "../../backend/tests/fixtures/canonical_vectors.json";
import { canonicalJson, canonicalSha256, sha256Hex, sha256HexSync } from "../src/utils/integrity";
import { crc32, zipStore } from "../src/utils/zip";
import {
  BUNDLE_FILES,
  MANIFEST_SCHEMA,
  buildEvidenceBundle,
  buildEvidencePack,
  sealEvidencePack,
} from "../src/utils/evidencePack";
import type { PipelineFullResult } from "../src/types";

const AT = new Date("2026-11-02T00:00:00Z");
const HEX = "0123456789abcdef0123456789abcdef";

function data(): PipelineFullResult {
  return {
    fairness_score: 72.4,
    decision: "LOW RISK",
    model_used: "tuned_logreg",
    scores: { data_bias_score: 80.25, model_bias_score: 70, stress_test_score: undefined },
    provenance: {
      schema_version: "1.1.0",
      generated_at: "2026-11-02T00:00:00",
      input: {
        filename: "loans.csv", stored_name: `${HEX}_loans.csv`,
        sha256: "ab".repeat(32), size_bytes: 3, n_rows: 10, n_columns: 1, columns: ["x"],
      },
      model: { used: "tuned_logreg", sha256: null },
      config: {
        sensitive_cols: ["g"], target_col: "y", domain: "loan",
        metric_weights: {}, unified_score_weights: {}, statistical_rigour: {},
      },
      versions: { bias0: "0.4.0", metrics: {}, libraries: {} },
    },
  } as PipelineFullResult;
}

test("canonical JSON matches the vectors shared with the Python verifier", async () => {
  const { vectors } = vectorsFile as { vectors: { input: string; canonical: string; sha256: string }[] };
  assert.ok(vectors.length >= 5);
  for (const v of vectors) {
    assert.equal(canonicalJson(JSON.parse(v.input)), v.canonical, v.input);
    assert.equal(await sha256Hex(v.canonical), v.sha256);
  }
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.throws(() => canonicalJson({ x: NaN }));
  assert.equal(canonicalJson({ b: undefined, a: [undefined, 1] }), '{"a":[null,1]}');
});

test("sealed pack: self-hash ignores key order, changes with any value", async () => {
  const pack = await sealEvidencePack(buildEvidencePack(data(), AT));
  assert.equal(pack.schema_version, "1.2.0");
  const { integrity, ...body } = pack;
  assert.equal(integrity?.canonicalization, "RFC 8785 (JCS)");
  assert.equal(integrity?.pack_sha256, await canonicalSha256(body));
  // undefined stage score is dropped exactly as JSON.stringify drops it
  assert.ok(!("stress_test_score" in pack.summary.stage_scores));

  const reordered = Object.fromEntries(Object.entries(body).reverse());
  assert.equal(await canonicalSha256(reordered), integrity?.pack_sha256);

  const tampered = structuredClone(body);
  tampered.summary.fairness_score = 95;
  assert.notEqual(await canonicalSha256(tampered), integrity?.pack_sha256);

  // re-sealing is idempotent
  assert.equal((await sealEvidencePack(pack)).integrity?.pack_sha256, integrity?.pack_sha256);
});

test("bundle manifest lists the SHA-256 of each file's exact bytes", async () => {
  const b = await buildEvidenceBundle(data(), { exportedAt: AT });
  assert.equal(b.name, "bias0-evidence-2026-11-02-abababab.zip");
  assert.deepEqual(Object.keys(b.files).sort(), Object.values(BUNDLE_FILES).sort());
  const m = b.manifest;
  assert.equal(m.schema, MANIFEST_SCHEMA);
  assert.equal(m.signature, null);
  assert.equal(m.input_filename, "loans.csv");
  assert.equal(m.input_sha256, "ab".repeat(32));
  assert.equal(m.artifacts.length, 3);
  for (const a of m.artifacts) {
    assert.equal(a.sha256, await sha256Hex(b.files[a.path]), a.path);
    assert.equal(a.size_bytes, b.files[a.path].length);
  }
  const { manifest_sha256, ...rest } = m;
  assert.equal(manifest_sha256, await canonicalSha256(rest));
  const writtenPack = JSON.parse(new TextDecoder().decode(b.files[BUNDLE_FILES.pack]));
  assert.equal(m.pack_sha256, writtenPack.integrity.pack_sha256);
  // CSV keeps the BOM; the report is the full HTML audit report
  assert.deepEqual([...b.files[BUNDLE_FILES.csv].slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(new TextDecoder().decode(b.files[BUNDLE_FILES.report]), /BIAS-0 Fairness Audit Report/);
});

test("zip writer: CRC-32 check value and a parseable stored archive", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const files = [
    { path: "a.txt", data: new TextEncoder().encode("hello") },
    { path: "dir/é.json", data: new TextEncoder().encode("{}") },
  ];
  const zip = zipStore(files, AT);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 2);
  let off = dv.getUint32(eocd + 16, true);
  for (const f of files) {
    assert.equal(dv.getUint32(off, true), 0x02014b50);
    const size = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const local = dv.getUint32(off + 42, true);
    assert.equal(new TextDecoder().decode(zip.slice(off + 46, off + 46 + nameLen)), f.path);
    assert.equal(dv.getUint32(off + 16, true), crc32(f.data));
    const ln = dv.getUint16(local + 26, true);
    assert.deepEqual(zip.slice(local + 30 + ln, local + 30 + ln + size), f.data);
    off += 46 + nameLen;
  }
});

test("fallback SHA-256 (no WebCrypto) matches FIPS vectors and WebCrypto", async () => {
  const e = new TextEncoder();
  assert.equal(sha256HexSync(e.encode("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256HexSync(e.encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    sha256HexSync(e.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
  for (const n of [55, 56, 63, 64, 65, 1000, 100_003]) {
    const buf = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff);
    assert.equal(sha256HexSync(buf), await sha256Hex(buf), `length ${n}`);
  }
});
