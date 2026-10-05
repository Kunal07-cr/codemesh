import { useEffect, useState, type ChangeEvent, type CSSProperties, type DragEvent, type FormEvent } from "react";
import { CheckCircle2, Github, LoaderCircle, Network, Orbit, UploadCloud } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ZIP_EXTRACTED_LIMIT_MB, ZIP_UPLOAD_LIMIT_BYTES, ZIP_UPLOAD_LIMIT_MB } from "@codemesh/shared";
import { api, jsonBody } from "../lib/api";

type RepositoryImportPanelProps = {
  projectId: string;
};

type ImportResult = {
  files: number;
  commitSha: string;
  branch?: string;
  repository?: string;
};

const analysisStages = [
  "Scanning repository...",
  "Mapping architecture...",
  "Tracing dependencies...",
  "Analyzing modules...",
  "Building CodeMesh..."
];

export function RepositoryImportPanel({ projectId }: RepositoryImportPanelProps) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [archive, setArchive] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(0);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
  };

  const githubImport = useMutation({
    mutationFn: () => api<ImportResult>(`/api/projects/${projectId}/import/github`, {
      method: "POST",
      body: jsonBody({ url, branch: branch.trim() || undefined })
    }),
    onSuccess: (result) => {
      setMessage(`Imported ${result.files} files from ${result.repository ?? "GitHub"}.`);
      refresh();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "GitHub import failed.")
  });

  const zipImport = useMutation({
    mutationFn: () => {
      if (!archive) throw new Error("Choose a ZIP archive first.");
      const form = new FormData();
      form.append("archive", archive);
      return api<ImportResult>(`/api/projects/${projectId}/import/zip`, { method: "POST", body: form });
    },
    onSuccess: (result) => {
      setMessage(`Imported ${result.files} files from the ZIP archive.`);
      setArchive(null);
      refresh();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "ZIP import failed.")
  });

  const busy = githubImport.isPending || zipImport.isPending;
  const initialized = message.startsWith("Imported");

  useEffect(() => {
    if (!busy) {
      setAnalysisStage(0);
      return;
    }
    const timer = window.setInterval(() => setAnalysisStage((current) => Math.min(analysisStages.length - 1, current + 1)), 780);
    return () => window.clearInterval(timer);
  }, [busy]);

  function submitGitHub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    githubImport.mutate();
  }

  function selectArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    acceptArchive(file, () => { event.target.value = ""; });
  }

  function acceptArchive(file: File | null, clearInput?: () => void) {
    setMessage("");
    if (file && file.size > ZIP_UPLOAD_LIMIT_BYTES) {
      setArchive(null);
      setMessage(`ZIP archive is ${formatBytes(file.size)}. Choose a file no larger than ${ZIP_UPLOAD_LIMIT_MB} MB.`);
      clearInput?.();
      return;
    }
    if (file && !file.name.toLowerCase().endsWith(".zip")) {
      setArchive(null);
      setMessage("Choose a valid .zip repository archive.");
      clearInput?.();
      return;
    }
    setArchive(file);
  }

  function dropArchive(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    acceptArchive(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <section className="cm-feed-mesh overflow-hidden">
      <div className="cm-feed-mesh-header">
        <div>
          <div className="eyebrow"><Orbit className="h-3.5 w-3.5" /> Repository intake</div>
          <h2>Feed the Mesh</h2>
          <p>Drop your repository or ZIP here. CodeMesh will rebuild the graph and ground the assistant in the new source.</p>
        </div>
        <div className="cm-feed-limit"><span>{ZIP_UPLOAD_LIMIT_MB} MB</span> compressed ceiling</div>
      </div>
      <div className="cm-feed-layout">
        <form className="cm-feed-source" onSubmit={submitGitHub}>
          <div className="cm-feed-source-title"><Github className="h-4 w-4" /><span>Connect public GitHub</span></div>
          <label>
            Repository URL
            <input
              className="field mt-2"
              type="url"
              required
              placeholder="https://github.com/owner/repository"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              Branch <span className="font-normal text-steel">(optional)</span>
              <input className="field mt-2" placeholder="main" value={branch} onChange={(event) => setBranch(event.target.value)} />
            </label>
            <button className="action-primary" type="submit" disabled={busy || url.trim().length === 0}>
              {githubImport.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
              Import GitHub
            </button>
          </div>
        </form>
        <div className="cm-feed-drop-column">
          <label
            className={`cm-feed-drop ${dragging ? "is-dragging" : ""} ${busy ? "is-building" : ""} ${initialized ? "is-initialized" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={dropArchive}
          >
            <span className="cm-feed-orbit" aria-hidden="true">
              {Array.from({ length: 28 }, (_, index) => <i key={index} style={{ "--particle-index": index } as CSSProperties} />)}
              <b>{busy ? <LoaderCircle className="h-7 w-7 animate-spin" /> : initialized ? <CheckCircle2 className="h-7 w-7" /> : <UploadCloud className="h-7 w-7" />}</b>
            </span>
            <strong>{busy ? analysisStages[analysisStage] : initialized ? "CODEMESH INITIALIZED" : archive?.name ?? "Drop repository ZIP"}</strong>
            <span>
              {busy
                ? `${Math.round(((analysisStage + 1) / analysisStages.length) * 100)}% architecture assembled`
                : archive
                  ? `${formatBytes(archive.size)} ready to enter the mesh`
                  : `or click to choose · ${ZIP_UPLOAD_LIMIT_MB} MB compressed / ${ZIP_EXTRACTED_LIMIT_MB} MB extracted`}
            </span>
            <input className="sr-only" type="file" accept=".zip,application/zip" onChange={selectArchive} />
          </label>
          <button className="action-secondary w-full justify-center" type="button" disabled={busy || !archive} onClick={() => zipImport.mutate()}>
            {zipImport.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Build from ZIP
          </button>
        </div>
      </div>
      {busy && (
        <div className="cm-feed-stages" role="status" aria-live="polite">
          {analysisStages.map((stage, index) => <span key={stage} className={index < analysisStage ? "is-complete" : index === analysisStage ? "is-active" : ""}><i>{index < analysisStage ? <CheckCircle2 className="h-3 w-3" /> : <Network className="h-3 w-3" />}</i>{stage.replace("...", "")}</span>)}
        </div>
      )}
      {message && (
        <div className={`cm-feed-message ${initialized ? "is-success" : "is-error"}`} role="status">
          {message.startsWith("Imported") && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{message}</span>
          {initialized && (
            <span className="ml-auto flex shrink-0 flex-wrap items-center gap-3">
              <Link className="font-semibold underline decoration-mint/50 underline-offset-4 hover:text-white" to={`/projects/${projectId}/workspace`}>Open all files</Link>
              <Link className="font-semibold underline decoration-mint/50 underline-offset-4 hover:text-white" to={`/projects/${projectId}/universe`}>Explore graph</Link>
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
