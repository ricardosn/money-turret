"use client";

import Link from "next/link";
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
  "#3d8bfd",
  "#e07a5f",
  "#5fb878",
  "#f2cc60",
  "#9b72cf",
  "#4ecdc4",
  "#e56399",
  "#8d99ae",
];

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function FixedVariableChart({ data }: { data: ChartPoint[] }): ReactNode {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="month" stroke="#aaa" />
        <YAxis stroke="#aaa" tickFormatter={(v: number) => brl.format(v)} width={100} />
        <Tooltip
          formatter={(value) => brl.format(Number(value))}
          contentStyle={{ background: "#1c1c1e", border: "1px solid #444" }}
        />
        <Legend />
        <Bar dataKey="fixo" stackId="a" name="Custo fixo" fill="#e07a5f" />
        <Bar dataKey="variavel" stackId="a" name="Custo variável" fill="#3d8bfd" />
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
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th style={cellStyle}>Categoria</th>
          {months.map((m) => (
            <th key={m} style={cellStyle}>
              {m}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((cat) => (
          <tr key={cat}>
            <td style={{ ...cellStyle, textAlign: "left" }}>{cat}</td>
            {months.map((m) => {
              const v = value.get(`${m}|${cat}`);
              const intensity = v ? 0.15 + 0.85 * (v / max) : 0;
              return (
                <td
                  key={m}
                  style={{
                    ...cellStyle,
                    background: v
                      ? `rgba(224, 122, 95, ${intensity.toFixed(2)})`
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
          contentStyle={{ background: "#1c1c1e", border: "1px solid #444" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

const cellStyle: React.CSSProperties = {
  border: "1px solid #333",
  padding: "0.4rem 0.6rem",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  fontSize: "0.85rem",
};

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
      <h1>Money Turret</h1>
      <nav style={{ marginBottom: "1rem", display: "flex", gap: "1rem" }}>
        <Link href="/transactions" style={{ color: "#3d8bfd" }}>
          Listagem de gastos
        </Link>
        <Link href="/upload" style={{ color: "#3d8bfd" }}>
          Upload de extrato
        </Link>
        <Link href="/categorize" style={{ color: "#3d8bfd" }}>
          Categorizar pendentes
        </Link>
      </nav>
      {error && <p style={{ color: "#e07a5f" }}>{error}</p>}

      <section style={{ marginTop: "2rem" }}>
        <h2>Custo fixo vs variável (mensal)</h2>
        {fixedVariable === null ? (
          <p>Carregando…</p>
        ) : fixedVariable.length === 0 ? (
          <p>Sem despesas registradas. Importe um extrato em /statements/upload.</p>
        ) : (
          <FixedVariableChart data={fixedVariable} />
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          Gastos do mês por categoria
          {availableMonths.length > 0 && (
            <select
              value={shareMonth}
              onChange={(e) => setShareMonth(e.target.value)}
              style={{
                background: "#1c1c1e",
                color: "#eee",
                border: "1px solid #444",
                borderRadius: 4,
                padding: "0.3rem 0.5rem",
                fontSize: "1rem",
              }}
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </h2>
        {share === null ? (
          <p>Carregando…</p>
        ) : share.items.length === 0 ? (
          <p>Sem despesas no mês selecionado.</p>
        ) : (
          <>
            <p style={{ color: "#999" }}>
              Total do mês: {brl.format(Number(share.total))}
            </p>
            <CategoryShareChart share={share} />
          </>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <h2>Coorte de gastos por categoria</h2>
        {cohort === null ? (
          <p>Carregando…</p>
        ) : cohort.length === 0 ? (
          <p>Sem dados para exibir.</p>
        ) : (
          <CohortHeatmap cells={cohort} />
        )}
      </section>
    </main>
  );
}
