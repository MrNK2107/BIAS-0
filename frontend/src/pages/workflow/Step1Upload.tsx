import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { Upload as UploadIcon } from "lucide-react";
import EmptyState from "../../components/EmptyState";

export default function Step1Upload() {
  const { file, setFile, projectId, projects, advanceStep, pipelineResults } = useAppContext();

  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [status] = useState("");

  useEffect(() => {
    if (file && headers.length === 0) {
      file
        .text()
        .then((text) => {
          const lines = text.trim().split(/\r?\n/);
          setRowCount(Math.max(lines.length - 1, 0));
          setHeaders(lines[0]?.split(",") ?? []);
        })
        .catch(console.error);
    }
  }, [file, headers.length]);

  const parseFile = async (selected: File) => {
    setFile(selected);
    const text = await selected.text();
    const lines = text.trim().split(/\r?\n/);
    setRowCount(Math.max(lines.length - 1, 0));
    setHeaders(lines[0]?.split(",") ?? []);
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const selected = event.dataTransfer.files[0];
    if (selected) {
      await parseFile(selected);
    }
  };

  if (!projectId) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 1 of 9</div>
            <h1 className="page-title">Upload Dataset</h1>
            <p className="page-subtitle">
              Provide the dataset you want to audit for fairness. We support CSV files.
            </p>
          </div>
        </div>

        <EmptyState
          compact
          icon={<UploadIcon size={26} />}
          kicker="Before you upload"
          title="Select or create a project first"
          description="Datasets are scoped to a project. Open the 'Select Project' button at the top of the page to choose one or create a new one. Once that's set, come back here to drop in your CSV."
          primaryAction={{ label: "Select Project", to: "#open-selector" }}
        />
      </div>
    );
  }

  // Data already exists from a previous analysis — show the re-upload state
  if (!file && pipelineResults) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 1 of 9</div>
            <h1 className="page-title">
              Dataset for {projects.find((p) => String(p.id) === String(projectId))?.name}
            </h1>
            <p className="page-subtitle">
              Analysis data is already loaded. You can re-upload a new CSV to re-run from scratch.
            </p>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div
            className="dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <div>
              <h3 className="section-title">Data Previously Loaded</h3>
              <p className="helper">
                Analysis results are available. Re-upload a new CSV to run a fresh audit with updated data.
              </p>
              <input
                id="file-upload"
                className="input"
                type="file"
                accept=".csv"
                onChange={(event) =>
                  event.target.files?.[0] && parseFile(event.target.files[0])
                }
                style={{ display: "none" }}
              />
              <label
                htmlFor="file-upload"
                className="btn btn-secondary"
                style={{ marginTop: 16, cursor: "pointer" }}
              >
                Choose New File
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 1 of 9</div>
          <h1 className="page-title">
            Upload Dataset for {projects.find((p) => String(p.id) === String(projectId))?.name}
          </h1>
          <p className="page-subtitle">
            Provide the dataset you want to audit for fairness. We support CSV files.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div
          className="dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div>
            <h3 className="section-title">Secure Data Ingestion</h3>
            <p className="helper">
              Initialize audit sequence with a valid .csv dataset.
            </p>
            <input
              id="file-upload"
              className="input"
              type="file"
              accept=".csv"
              onChange={(event) =>
                event.target.files?.[0] && parseFile(event.target.files[0])
              }
              style={{ display: "none" }}
            />
            <label
              htmlFor="file-upload"
              className="btn btn-secondary"
              style={{ marginTop: 16, cursor: "pointer" }}
            >
              Browse Files
            </label>
            {file && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  background: "rgba(200, 157, 124, 0.1)",
                  borderRadius: 8,
                }}
              >
                <strong style={{ color: "var(--accent)" }}>
                  Loaded {file.name}
                </strong>
                <p className="helper" style={{ margin: "4px 0 0" }}>
                  Detected {rowCount.toLocaleString()} rows and {headers.length}{" "}
                  columns.
                </p>
              </div>
            )}
            {status && (
              <p className="helper" style={{ marginTop: 8 }}>
                {status}
              </p>
            )}
          </div>
        </div>
      </div>


    </div>
  );
}
