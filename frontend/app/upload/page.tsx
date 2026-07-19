"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  checking: "Extrato da conta",
  credit_card: "Fatura do cartão",
};

const boxStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 8,
  padding: "1.25rem",
  marginTop: "1rem",
  background: "#1c1c1e",
};

const buttonStyle: React.CSSProperties = {
  background: "#3d8bfd",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "0.5rem 1rem",
  cursor: "pointer",
  fontSize: "1rem",
};

export default function UploadPage(): ReactNode {
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [ruleRun, setRuleRun] = useState<RuleRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setSending(true);
    setError(null);
    setResult(null);
    setRuleRun(null);
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
        return;
      }
      setResult(data as UploadResult);
    } catch {
      setError(`Não foi possível conectar à API (${API_URL}).`);
    } finally {
      setSending(false);
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

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: 700,
        margin: "0 auto",
        background: "#111",
        color: "#eee",
        minHeight: "100vh",
      }}
    >
      <nav style={{ marginBottom: "1rem", display: "flex", gap: "1rem" }}>
        <Link href="/" style={{ color: "#3d8bfd" }}>
          ← Dashboard
        </Link>
        <Link href="/transactions" style={{ color: "#3d8bfd" }}>
          Listagem de gastos
        </Link>
        <Link href="/categorize" style={{ color: "#3d8bfd" }}>
          Categorizar pendentes
        </Link>
      </nav>
      <h1>Upload de extrato</h1>
      <p style={{ color: "#999" }}>
        Aceita o CSV da conta corrente (<code>NU_XXXXXXXX.csv</code>) ou da
        fatura do cartão exportados no app do Nubank. O formato é detectado
        automaticamente e re-uploads não duplicam transações.
      </p>

      <div style={boxStyle}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setRuleRun(null);
            setError(null);
          }}
          style={{ display: "block", marginBottom: "1rem" }}
        />
        <button
          onClick={upload}
          disabled={!file || sending}
          style={{
            ...buttonStyle,
            opacity: !file || sending ? 0.5 : 1,
            cursor: !file || sending ? "not-allowed" : "pointer",
          }}
        >
          {sending ? "Enviando…" : "Enviar extrato"}
        </button>
      </div>

      {error && (
        <div style={{ ...boxStyle, borderColor: "#e07a5f", color: "#e07a5f" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ ...boxStyle, borderColor: "#5fb878" }}>
          <h3 style={{ marginTop: 0 }}>Importação concluída</h3>
          <ul style={{ lineHeight: 1.8 }}>
            <li>
              Tipo: {KIND_LABEL[result.statement_kind] ?? result.statement_kind}{" "}
              → conta <strong>{result.account_name}</strong>
            </li>
            <li>Linhas no arquivo: {result.total_rows}</li>
            <li>
              Importadas: <strong>{result.imported}</strong>
            </li>
            <li>Duplicadas (ignoradas): {result.skipped_duplicates}</li>
          </ul>
          <button onClick={runRules} style={buttonStyle}>
            Categorizar transações
          </button>
          {ruleRun && (
            <p style={{ color: "#5fb878" }}>
              {ruleRun.categorized} de {ruleRun.scanned} transações sem
              categoria foram categorizadas pelas regras.{" "}
              <Link href="/transactions" style={{ color: "#3d8bfd" }}>
                Ver gastos →
              </Link>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
