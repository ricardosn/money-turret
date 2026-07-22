"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PAGE_SIZE = 50;

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
  category_name: string | null;
  account_name: string;
}

interface TransactionPage {
  total: number;
  limit: number;
  offset: number;
  items: Transaction[];
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
  padding: "0.4rem 0.6rem",
};

const cellStyle: React.CSSProperties = {
  border: "1px solid #333",
  padding: "0.4rem 0.6rem",
  fontSize: "0.9rem",
};

export default function TransactionsPage(): ReactNode {
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState<TransactionPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("expenses");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetch(`${API_URL}/categories`)
      .then((r) => r.json() as Promise<Category[]>)
      .then(setCategories)
      .catch(() => setError(`Não foi possível carregar a API (${API_URL}).`));
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (search) params.set("search", search);
    if (categoryFilter === "uncategorized") params.set("uncategorized", "true");
    else if (categoryFilter) params.set("category_id", categoryFilter);
    if (typeFilter === "expenses") params.set("expenses_only", "true");
    else if (typeFilter === "incomes") params.set("incomes_only", "true");

    fetch(`${API_URL}/transactions?${params}`)
      .then((r) => r.json() as Promise<TransactionPage>)
      .then((p) => {
        setPage(p);
        setError(null);
      })
      .catch(() => setError(`Não foi possível carregar a API (${API_URL}).`));
  }, [dateFrom, dateTo, search, categoryFilter, typeFilter, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setOffset(0);
    load();
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
        <Link href="/upload" style={{ color: "#3d8bfd" }}>
          Upload de extrato
        </Link>
        <Link href="/categorize" style={{ color: "#3d8bfd" }}>
          Categorizar pendentes
        </Link>
      </nav>
      <h1>Gastos</h1>
      {error && <p style={{ color: "#e07a5f" }}>{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "end",
          margin: "1rem 0 1.5rem",
        }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: "0.8rem" }}>
          De
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: "0.8rem" }}>
          Até
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: "0.8rem" }}>
          Tipo
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setOffset(0);
            }}
            style={inputStyle}
          >
            <option value="expenses">Gastos</option>
            <option value="incomes">Entradas</option>
            <option value="all">Todas</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: "0.8rem" }}>
          Categoria
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="">Todas</option>
            <option value="uncategorized">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id !== null ? "  " : ""}
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: "0.8rem", flex: 1 }}>
          Descrição
          <input
            type="text"
            placeholder="ex: supermercado, ifood…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
        </label>
        <button
          type="submit"
          style={{ ...inputStyle, cursor: "pointer", background: "#3d8bfd" }}
        >
          Filtrar
        </button>
      </form>

      {page === null ? (
        <p>Carregando…</p>
      ) : page.items.length === 0 ? (
        <p>Nenhuma transação encontrada com esses filtros.</p>
      ) : (
        <>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Data</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Descrição</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Operação</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Categoria</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Conta</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((t) => {
                const amount = Number(t.amount);
                return (
                  <tr key={t.id}>
                    <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                      {t.occurred_at}
                    </td>
                    <td style={cellStyle}>{t.description}</td>
                    <td style={{ ...cellStyle, color: "#999" }}>
                      {t.operation ?? "—"}
                    </td>
                    <td style={cellStyle}>
                      {t.category_name ?? (
                        <span style={{ color: "#e07a5f" }}>Sem categoria</span>
                      )}
                    </td>
                    <td style={{ ...cellStyle, color: "#999" }}>
                      {t.account_name}
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
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              marginTop: "1rem",
            }}
          >
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: "0.85rem", color: "#999" }}>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} de{" "}
              {page.total}
            </span>
            <button
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              Próxima →
            </button>
          </div>
        </>
      )}
    </main>
  );
}
