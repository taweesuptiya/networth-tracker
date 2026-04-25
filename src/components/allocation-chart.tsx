"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

export function AllocationChart({
  data,
  baseCurrency,
}: {
  data: { type: string; value: number }[];
  baseCurrency: string;
}) {
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-4">Allocation</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="type"
              outerRadius={90}
              innerRadius={50}
              label={(props: { name?: string; value?: number }) => {
                const v = Number(props.value ?? 0);
                const pct = total > 0 ? ((v / total) * 100).toFixed(0) : "0";
                return `${props.name ?? ""} ${pct}%`;
              }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) =>
                `${Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${baseCurrency}`
              }
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
