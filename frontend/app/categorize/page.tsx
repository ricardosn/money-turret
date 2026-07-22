"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PAGE_SIZE = 25;

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

interface Transaction {
  id: number;
  occurred_at: string;
  description: string;
  operation: string | null;
  amount: string;
}

interface TransactionPage {
  total: number;
  items: Transaction[];
}

interface CategorizeResult {
  category_name: string;
  rule_created: boolean;
  additional_categorized: number;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const inputStyle: React.CSSProperties = {
  background: "#1c1c1e",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "0.35rem 0.5rem",
  fontSize: "0.85rem",
};

const cellStyle: React.CSSProperties = {
  border: "1px solid #333",
  padding: "0.4rem 0.6rem",
  fontSize: "0.9rem",
};

export default function CategorizePage(): ReactNode {
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState<TransactionPage | null>(null);
  const [drafts, setDrafts] = useState<
    Record<number, { categoryId: string; keyword: string }>
  >({});
  const [saving, setSaving] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/categories`)
      .then((r) => r.json() as Promise<Category[]>)
      .then(setCategories)
      .catch(() => setError(`Não foi possível carregar a API (${API_URL}).`));
  }, []);

  const load = useCallback(() => {
    fetch(
      `${API_URL}/transactions?uncategorized=true&exclude_internal=true&expenses_only=true&limit=${PAGE_SIZE}`,
    )
      .then((r) => r.json() as Promise<TransactionPage>)
      .then((p) => {
        setPage(p);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const t of p.items) {
            if (!next[t.id]) {
              next[t.id] = {
                categoryId: "",
                keyword: t.description.toLowerCase(),
              };
            }
          }
          return next;
        });
      })
      .catch(() => setError(`Não foi possível carregar a API (${API_URL}).`));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categorize = async (transaction: Transaction) => {
    const draft = drafts[transaction.id];
    if (!draft?.categoryId) return;
    setSaving(transaction.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `${API_URL}/transactions/${transaction.id}/categorize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: Number(draft.categoryId),
            keyword: draft.keyword.trim() || null,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail ?? "Falha ao categorizar.");
        return;
      }
      const result = data as CategorizeResult;
      const extra =
        result.additional_categorized > 0
          ? ` A regra categorizou mais ${result.additional_categorized} transação(ões) parecida(s).`
          : "";
      setMessage(
        `"${transaction.description}" → ${result.category_name}.` +
          (result.rule_created ? ` Regra criada.${extra}` : ""),
      );
      load();
    } catch {
      setError(`Não foi possível conectar à API (${API_URL}).`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: 1100,
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
        <Link href="/upload" style={{ color: "#3d8bfd" }}>
          Upload de extrato
        </Link>
      </nav>
      <h1>Categorizar pendentes</h1>
      <p style={{ color: "#999" }}>
        Escolha a categoria e ajuste a palavra-chave: ela vira uma regra que
        categoriza automaticamente transações parecidas — inclusive em uploads
        futuros. Deixe a palavra-chave vazia para categorizar só esta
        transação.
      </p>

      {message && <p style={{ color: "#5fb878" }}>{message}</p>}
      {error && <p style={{ color: "#e07a5f" }}>{error}</p>}

      {page === null ? (
        <p>Carregando…</p>
      ) : page.items.length === 0 ? (
        <p>
          Nenhuma transação pendente de categorização.{" "}
          <Link href="/" style={{ color: "#3d8bfd" }}>
            Ver dashboard →
          </Link>
        </p>
      ) : (
        <>
          <p style={{ color: "#999", fontSize: "0.85rem" }}>
            {page.total} transação(ões) sem categoria (mostrando até{" "}
            {PAGE_SIZE} por vez; a lista recarrega ao categorizar).
          </p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Data</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Descrição</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Valor</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Categoria</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>
                  Palavra-chave da regra
                </th>
                <th style={cellStyle} />
              </tr>
            </thead>
            <tbody>
              {page.items.map((t) => {
                const draft = drafts[t.id] ?? { categoryId: "", keyword: "" };
                const amount = Number(t.amount);
                return (
                  <tr key={t.id}>
                    <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                      {t.occurred_at}
                    </td>
                    <td style={cellStyle}>
                      {t.description}
                      {t.operation && (
                        <span
                          style={{
                            display: "block",
                            color: "#777",
                            fontSize: "0.75rem",
                          }}
                        >
                          {t.operation}
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: amount < 0 ? "#e07a5f" : "#5fb878",
                      }}
                    >
                      {brl.format(amount)}
                    </td>
                    <td style={cellStyle}>
                      <select
                        value={draft.categoryId}
                        onChange={(e) =>
                          setDrafts({
                            ...drafts,
                            [t.id]: { ...draft, categoryId: e.target.value },
                          })
                        }
                        style={inputStyle}
                      >
                        <option value="">Selecione…</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.parent_id !== null ? "  " : ""}
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={cellStyle}>
                      <input
                        type="text"
                        value={draft.keyword}
                        onChange={(e) =>
                          setDrafts({
                            ...drafts,
                            [t.id]: { ...draft, keyword: e.target.value },
                          })
                        }
                        style={{ ...inputStyle, width: "100%" }}
                      />
                    </td>
                    <td style={cellStyle}>
                      <button
                        onClick={() => categorize(t)}
                        disabled={!draft.categoryId || saving === t.id}
                        style={{
                          ...inputStyle,
                          background: "#3d8bfd",
                          color: "#fff",
                          cursor:
                            !draft.categoryId || saving === t.id
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            !draft.categoryId || saving === t.id ? 0.5 : 1,
                        }}
                      >
                        {saving === t.id ? "Salvando…" : "Categorizar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
