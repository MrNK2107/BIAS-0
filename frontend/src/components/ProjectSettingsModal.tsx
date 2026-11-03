import { useEffect, useState } from "react";
import Modal from "./Modal";
import { formApi } from "../api/client";
import type { ProjectRecord } from "../types";

type RateType = "selection" | "scoring";

const OPTIONS: { value: RateType; title: string; body: string }[] = [
  {
    value: "selection",
    title: "Selection rate",
    body:
      "The tool makes a decision (advance, hire, approve). Impact ratio = each category's selection rate over the most selected category's rate. 6 RCNY 5-301(b).",
  },
  {
    value: "scoring",
    title: "Scoring rate",
    body:
      "The tool outputs a score. Scoring rate = share of a category scoring above the full-sample median. Needs a model with probability scores. 6 RCNY 5-301(c).",
  },
];

interface Props {
  project: ProjectRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/** Audit settings kept on the project (PATCH /project/{id}/settings). Every
 *  later run records the choice in its provenance. */
export default function ProjectSettingsModal({ project, onClose, onSaved }: Props) {
  const saved: RateType = project?.ll144_rate_type ?? "selection";
  const [rateType, setRateType] = useState<RateType>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRateType(saved);
    setError(null);
  }, [project?.id, saved]);

  const save = async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("ll144_rate_type", rateType);
      await formApi.patch(`/project/${project.id}/settings`, form);
      await onSaved();
      onClose();
    } catch {
      setError("Could not save the project settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={project !== null}
      onClose={onClose}
      title={project ? `Project settings: ${project.name}` : "Project settings"}
      size="md"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={saving || rateType === saved}
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </>
      }
    >
      <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
        <legend
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 6,
            color: "var(--text-primary)",
          }}
        >
          NYC Local Law 144 rate type
        </legend>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 14px" }}>
          Which rate the bias audit reports. Runs after you save record this choice in their
          provenance, the report and the evidence pack.
        </p>
        <div className="stack stack-sm" role="radiogroup" aria-label="LL144 rate type">
          {OPTIONS.map((o) => {
            const checked = rateType === o.value;
            return (
              <label
                key={o.value}
                className="card-inset"
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "12px 14px",
                  cursor: "pointer",
                  border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
                }}
              >
                <input
                  type="radio"
                  name="ll144-rate-type"
                  value={o.value}
                  checked={checked}
                  onChange={() => setRateType(o.value)}
                  style={{ marginTop: 3, accentColor: "var(--accent)" }}
                />
                <span>
                  <span style={{ display: "block", fontWeight: 600, fontSize: "0.9rem" }}>
                    {o.title}
                    {saved === o.value && (
                      <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> (current)</span>
                    )}
                  </span>
                  <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
                    {o.body}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {error && (
          <p role="alert" style={{ color: "#D9837E", fontSize: "0.82rem", marginTop: 12 }}>
            {error}
          </p>
        )}
      </fieldset>
    </Modal>
  );
}
