import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Plus, LayoutGrid, Check, Trash2 } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { formApi } from "../api/client";

export default function ProjectSelector() {
  const { projects, projectId, setProjectId, refreshProjects, deleteProject } =
    useAppContext();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("finance");
  const location = useLocation();

  useEffect(() => {
    if (location.hash === "#open-selector") {
      setIsOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [location.hash, location.pathname]);

  const currentProject = projects?.find(
    (p) => String(p.id) === String(projectId),
  );

  const handleCreate = async () => {
    if (!newName || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", newName);
      fd.append("domain", newDomain);
      const res = await formApi.post("/project/create", fd);
      await refreshProjects();
      setProjectId(String(res.data.project_id));
      setIsCreating(false);
      setNewName("");
      setIsOpen(false);
      navigate("/workflow/step-1");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to create project";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="workflow-breadcrumb"
        style={{
          cursor: "pointer",
          border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.02)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 16px",
          borderRadius: 100,
          color: "#fff",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <LayoutGrid size={14} style={{ color: "var(--accent)" }} />
        <span
          className="workflow-breadcrumb-label"
          style={{ fontWeight: 700, color: "#fff" }}
        >
          {currentProject?.name || "Select Project"}
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5, color: "#fff" }} />
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
            }}
            onClick={() => {
              setIsOpen(false);
              setIsCreating(false);
            }}
          />
          <div
            className="card fade-in"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              width: 280,
              zIndex: 101,
              padding: 12,
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
          >
            {!isCreating ? (
              <>
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    marginBottom: 12,
                  }}
                >
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="card-inset"
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                        border:
                          String(p.id) === String(projectId)
                            ? "1px solid var(--accent)"
                            : "1px solid transparent",
                        background:
                          String(p.id) === String(projectId)
                            ? "rgba(200, 157, 124, 0.05)"
                            : "transparent",
                      }}
                      onClick={() => {
                        setProjectId(String(p.id));
                        setIsOpen(false);
                      }}
                    >
                      <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        {p.name}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {String(p.id) === String(projectId) && (
                          <Check size={14} color="var(--accent)" />
                        )}
                        <button
                          type="button"
                          disabled={deletingId === String(p.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: deletingId === String(p.id) ? "not-allowed" : "pointer",
                            padding: 2,
                            display: "flex",
                            opacity: deletingId === String(p.id) ? 0.3 : 0.5,
                          }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (deletingId === String(p.id)) return;
                            if (!confirm(`Delete project "${p.name}"? This cannot be undone.`)) return;
                            setDeletingId(String(p.id));
                            await deleteProject(String(p.id));
                            setDeletingId(null);
                          }}
                        >
                          {deletingId === String(p.id) ? (
                            <span style={{ fontSize: 11 }}>...</span>
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", fontSize: "0.8rem", gap: 6 }}
                  onClick={() => setIsCreating(true)}
                >
                  <Plus size={14} /> New Project
                </button>
              </>
            ) : (
              <div className="stack stack-md">
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Create Project
                </div>
                <input
                  className="input"
                  placeholder="Project Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <select
                  className="select"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                >
                  <option value="finance">Finance</option>
                  <option value="hiring">Hiring</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="justice">Justice</option>
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: "0.8rem" }}
                    onClick={handleCreate}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Creating..." : "Create"}
                  </button>
                  <button
                    className="btn"
                    style={{ fontSize: "0.8rem" }}
                    onClick={() => setIsCreating(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
