"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  Loader2,
  Search,
} from "lucide-react";
import { buttonPrimaryClass, cardClass, inputClass } from "@/lib/ui";

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

export default function CategorizePage(): ReactNode {
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState<TransactionPage | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  const [categorySearch, setCategorySearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );
  const [keyword, setKeyword] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Record<number, HTMLLIElement | null>>({});

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
        setActiveId((current) => {
          if (current !== null && p.items.some((t) => t.id === current)) {
            return current;
          }
          return p.items[0]?.id ?? null;
        });
      })
      .catch(() => setError(`Não foi possível carregar a API (${API_URL}).`));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(
    () => page?.items.find((t) => t.id === activeId) ?? null,
    [page, activeId],
  );

  // Reset the per-transaction draft whenever the focused transaction changes.
  useEffect(() => {
    setCategorySearch("");
    setSelectedCategory(null);
    setHighlightedIndex(0);
    setDropdownOpen(false);
    setKeyword(active ? active.description.toLowerCase() : "");
  }, [active?.id]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [categorySearch]);

  const selectCategory = (category: Category) => {
    setSelectedCategory(category);
    setCategorySearch(category.name);
    setDropdownOpen(false);
    keywordInputRef.current?.focus();
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDropdownOpen(true);
      setHighlightedIndex((i) =>
        Math.min(i + 1, filteredCategories.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDropdownOpen(true);
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const choice = filteredCategories[highlightedIndex];
      if (choice) selectCategory(choice);
    } else if (e.key === "Escape") {
      setCategorySearch("");
      setDropdownOpen(false);
    }
  };

  useEffect(() => {
    const el = filteredCategories[highlightedIndex];
    if (el) optionRefs.current[el.id]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, filteredCategories]);

  const categorize = async () => {
    if (!active || !selectedCategory) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `${API_URL}/transactions/${active.id}/categorize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: selectedCategory.id,
            keyword: keyword.trim() || null,
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
        `"${active.description}" → ${result.category_name}.` +
          (result.rule_created ? ` Regra criada.${extra}` : ""),
      );
      load();
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } catch {
      setError(`Não foi possível conectar à API (${API_URL}).`);
    } finally {
      setSaving(false);
    }
  };

  const onKeywordKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      categorize();
    }
  };

  const queue = page?.items.filter((t) => t.id !== activeId) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">
          Categorização de pendentes
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Busque a categoria (↑↓ para navegar, Enter para escolher), ajuste a
          palavra-chave e pressione Enter para salvar. A regra criada
          categoriza automaticamente transações parecidas.
        </p>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 size={16} aria-hidden="true" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} aria-hidden="true" />
          {error}
        </div>
      )}

      {page === null ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !active ? (
        <p className="text-sm text-slate-500">
          Nenhuma transação pendente de categorização.{" "}
          <Link href="/" className="font-medium text-blue-400 hover:text-blue-300">
            Ver dashboard →
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className={`${cardClass} p-6`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {page.total} transação(ões) sem categoria
            </p>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs tabular-nums text-slate-500">
                  {active.occurred_at}
                </p>
                <p className="mt-1 text-lg font-medium text-slate-100">
                  {active.description}
                </p>
                {active.operation && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Operação original: {active.operation}
                  </p>
                )}
              </div>
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-xl font-semibold tabular-nums text-rose-400">
                <ArrowDownRight size={18} aria-hidden="true" />
                {brl.format(Number(active.amount))}
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <div className="relative">
                <label
                  htmlFor="category-search"
                  className="mb-1 block text-xs font-medium text-slate-400"
                >
                  Categoria
                </label>
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="category-search"
                    ref={searchInputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    aria-controls="category-listbox"
                    aria-activedescendant={
                      filteredCategories[highlightedIndex]
                        ? `cat-opt-${filteredCategories[highlightedIndex].id}`
                        : undefined
                    }
                    autoComplete="off"
                    placeholder="Digite para buscar…"
                    value={categorySearch}
                    onFocus={() => setDropdownOpen(true)}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setSelectedCategory(null);
                      setDropdownOpen(true);
                    }}
                    onKeyDown={onSearchKeyDown}
                    onBlur={() =>
                      setTimeout(() => setDropdownOpen(false), 120)
                    }
                    className={`${inputClass} w-full pl-8`}
                  />
                </div>
                {dropdownOpen && filteredCategories.length > 0 && (
                  <ul
                    id="category-listbox"
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-700 bg-slate-900 py-1 shadow-lg"
                  >
                    {filteredCategories.map((c, index) => (
                      <li
                        key={c.id}
                        id={`cat-opt-${c.id}`}
                        role="option"
                        aria-selected={index === highlightedIndex}
                        ref={(el) => {
                          optionRefs.current[c.id] = el;
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectCategory(c);
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`cursor-pointer px-3 py-1.5 text-sm ${
                          c.parent_id !== null ? "pl-6 text-slate-300" : "text-slate-100"
                        } ${
                          index === highlightedIndex
                            ? "bg-blue-600/30 text-white"
                            : ""
                        }`}
                      >
                        {c.name}
                      </li>
                    ))}
                  </ul>
                )}
                {dropdownOpen &&
                  categorySearch &&
                  filteredCategories.length === 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-500">
                      Nenhuma categoria encontrada.
                    </div>
                  )}
              </div>

              <label htmlFor="keyword" className="text-xs font-medium text-slate-400">
                Palavra-chave da regra
                <input
                  id="keyword"
                  ref={keywordInputRef}
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={onKeywordKeyDown}
                  placeholder="deixe em branco para categorizar só esta transação"
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>

              <div className="flex items-center gap-3">
                <button
                  onClick={categorize}
                  disabled={!selectedCategory || saving}
                  className={buttonPrimaryClass}
                >
                  {saving ? (
                    <>
                      <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                      Salvando…
                    </>
                  ) : (
                    "Categorizar (Enter)"
                  )}
                </button>
                <span className="text-xs text-slate-500">
                  ↑↓ navegar categoria · Enter selecionar/salvar
                </span>
              </div>
            </div>
          </div>

          <aside className={`${cardClass} h-fit p-4`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Fila ({queue.length} de {page.items.length} nesta página)
            </p>
            <ul className="mt-3 flex flex-col gap-1">
              {queue.length === 0 && (
                <li className="text-xs text-slate-600">
                  Última transação desta página.
                </li>
              )}
              {queue.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className="focus-ring flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-slate-800/60"
                  >
                    <span className="truncate text-sm text-slate-200">
                      {t.description}
                    </span>
                    <span className="flex items-center justify-between text-xs text-slate-500">
                      <span className="tabular-nums">{t.occurred_at}</span>
                      <span className="tabular-nums text-rose-400/80">
                        {brl.format(Number(t.amount))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
