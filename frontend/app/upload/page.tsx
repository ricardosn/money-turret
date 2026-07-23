"use client";

import Link from "next/link";
import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { buttonPrimaryClass, buttonSecondaryClass, cardClass } from "@/lib/ui";

const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ACCEPTED_EXTENSIONS = [".csv", ".ofx", ".pdf"];

interface UploadResult {
  statement_kind: string;
  account_name: string;
  total_rows: number;
  imported: number;
  skipped_duplicates: number;
}

interface RuleRunResult {
  scanned: number;
  categorized: number;
}

const KIND_LABEL: Record<string, string> = {
  checking: "Extrato da conta (Nubank)",
  credit_card: "Fatura do cartão (Nubank)",
  itau_checking: "Extrato da conta (Itaú, PDF)",
};

type UploadState = "idle" | "uploading" | "success" | "error";

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage(): ReactNode {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [ruleRun, setRuleRun] = useState<RuleRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetOutcome = () => {
    setResult(null);
    setRuleRun(null);
    setError(null);
    setValidationError(null);
  };

  const acceptFile = useCallback((candidate: File) => {
    resetOutcome();
    setState("idle");
    if (!hasAcceptedExtension(candidate.name)) {
      setFile(null);
      setValidationError(
        `Formato não suportado. Envie um arquivo ${ACCEPTED_EXTENSIONS.join(" ou ")}.`,
      );
      return;
    }
    setFile(candidate);
  }, []);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
  };

  const clearFile = () => {
    setFile(null);
    resetOutcome();
    setState("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = async () => {
    if (!file) return;
    setState("uploading");
    resetOutcome();
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_URL}/statements/upload`, {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail ?? "Falha no upload.");
        setState("error");
        return;
      }
      setResult(data as UploadResult);
      setState("success");
    } catch {
      setError(`Não foi possível conectar à API (${API_URL}).`);
      setState("error");
    }
  };

  const runRules = async () => {
    setError(null);
    try {
      const response = await fetch(`${API_URL}/categorization/run`, {
        method: "POST",
      });
      setRuleRun((await response.json()) as RuleRunResult);
    } catch {
      setError(`Não foi possível conectar à API (${API_URL}).`);
    }
  };

  const dropzoneBorder = validationError
    ? "border-red-600 bg-red-950/10"
    : dragging
      ? "border-blue-500 bg-blue-950/20"
      : file
        ? "border-slate-600 bg-slate-900"
        : "border-slate-700 hover:border-slate-600";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">
          Upload de extrato
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Aceita o CSV da conta corrente (<code>NU_XXXXXXXX.csv</code>) ou da
          fatura do cartão exportados no app do Nubank, e o PDF do extrato de
          conta corrente do Itaú. O formato é detectado automaticamente e
          re-uploads não duplicam transações.
        </p>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        aria-label="Área para soltar ou selecionar arquivo de extrato"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`focus-ring flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${dropzoneBorder}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.ofx,.pdf,text/csv,application/pdf"
          className="sr-only"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) acceptFile(selected);
          }}
        />

        {file ? (
          <>
            <FileText size={32} className="text-blue-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-slate-100">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {formatBytes(file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="focus-ring mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <X size={13} aria-hidden="true" />
              Remover e escolher outro
            </button>
          </>
        ) : (
          <>
            <UploadCloud
              size={32}
              className={dragging ? "text-blue-400" : "text-slate-500"}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-slate-200">
                Arraste o arquivo aqui ou clique para selecionar
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Formatos aceitos: {ACCEPTED_EXTENSIONS.join(", ")} — extrato
                Nubank (CSV) ou extrato de conta Itaú (PDF)
              </p>
            </div>
          </>
        )}
      </div>

      {validationError && (
        <div className="flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} aria-hidden="true" />
          {validationError}
        </div>
      )}

      {file && !validationError && (
        <button
          onClick={upload}
          disabled={state === "uploading"}
          className={`${buttonPrimaryClass} self-start`}
        >
          {state === "uploading" ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Enviando…
            </>
          ) : (
            <>
              <UploadCloud size={16} aria-hidden="true" />
              Enviar extrato
            </>
          )}
        </button>
      )}

      {state === "error" && error && (
        <div className="flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} aria-hidden="true" />
          {error}
        </div>
      )}

      {state === "success" && result && (
        <div className={`${cardClass} border-emerald-900/60 bg-emerald-950/10 p-5`}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <CheckCircle2 size={17} aria-hidden="true" />
            Importação concluída
          </h3>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
            <li>
              Tipo: {KIND_LABEL[result.statement_kind] ?? result.statement_kind}{" "}
              → conta <strong className="text-slate-100">{result.account_name}</strong>
            </li>
            <li>Linhas no arquivo: {result.total_rows}</li>
            <li>
              Importadas:{" "}
              <strong className="text-slate-100">{result.imported}</strong>
            </li>
            <li>Duplicadas (ignoradas): {result.skipped_duplicates}</li>
          </ul>
          <button onClick={runRules} className={`${buttonPrimaryClass} mt-4`}>
            Categorizar transações
          </button>
          {ruleRun && (
            <p className="mt-3 text-sm text-emerald-400">
              {ruleRun.categorized} de {ruleRun.scanned} transações sem
              categoria foram categorizadas pelas regras.{" "}
              <Link
                href="/transactions"
                className="font-medium text-blue-400 hover:text-blue-300"
              >
                Ver transações →
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
