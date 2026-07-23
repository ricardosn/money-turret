"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { buttonSecondaryClass, cardClass, inputClass, labelClass } from "@/lib/ui";

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

interface ApiError {
  detail?: string;
}

interface TransactionPage {
  total: number;
  limit: number;
  offset: number;
  items: Transaction[];
}

type SortKey = "occurred_at" | "description" | "amount";
type SortDir = "asc" | "desc";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  align,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: SortDir;
  align: "left" | "center" | "right";
  onSort: (key: SortKey) => void;
}): ReactNode {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  const justify =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";

  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-3 py-2.5 font-medium text-slate-400"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`focus-ring flex w-full items-center gap-1 rounded ${justify} ${
          active ? "text-slate-100" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        {label}
        <Icon size={13} aria-hidden="true" className="shrink-0 opacity-70" />
      </button>
    </th>
  );
}

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

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  const handleDelete = async (transaction: Transaction) => {
    const confirmed = window.confirm(
      `Excluir a transação "${transaction.description}" de ${transaction.occurred_at} (${brl.format(Number(transaction.amount))})? Essa ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setDeletingId(transaction.id);
    try {
      const res = await fetch(`${API_URL}/transactions/${transaction.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(body?.detail ?? `Falha ao excluir (HTTP ${res.status}).`);
      }
      setError(null);
      // Se era o único item da página, volta uma página para não ficar vazia.
      if (page && page.items.length === 1 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
      } else {
        load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir a transação.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const items = useMemo(() => {
    if (!page) return [];
    if (!sortKey) return page.items;
    const sorted = [...page.items].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "amount") cmp = Number(a.amount) - Number(b.amount);
      else cmp = a[sortKey].localeCompare(b[sortKey]);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [page, sortKey, sortDir]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Transações</h1>
        <p className="mt-1 text-sm text-slate-400">
          Filtre, ordene e audite os lançamentos importados.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} aria-hidden="true" />
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
        className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}
      >
        <label className={labelClass}>
          De
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Até
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Tipo
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setOffset(0);
            }}
            className={inputClass}
          >
            <option value="expenses">Gastos</option>
            <option value="incomes">Entradas</option>
            <option value="all">Todas</option>
          </select>
        </label>
        <label className={labelClass}>
          Categoria
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">Todas</option>
            <option value="uncategorized">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id !== null ? "  " : ""}
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} min-w-[220px] flex-1`}>
          Descrição
          <input
            type="text"
            placeholder="ex: supermercado, ifood…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" className={buttonSecondaryClass}>
          Filtrar
        </button>
      </form>

      {page === null ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhuma transação encontrada com esses filtros.
        </p>
      ) : (
        <>
          <div
            className={`${cardClass} max-h-[65vh] overflow-auto`}
            role="region"
            aria-label="Tabela de transações"
          >
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <SortableHeader
                    label="Data"
                    sortKey="occurred_at"
                    activeKey={sortKey}
                    dir={sortDir}
                    align="center"
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Descrição"
                    sortKey="description"
                    activeKey={sortKey}
                    dir={sortDir}
                    align="left"
                    onSort={handleSort}
                  />
                  <th
                    scope="col"
                    className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-left font-medium text-slate-400"
                  >
                    Operação
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-left font-medium text-slate-400"
                  >
                    Categoria
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-left font-medium text-slate-400"
                  >
                    Conta
                  </th>
                  <SortableHeader
                    label="Valor"
                    sortKey="amount"
                    activeKey={sortKey}
                    dir={sortDir}
                    align="right"
                    onSort={handleSort}
                  />
                  <th
                    scope="col"
                    className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-3 py-2.5 text-center font-medium text-slate-400"
                  >
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const amount = Number(t.amount);
                  const isExpense = amount < 0;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums text-slate-300">
                        {t.occurred_at}
                      </td>
                      <td className="px-3 py-2 text-slate-100">
                        {t.description}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {t.operation ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {t.category_name ?? (
                          <span className="inline-flex items-center rounded-full border border-amber-900/60 bg-amber-950/30 px-2 py-0.5 text-xs text-amber-400">
                            Sem categoria
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {t.account_name}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          isExpense ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          {isExpense ? (
                            <ArrowDownRight
                              size={13}
                              className="shrink-0 opacity-80"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowUpRight
                              size={13}
                              className="shrink-0 opacity-80"
                              aria-hidden="true"
                            />
                          )}
                          {brl.format(amount)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          disabled={deletingId === t.id}
                          aria-label={`Excluir transação: ${t.description}`}
                          title="Excluir transação"
                          className="focus-ring inline-flex items-center justify-center rounded p-1 text-slate-500 transition-colors hover:bg-red-950/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className={buttonSecondaryClass}
            >
              ← Anterior
            </button>
            <span className="text-xs text-slate-500">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} de{" "}
              {page.total}
            </span>
            <button
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className={buttonSecondaryClass}
            >
              Próxima →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
