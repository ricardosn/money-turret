"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ProvisionOut {
  id: number;
  project_id: number;
  item: string;
  estimated_value: string;
  expected_month: string; // "YYYY-MM"
  is_paid: boolean;
}

interface TimelineEntry {
  month: string;
  estimated: string;
  paid: string;
  items: ProvisionOut[];
}

interface ProjectSummary {
  id: number;
  title: string;
  target_date: string;
  total_budget: string;
  total_estimated: string;
  total_provisioned: string;
  progress_percentage: number;
  provisions_count: number;
}

interface ProjectDetail extends ProjectSummary {
  provisions: ProvisionOut[];
  timeline: TimelineEntry[];
}

interface ProjectDraft {
  title: string;
  target_date: string; // "YYYY-MM-DD"
  total_budget: string;
}

interface ProvisionDraft {
  item: string;
  estimated_value: string;
  expected_month: string; // "YYYY-MM"
  is_paid: boolean;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const monthFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return monthFmt.format(new Date(Date.UTC(year, m - 1, 1)));
}

function emptyProjectDraft(): ProjectDraft {
  return { title: "", target_date: "", total_budget: "" };
}

function projectDraftFrom(project: ProjectSummary): ProjectDraft {
  return {
    title: project.title,
    target_date: project.target_date,
    total_budget: project.total_budget,
  };
}

function emptyProvisionDraft(): ProvisionDraft {
  return { item: "", estimated_value: "", expected_month: "", is_paid: false };
}

function provisionDraftFrom(provision: ProvisionOut): ProvisionDraft {
  return {
    item: provision.item,
    estimated_value: provision.estimated_value,
    expected_month: provision.expected_month,
    is_paid: provision.is_paid,
  };
}

const iconButtonClass =
  "focus-ring inline-flex items-center justify-center rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40";

const iconButtonDangerClass =
  "focus-ring inline-flex items-center justify-center rounded p-1.5 text-slate-500 transition-colors hover:bg-red-950/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40";

function ProgressBar({ value, max }: { value: number; max: number }): ReactNode {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 1000) / 10) : 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="text-slate-300">
          {brl.format(value)} de {brl.format(max)} provisionados
        </span>
        <span className="font-medium tabular-nums text-slate-200">{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ProjectForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ProjectDraft;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (draft: ProjectDraft) => void;
  onCancel: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<ProjectDraft>(initial);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const budget = Number(draft.total_budget.replace(",", "."));
    if (!draft.title.trim()) {
      setFormError("Informe o título do projeto.");
      return;
    }
    if (!draft.target_date) {
      setFormError("Informe a data-alvo.");
      return;
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      setFormError("Informe um orçamento total válido.");
      return;
    }
    setFormError(null);
    onSubmit({ ...draft, title: draft.title.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} flex flex-col gap-3 p-4`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Título
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="ex: Roteiro Ásia"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Data-alvo
          <input
            type="date"
            value={draft.target_date}
            onChange={(e) =>
              setDraft((d) => ({ ...d, target_date: e.target.value }))
            }
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Orçamento total
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.total_budget}
            onChange={(e) =>
              setDraft((d) => ({ ...d, total_budget: e.target.value }))
            }
            placeholder="0,00"
            className={inputClass}
          />
        </label>
      </div>
      {formError && <p className="text-xs text-red-400">{formError}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={submitting} className={buttonPrimaryClass}>
          {submitting && (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          )}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={buttonSecondaryClass}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ProvisionForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ProvisionDraft;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (draft: ProvisionDraft) => void;
  onCancel: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<ProvisionDraft>(initial);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(draft.estimated_value.replace(",", "."));
    if (!draft.item.trim()) {
      setFormError("Informe o item.");
      return;
    }
    if (!draft.expected_month) {
      setFormError("Informe o mês esperado de aporte.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setFormError("Informe um valor estimado válido.");
      return;
    }
    setFormError(null);
    onSubmit({ ...draft, item: draft.item.trim() });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/70 p-3"
    >
      <label className={labelClass}>
        Item
        <input
          type="text"
          value={draft.item}
          onChange={(e) => setDraft((d) => ({ ...d, item: e.target.value }))}
          placeholder="ex: Passagens aéreas antecipadas"
          className={`${inputClass} w-full`}
        />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className={labelClass}>
          Valor estimado
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.estimated_value}
            onChange={(e) =>
              setDraft((d) => ({ ...d, estimated_value: e.target.value }))
            }
            placeholder="0,00"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Mês de aporte
          <input
            type="month"
            value={draft.expected_month}
            onChange={(e) =>
              setDraft((d) => ({ ...d, expected_month: e.target.value }))
            }
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-1.5 self-end pb-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={draft.is_paid}
            onChange={(e) =>
              setDraft((d) => ({ ...d, is_paid: e.target.checked }))
            }
            className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-blue-500"
          />
          Já provisionado
        </label>
      </div>
      {formError && <p className="text-xs text-red-400">{formError}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={submitting} className={buttonPrimaryClass}>
          {submitting && (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          )}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={buttonSecondaryClass}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ProvisioningTimeline({
  timeline,
  onTogglePaid,
  togglingId,
  editingProvisionId,
  savingProvisionId,
  deletingProvisionId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  timeline: TimelineEntry[];
  onTogglePaid: (provision: ProvisionOut) => void;
  togglingId: number | null;
  editingProvisionId: number | null;
  savingProvisionId: number | null;
  deletingProvisionId: number | null;
  onStartEdit: (provision: ProvisionOut) => void;
  onCancelEdit: () => void;
  onSaveEdit: (provisionId: number, draft: ProvisionDraft) => void;
  onDelete: (provision: ProvisionOut) => void;
}): ReactNode {
  return (
    <ol className="flex flex-col gap-4 border-l border-slate-800 pl-5">
      {timeline.map((entry) => {
        const estimated = Number(entry.estimated);
        const paid = Number(entry.paid);
        const monthPct =
          estimated > 0 ? Math.round((paid / estimated) * 100) : 0;
        return (
          <li key={entry.month} className="relative">
            <span
              className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-blue-500"
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium capitalize text-slate-200">
                {formatMonth(entry.month)}
              </span>
              <span className="text-xs tabular-nums text-slate-400">
                {brl.format(paid)} / {brl.format(estimated)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${monthPct}%` }}
              />
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {entry.items.map((item) =>
                editingProvisionId === item.id ? (
                  <li key={item.id} className="pt-1">
                    <ProvisionForm
                      initial={provisionDraftFrom(item)}
                      submitting={savingProvisionId === item.id}
                      submitLabel="Salvar"
                      onSubmit={(draft) => onSaveEdit(item.id, draft)}
                      onCancel={onCancelEdit}
                    />
                  </li>
                ) : (
                  <li key={item.id} className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => onTogglePaid(item)}
                      disabled={togglingId === item.id}
                      aria-pressed={item.is_paid}
                      title="Marcar como pago/pendente"
                      className="focus-ring flex min-w-0 flex-1 items-center gap-1.5 rounded text-left text-slate-300 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {item.is_paid ? (
                        <CheckCircle2
                          size={14}
                          className="shrink-0 text-emerald-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          size={14}
                          className="shrink-0 text-slate-600"
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{item.item}</span>
                    </button>
                    <span className="shrink-0 tabular-nums text-slate-400">
                      {brl.format(Number(item.estimated_value))}
                    </span>
                    <button
                      type="button"
                      onClick={() => onStartEdit(item)}
                      aria-label={`Editar provisionamento: ${item.item}`}
                      title="Editar"
                      className={iconButtonClass}
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      disabled={deletingProvisionId === item.id}
                      aria-label={`Excluir provisionamento: ${item.item}`}
                      title="Excluir"
                      className={iconButtonDangerClass}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </li>
                ),
              )}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function ProjectCard({
  project,
  expanded,
  detail,
  loadingDetail,
  onToggle,
  onTogglePaid,
  togglingId,
  savingProject,
  onUpdateProject,
  deletingProject,
  onDeleteProject,
  creatingProvision,
  onCreateProvision,
  savingProvisionId,
  onUpdateProvision,
  deletingProvisionId,
  onDeleteProvision,
}: {
  project: ProjectSummary;
  expanded: boolean;
  detail: ProjectDetail | undefined;
  loadingDetail: boolean;
  onToggle: () => void;
  onTogglePaid: (provision: ProvisionOut) => void;
  togglingId: number | null;
  savingProject: boolean;
  onUpdateProject: (draft: ProjectDraft) => Promise<boolean>;
  deletingProject: boolean;
  onDeleteProject: () => void;
  creatingProvision: boolean;
  onCreateProvision: (draft: ProvisionDraft) => Promise<boolean>;
  savingProvisionId: number | null;
  onUpdateProvision: (provisionId: number, draft: ProvisionDraft) => Promise<boolean>;
  deletingProvisionId: number | null;
  onDeleteProvision: (provision: ProvisionOut) => void;
}): ReactNode {
  const [editingProject, setEditingProject] = useState(false);
  const [addingProvision, setAddingProvision] = useState(false);
  const [editingProvisionId, setEditingProvisionId] = useState<number | null>(
    null,
  );

  const budget = Number(project.total_budget);
  const provisioned = Number(project.total_provisioned);
  const estimated = Number(project.total_estimated);
  const overBudget = estimated > budget;

  const handleUpdateProjectSubmit = async (draft: ProjectDraft) => {
    const ok = await onUpdateProject(draft);
    if (ok) setEditingProject(false);
  };

  const handleDeleteProjectClick = () => {
    if (
      window.confirm(
        `Excluir o projeto "${project.title}" e todos os seus provisionamentos? Essa ação não pode ser desfeita.`,
      )
    ) {
      onDeleteProject();
    }
  };

  const handleCreateProvisionSubmit = async (draft: ProvisionDraft) => {
    const ok = await onCreateProvision(draft);
    if (ok) setAddingProvision(false);
  };

  const handleSaveProvisionEdit = async (
    provisionId: number,
    draft: ProvisionDraft,
  ) => {
    const ok = await onUpdateProvision(provisionId, draft);
    if (ok) setEditingProvisionId(null);
  };

  const handleDeleteProvisionClick = (provision: ProvisionOut) => {
    if (
      window.confirm(`Excluir o provisionamento "${provision.item}"?`)
    ) {
      onDeleteProvision(provision);
    }
  };

  return (
    <section className={`${cardClass} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded text-left"
        >
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">
              {project.title}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
              <CalendarDays size={13} aria-hidden="true" />
              {formatDate(project.target_date)} · {project.provisions_count}{" "}
              provisionamento(s)
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditingProject((v) => !v)}
            aria-label={`Editar projeto: ${project.title}`}
            title="Editar projeto"
            className={iconButtonClass}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleDeleteProjectClick}
            disabled={deletingProject}
            aria-label={`Excluir projeto: ${project.title}`}
            title="Excluir projeto"
            className={iconButtonDangerClass}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher projeto" : "Expandir projeto"}
            className={iconButtonClass}
          >
            {expanded ? (
              <ChevronUp size={18} aria-hidden="true" />
            ) : (
              <ChevronDown size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {editingProject ? (
        <div className="mt-4">
          <ProjectForm
            initial={projectDraftFrom(project)}
            submitting={savingProject}
            submitLabel="Salvar"
            onSubmit={handleUpdateProjectSubmit}
            onCancel={() => setEditingProject(false)}
          />
        </div>
      ) : (
        <div className="mt-4">
          <ProgressBar value={provisioned} max={budget} />
          {overBudget && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
              Total estimado ({brl.format(estimated)}) excede o orçamento em{" "}
              {brl.format(estimated - budget)}.
            </p>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Timeline de provisionamento
            </h3>
            <button
              type="button"
              onClick={() => setAddingProvision((v) => !v)}
              className="focus-ring inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-blue-400 hover:bg-slate-800 hover:text-blue-300"
            >
              <Plus size={13} aria-hidden="true" />
              Adicionar
            </button>
          </div>

          {addingProvision && (
            <div className="mt-3">
              <ProvisionForm
                initial={emptyProvisionDraft()}
                submitting={creatingProvision}
                submitLabel="Adicionar"
                onSubmit={handleCreateProvisionSubmit}
                onCancel={() => setAddingProvision(false)}
              />
            </div>
          )}

          <div className="mt-3">
            {loadingDetail && !detail ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : detail && detail.timeline.length > 0 ? (
              <ProvisioningTimeline
                timeline={detail.timeline}
                onTogglePaid={onTogglePaid}
                togglingId={togglingId}
                editingProvisionId={editingProvisionId}
                savingProvisionId={savingProvisionId}
                deletingProvisionId={deletingProvisionId}
                onStartEdit={(provision) => setEditingProvisionId(provision.id)}
                onCancelEdit={() => setEditingProvisionId(null)}
                onSaveEdit={handleSaveProvisionEdit}
                onDelete={handleDeleteProvisionClick}
              />
            ) : (
              !addingProvision && (
                <p className="text-sm text-slate-500">
                  Nenhum provisionamento cadastrado para este projeto.
                </p>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProjectsPage(): ReactNode {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [details, setDetails] = useState<Record<number, ProjectDetail>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [savingProjectId, setSavingProjectId] = useState<number | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(
    null,
  );
  const [creatingProvisionProjectId, setCreatingProvisionProjectId] =
    useState<number | null>(null);
  const [savingProvisionId, setSavingProvisionId] = useState<number | null>(
    null,
  );
  const [deletingProvisionId, setDeletingProvisionId] = useState<number | null>(
    null,
  );

  const loadProjects = useCallback(() => {
    fetch(`${API_URL}/projects`)
      .then((r) => r.json() as Promise<ProjectSummary[]>)
      .then((data) => {
        setProjects(data);
        setError(null);
      })
      .catch(() =>
        setError(`Não foi possível carregar os projetos (${API_URL}).`),
      );
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const loadDetail = useCallback((id: number) => {
    setLoadingDetailId(id);
    fetch(`${API_URL}/projects/${id}`)
      .then((r) => r.json() as Promise<ProjectDetail>)
      .then((detail) => {
        setDetails((prev) => ({ ...prev, [id]: detail }));
        setError(null);
      })
      .catch(() =>
        setError("Não foi possível carregar o detalhamento do projeto."),
      )
      .finally(() =>
        setLoadingDetailId((current) => (current === id ? null : current)),
      );
  }, []);

  const handleToggle = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!details[id]) loadDetail(id);
  };

  const handleTogglePaid = async (projectId: number, provision: ProvisionOut) => {
    setTogglingId(provision.id);
    try {
      const res = await fetch(
        `${API_URL}/projects/${projectId}/provisions/${provision.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_paid: !provision.is_paid }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadDetail(projectId);
      loadProjects();
    } catch {
      setError("Não foi possível atualizar o provisionamento.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreateProject = async (draft: ProjectDraft): Promise<boolean> => {
    setCreatingProject(true);
    try {
      const res = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = (await res.json()) as ProjectDetail;
      setDetails((prev) => ({ ...prev, [created.id]: created }));
      setExpandedId(created.id);
      loadProjects();
      setError(null);
      return true;
    } catch {
      setError("Não foi possível criar o projeto.");
      return false;
    } finally {
      setCreatingProject(false);
    }
  };

  const handleUpdateProject = async (
    id: number,
    draft: ProjectDraft,
  ): Promise<boolean> => {
    setSavingProjectId(id);
    try {
      const res = await fetch(`${API_URL}/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as ProjectDetail;
      setDetails((prev) => ({ ...prev, [id]: updated }));
      loadProjects();
      setError(null);
      return true;
    } catch {
      setError("Não foi possível salvar o projeto.");
      return false;
    } finally {
      setSavingProjectId(null);
    }
  };

  const handleDeleteProject = async (id: number) => {
    setDeletingProjectId(id);
    try {
      const res = await fetch(`${API_URL}/projects/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setDetails((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setExpandedId((current) => (current === id ? null : current));
      loadProjects();
      setError(null);
    } catch {
      setError("Não foi possível excluir o projeto.");
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleCreateProvision = async (
    projectId: number,
    draft: ProvisionDraft,
  ): Promise<boolean> => {
    setCreatingProvisionProjectId(projectId);
    try {
      const res = await fetch(`${API_URL}/projects/${projectId}/provisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: draft.item,
          estimated_value: draft.estimated_value,
          expected_month: `${draft.expected_month}-01`,
          is_paid: draft.is_paid,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadDetail(projectId);
      loadProjects();
      setError(null);
      return true;
    } catch {
      setError("Não foi possível adicionar o provisionamento.");
      return false;
    } finally {
      setCreatingProvisionProjectId(null);
    }
  };

  const handleUpdateProvision = async (
    projectId: number,
    provisionId: number,
    draft: ProvisionDraft,
  ): Promise<boolean> => {
    setSavingProvisionId(provisionId);
    try {
      const res = await fetch(
        `${API_URL}/projects/${projectId}/provisions/${provisionId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: draft.item,
            estimated_value: draft.estimated_value,
            expected_month: `${draft.expected_month}-01`,
            is_paid: draft.is_paid,
          }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadDetail(projectId);
      loadProjects();
      setError(null);
      return true;
    } catch {
      setError("Não foi possível salvar o provisionamento.");
      return false;
    } finally {
      setSavingProvisionId(null);
    }
  };

  const handleDeleteProvision = async (
    projectId: number,
    provision: ProvisionOut,
  ) => {
    setDeletingProvisionId(provision.id);
    try {
      const res = await fetch(
        `${API_URL}/projects/${projectId}/provisions/${provision.id}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      loadDetail(projectId);
      loadProjects();
      setError(null);
    } catch {
      setError("Não foi possível excluir o provisionamento.");
    } finally {
      setDeletingProvisionId(null);
    }
  };

  const handleCreateProjectSubmit = async (draft: ProjectDraft) => {
    const ok = await handleCreateProject(draft);
    if (ok) setShowCreateForm(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Simulador de Projetos
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Planejamento financeiro futuro: distribua o custo de cada projeto
            por mês para diluir o impacto no orçamento.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className={buttonPrimaryClass}
        >
          <Plus size={16} aria-hidden="true" />
          Novo projeto
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} aria-hidden="true" />
          {error}
        </div>
      )}

      {showCreateForm && (
        <ProjectForm
          initial={emptyProjectDraft()}
          submitting={creatingProject}
          submitLabel="Criar projeto"
          onSubmit={handleCreateProjectSubmit}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {projects === null ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhum projeto cadastrado ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              expanded={expandedId === project.id}
              detail={details[project.id]}
              loadingDetail={loadingDetailId === project.id}
              onToggle={() => handleToggle(project.id)}
              onTogglePaid={(provision) => handleTogglePaid(project.id, provision)}
              togglingId={togglingId}
              savingProject={savingProjectId === project.id}
              onUpdateProject={(draft) => handleUpdateProject(project.id, draft)}
              deletingProject={deletingProjectId === project.id}
              onDeleteProject={() => handleDeleteProject(project.id)}
              creatingProvision={creatingProvisionProjectId === project.id}
              onCreateProvision={(draft) =>
                handleCreateProvision(project.id, draft)
              }
              savingProvisionId={savingProvisionId}
              onUpdateProvision={(provisionId, draft) =>
                handleUpdateProvision(project.id, provisionId, draft)
              }
              deletingProvisionId={deletingProvisionId}
              onDeleteProvision={(provision) =>
                handleDeleteProvision(project.id, provision)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
