import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, LoaderCircle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Project, ProjectCreateInput, ProjectVisibility } from "@codemesh/shared";
import { ApiClientError, api, jsonBody } from "../lib/api";

type NewProjectDialogProps = {
  open: boolean;
  onClose(): void;
};

type NewProjectForm = ProjectCreateInput & {
  starterRepository: boolean;
};

class ProjectSetupError extends Error {
  constructor(
    readonly project: Project,
    message: string
  ) {
    super(message);
  }
}

const initialForm: NewProjectForm = {
  name: "",
  description: "",
  visibility: "private",
  published: false,
  tags: [],
  guidelines: "",
  starterRepository: true
};

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [tagText, setTagText] = useState("");
  const [formError, setFormError] = useState("");
  const [createdProject, setCreatedProject] = useState<Project | null>(null);

  const createProject = useMutation({
    mutationFn: async (input: NewProjectForm) => {
      const { starterRepository, ...projectInput } = input;
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: jsonBody(projectInput)
      });

      if (starterRepository) {
        try {
          await api(`/api/projects/${project.id}/import/sample`, {
            method: "POST",
            body: jsonBody({})
          });
        } catch (error) {
          throw new ProjectSetupError(project, `The project was created, but starter files could not be added. ${errorMessage(error)}`);
        }
      }

      return project;
    },
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "dashboard"] });
      setForm(initialForm);
      setTagText("");
      setFormError("");
      onClose();
      navigate(`/projects/${project.id}`);
    },
    onError: (error) => {
      if (error instanceof ProjectSetupError) {
        setCreatedProject(error.project);
        void queryClient.invalidateQueries({ queryKey: ["projects", "dashboard"] });
      }
      setFormError(errorMessage(error));
    }
  });

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !createProject.isPending) closeDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, createProject.isPending]);

  if (!open) return null;

  function closeDialog() {
    if (createProject.isPending) return;
    setForm(initialForm);
    setTagText("");
    setFormError("");
    setCreatedProject(null);
    createProject.reset();
    onClose();
  }

  function setVisibility(visibility: ProjectVisibility) {
    setForm((current) => ({
      ...current,
      visibility,
      published: visibility === "public" ? current.published : false
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const tags = [...new Set(tagText.split(",").map((tag) => tag.trim()).filter(Boolean))];
    const invalidTag = tags.find((tag) => tag.length > 24);
    if (invalidTag) {
      setFormError(`Tag "${invalidTag}" is longer than 24 characters.`);
      return;
    }
    if (tags.length > 10) {
      setFormError("Use no more than 10 tags.");
      return;
    }
    createProject.mutate({
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      guidelines: form.guidelines.trim(),
      tags
    });
  }

  function dismissFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeDialog();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={dismissFromBackdrop}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded border border-line bg-panel shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="new-project-title" className="flex items-center gap-2 text-xl font-semibold text-white">
              <FolderPlus className="h-5 w-5 text-mint" />
              New project
            </h2>
            <p className="mt-1 text-sm text-steel">Create a repository workspace owned by your account.</p>
          </div>
          <button className="rounded p-1.5 text-steel hover:bg-ink hover:text-white" type="button" aria-label="Close" onClick={closeDialog}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block text-sm font-medium text-white">
            Project name
            <input
              autoFocus
              required
              minLength={3}
              maxLength={80}
              className="mt-2 w-full rounded border border-line bg-ink px-3 py-2.5 text-white outline-none focus:border-mint"
              placeholder="Customer support API"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>

          <label className="block text-sm font-medium text-white">
            Description
            <textarea
              required
              minLength={10}
              maxLength={500}
              className="mt-2 min-h-24 w-full resize-y rounded border border-line bg-ink px-3 py-2.5 text-white outline-none focus:border-mint"
              placeholder="What this repository contains and who it is for"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
            <span className="mt-1 block text-right text-xs text-steel">{form.description.length}/500</span>
          </label>

          <div>
            <div className="text-sm font-medium text-white">Visibility</div>
            <div className="mt-2 grid grid-cols-2 rounded border border-line bg-ink p-1">
              {(["private", "public"] as const).map((visibility) => (
                <button
                  key={visibility}
                  type="button"
                  className={`rounded px-3 py-2 text-sm capitalize ${form.visibility === visibility ? "bg-panel text-white" : "text-steel hover:text-white"}`}
                  onClick={() => setVisibility(visibility)}
                >
                  {visibility}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium text-white">
            Tags
            <input
              className="mt-2 w-full rounded border border-line bg-ink px-3 py-2.5 text-white outline-none focus:border-mint"
              placeholder="typescript, api, collaboration"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-white">
            Contribution guidelines
            <textarea
              maxLength={4000}
              className="mt-2 min-h-20 w-full resize-y rounded border border-line bg-ink px-3 py-2.5 text-white outline-none focus:border-mint"
              placeholder="Review, testing, and contribution expectations"
              value={form.guidelines}
              onChange={(event) => setForm((current) => ({ ...current, guidelines: event.target.value }))}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded border border-line bg-ink p-3 text-sm text-white">
              <input
                className="mt-1 accent-[#64d6af]"
                type="checkbox"
                checked={form.starterRepository}
                onChange={(event) => setForm((current) => ({ ...current, starterRepository: event.target.checked }))}
              />
              <span>
                <span className="block font-medium">Add starter repository</span>
                <span className="mt-1 block text-xs leading-5 text-steel">Includes working TypeScript files for the graph and assistant.</span>
              </span>
            </label>
            <label className={`flex items-start gap-3 rounded border border-line bg-ink p-3 text-sm ${form.visibility === "public" ? "text-white" : "text-steel"}`}>
              <input
                className="mt-1 accent-[#64d6af]"
                type="checkbox"
                disabled={form.visibility !== "public"}
                checked={form.published}
                onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))}
              />
              <span>
                <span className="block font-medium">Publish in Discover</span>
                <span className="mt-1 block text-xs leading-5 text-steel">Only available for public projects.</span>
              </span>
            </label>
          </div>

          {formError && (
            <div className="rounded border border-coral/40 bg-coral/10 px-3 py-2 text-sm leading-6 text-coral" role="alert">
              {formError}
              {createdProject && (
                <button
                  className="ml-2 font-semibold text-white underline"
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/projects/${createdProject.id}`);
                  }}
                >
                  Open created project
                </button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button className="rounded border border-line px-4 py-2 text-sm text-white hover:border-steel" type="button" onClick={closeDialog}>
              Cancel
            </button>
            <button
              className="flex min-w-36 items-center justify-center gap-2 rounded bg-mint px-4 py-2 text-sm font-semibold text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={createProject.isPending || Boolean(createdProject)}
            >
              {createProject.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              {createProject.isPending ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError || error instanceof Error) return error.message;
  return "Project creation failed. Please try again.";
}
