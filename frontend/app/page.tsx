"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { cardClass, inputClass } from "@/lib/ui";

const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface FixedVariablePoint {
  month: string;
  fixed: string;
  variable: string;
}

interface CohortCell {
  month: string;
  category: string;
  total: string;
}

interface ChartPoint {
  month: string;
  fixo: number;
  variavel: number;
}

interface CategoryShareItem {
  category: string;
  total: string;
  percentage: number;
}

interface CategoryShare {
  month: string | null;
  total: string;
  items: CategoryShareItem[];
}

const PIE_COLORS = [
  "#60a5fa",
  "#f87171",
  "#4ade80",
  "#fbbf24",
  "#c084fc",
  "#2dd4bf",
  "#f472b6",
  "#94a3b8",
];

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const tooltipStyle: React.CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: "0.85rem",
};

function SectionHeading({ children }: { children: ReactNode }): ReactNode {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </h2>
  );
}

function FixedVariableChart({ data }: { data: ChartPoint[] }): ReactNode {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
        <YAxis
          stroke="#64748b"
          fontSize={12}
          tickFormatter={(v: number) => brl.format(v)}
          width={100}
        />
        <Tooltip
          formatter={(value) => brl.format(Number(value))}
          contentStyle={tooltipStyle}
        />
        <Legend wrapperStyle={{ fontSize: "0.8rem", color: "#94a3b8" }} />
        <Bar dataKey="fixo" stackId="a" name="Custo fixo" fill="#f87171" />
        <Bar
          dataKey="variavel"
          stackId="a"
          name="Custo variável"
          fill="#60a5fa"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CohortHeatmap({ cells }: { cells: CohortCell[] }): ReactNode {
  const months = [...new Set(cells.map((c) => c.month))].sort();
  const categories = [...new Set(cells.map((c) => c.category))].sort();
  const value = new Map(
    cells.map((c) => [`${c.month}|${c.category}`, Number(c.total)]),
  );
  const max = Math.max(...cells.map((c) => Number(c.total)), 1);

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border-b border-slate-800 bg-slate-900 px-3 py-2 text-left font-medium text-slate-400">
              Categoria
            </th>
            {months.map((m) => (
              <th
                key={m}
                className="border-b border-slate-800 px-3 py-2 text-center font-medium text-slate-400"
              >
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat}>
              <td className="sticky left-0 whitespace-nowrap border-b border-slate-800/70 bg-slate-950 px-3 py-1.5 text-left text-slate-300">
                {cat}
              </td>
              {months.map((m) => {
                const v = value.get(`${m}|${cat}`);
                const intensity = v ? 0.15 + 0.85 * (v / max) : 0;
                return (
                  <td
                    key={m}
                    className="border-b border-slate-800/70 px-3 py-1.5 text-right tabular-nums text-slate-200"
                    style={{
                      background: v
                        ? `rgba(96, 165, 250, ${intensity.toFixed(2)})`
                        : "transparent",
                    }}
                    title={v ? brl.format(v) : "—"}
                  >
                    {v ? brl.format(v) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryShareChart({ share }: { share: CategoryShare }): ReactNode {
  const data = share.items.map((i) => ({
    name: i.category,
    value: Number(i.total),
    percentage: i.percentage,
  }));
  return (
    <ResponsiveContainer width="100%" height={360}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={130}
          label={({ index }) => {
            const item = data[index ?? 0];
            return `${item.name} (${item.percentage}%)`;
          }}
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={PIE_COLORS[index % PIE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, _name, item) => [
            `${brl.format(Number(value))} (${item?.payload?.percentage}%)`,
          ]}
          contentStyle={tooltipStyle}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function HomePage(): ReactNode {
  const [fixedVariable, setFixedVariable] = useState<ChartPoint[] | null>(null);
  const [cohort, setCohort] = useState<CohortCell[] | null>(null);
  const [share, setShare] = useState<CategoryShare | null>(null);
  const [shareMonth, setShareMonth] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/analytics/fixed-vs-variable`).then(
        (r) => r.json() as Promise<FixedVariablePoint[]>,
      ),
      fetch(`${API_URL}/analytics/category-cohort`).then(
        (r) => r.json() as Promise<CohortCell[]>,
      ),
    ])
      .then(([fv, cells]) => {
        setFixedVariable(
          fv.map((p) => ({
            month: p.month,
            fixo: Number(p.fixed),
            variavel: Number(p.variable),
          })),
        );
        setCohort(cells);
      })
      .catch(() =>
        setError(`Não foi possível carregar os dados da API (${API_URL}).`),
      );
  }, []);

  useEffect(() => {
    const params = shareMonth ? `?month=${shareMonth}` : "";
    fetch(`${API_URL}/analytics/category-share${params}`)
      .then((r) => r.json() as Promise<CategoryShare>)
      .then((s) => {
        setShare(s);
        if (!shareMonth && s.month) setShareMonth(s.month);
      })
      .catch(() =>
        setError(`Não foi possível carregar os dados da API (${API_URL}).`),
      );
  }, [shareMonth]);

  const availableMonths = cohort
    ? [...new Set(cohort.map((c) => c.month))].sort().reverse()
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Visão consolidada de custos fixos, variáveis e distribuição por
          categoria.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} aria-hidden="true" />
          {error}
        </div>
      )}

      <section className={`${cardClass} p-5`}>
        <SectionHeading>Custo fixo vs variável (mensal)</SectionHeading>
        <div className="mt-4">
          {fixedVariable === null ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : fixedVariable.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sem despesas registradas. Importe um extrato em /upload.
            </p>
          ) : (
            <FixedVariableChart data={fixedVariable} />
          )}
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading>Gastos do mês por categoria</SectionHeading>
          {availableMonths.length > 0 && (
            <select
              value={shareMonth}
              onChange={(e) => setShareMonth(e.target.value)}
              className={inputClass}
              aria-label="Selecionar mês"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-4">
          {share === null ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : share.items.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sem despesas no mês selecionado.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-400">
                Total do mês:{" "}
                <span className="font-medium tabular-nums text-slate-200">
                  {brl.format(Number(share.total))}
                </span>
              </p>
              <CategoryShareChart share={share} />
            </>
          )}
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <SectionHeading>Coorte de gastos por categoria</SectionHeading>
        <div className="mt-4">
          {cohort === null ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : cohort.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados para exibir.</p>
          ) : (
            <CohortHeatmap cells={cohort} />
          )}
        </div>
      </section>
    </div>
  );
}
