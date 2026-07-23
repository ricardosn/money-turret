"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { cardClass } from "@/lib/ui";

const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface FixedVariablePoint {
  month: string;
  fixed: string;
  variable: string;
}

interface LifestyleCell {
  month: string;
  category: string;
  total: string;
}

interface FixedVariableRow {
  month: string;
  fixo: number;
  variavel: number;
}

// Ordem fixa das categorias de estilo de vida acompanhadas (CLAUDE.md §4):
// hobbies, outdoor, restaurantes/churrascarias. A cor segue a categoria, não
// a posição — assim o filtro de séries visíveis nunca repinta as demais.
const LIFESTYLE_SERIES: { key: string; color: string }[] = [
  { key: "Boardgames", color: "#3987e5" },
  { key: "Outdoor / Trilhas", color: "#d95926" },
  { key: "Restaurantes", color: "#199e70" },
  { key: "Churrascarias", color: "#c98500" },
  { key: "Cantinas Italianas", color: "#d55181" },
  { key: "Fast-food", color: "#9085e9" },
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

function FixedVariableChart({ data }: { data: FixedVariableRow[] }): ReactNode {
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

function LifestyleTrendChart({ cells }: { cells: LifestyleCell[] }): ReactNode {
  const months = [...new Set(cells.map((c) => c.month))].sort();
  const rows = months.map((month) => {
    const row: Record<string, number | string> = { month };
    for (const c of cells.filter((c) => c.month === month)) {
      row[c.category] = Number(c.total);
    }
    return row;
  });

  // Só plota séries com pelo menos um mês de gasto, mas a cor de cada
  // categoria é fixa (definida em LIFESTYLE_SERIES), nunca reatribuída.
  const activeSeries = LIFESTYLE_SERIES.filter((s) =>
    cells.some((c) => c.category === s.key && Number(c.total) > 0),
  );

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows}>
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
        {activeSeries.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: s.color }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function HomePage(): ReactNode {
  const [fixedVariable, setFixedVariable] = useState<FixedVariableRow[] | null>(
    null,
  );
  const [lifestyle, setLifestyle] = useState<LifestyleCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/analytics/fixed-vs-variable`).then(
        (r) => r.json() as Promise<FixedVariablePoint[]>,
      ),
      fetch(`${API_URL}/analytics/lifestyle-trend`).then(
        (r) => r.json() as Promise<LifestyleCell[]>,
      ),
    ])
      .then(([fv, trend]) => {
        setFixedVariable(
          fv.map((p) => ({
            month: p.month,
            fixo: Number(p.fixed),
            variavel: Number(p.variable),
          })),
        );
        setLifestyle(trend);
      })
      .catch(() =>
        setError(`Não foi possível carregar os dados da API (${API_URL}).`),
      );
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Visão consolidada de custos fixos, variáveis e tendência de estilo
          de vida.
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
        <SectionHeading>Tendência de estilo de vida</SectionHeading>
        <p className="mt-1 text-sm text-slate-400">
          Evolução mensal de hobbies, outdoor e restaurantes/churrascarias —
          acompanhe sinais de inflação no padrão de vida.
        </p>
        <div className="mt-4">
          {lifestyle === null ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : lifestyle.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sem dados suficientes ainda. Categorize gastos de Boardgames,
              Outdoor / Trilhas, Restaurantes, Churrascarias, Cantinas
              Italianas ou Fast-food para ver a tendência.
            </p>
          ) : (
            <LifestyleTrendChart cells={lifestyle} />
          )}
        </div>
      </section>
    </div>
  );
}
