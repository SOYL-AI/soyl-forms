"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * Charts read colours from the design tokens via currentColor / CSS vars so
 * light and dark stay consistent with the rest of the console.
 */

const tooltipStyle = {
  backgroundColor: "var(--paper)",
  borderColor: "var(--line-strong)",
  borderRadius: 12,
  color: "var(--ink)",
  fontSize: 12,
};

export function ActivityChart({ data, dataKey = "responses", label = "Responses" }: { data: Array<Record<string, string | number>>; dataKey?: string; label?: string }) {
  const id = `grad-${dataKey}`;
  return (
    <div className="h-[260px] w-full text-ink">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--ink-faint)" }} dy={8} interval="preserveStartEnd" minTickGap={24} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--ink-faint)" }} allowDecimals={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--ink)" }} labelStyle={{ color: "var(--ink-faint)" }} formatter={(v) => [v, label]} />
          <Area type="monotone" dataKey={dataKey} stroke="currentColor" strokeWidth={2} fill={`url(#${id})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, dataKey, label }: { data: Array<Record<string, string | number>>; dataKey: string; label: string }) {
  return (
    <div className="h-[220px] w-full text-ink">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--ink-faint)" }} dy={8} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--ink-faint)" }} allowDecimals={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--ink)" }} cursor={{ fill: "var(--line)" }} formatter={(v) => [v, label]} />
          <Bar dataKey={dataKey} fill="currentColor" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
