import { useTheme } from "@/components/theme-provider";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import {
	MARKET_EPISODES,
	STOCK_NAMES,
	type StockCode,
	type TauGroupInfo,
} from "../types/bubbleData";
import { LoadingSpinner } from "./LoadingSpinner";
import { usePlotlyTheme } from "./usePlotlyTheme";

interface TauSlice {
	values: (number | null)[];
	significantShare: (number | null)[];
}

interface CrossAssetPayload {
	generated: string;
	months: string[];
	series: { stock: StockCode; byTau: TauSlice[] }[];
}

interface CrossAssetHeatmapProps {
	tauGroups: TauGroupInfo[];
	selectedStock: StockCode;
	onSelectStock: (stock: StockCode) => void;
}

/**
 * Diverging scale centred on zero. Blue below fundamental value, amber above,
 * near-neutral in the middle so ordinary readings recede and the extremes carry
 * the chart.
 *
 * Two of them, because the midpoint has to differ from the page background or
 * "no bubble" cells read as holes in the grid rather than as neutral readings.
 * On white that means a light grey midpoint; on near-black, a dark one.
 */
const COLORSCALE_DARK: [number, string][] = [
	[0, "#0c4a6e"],
	[0.2, "#0ea5e9"],
	[0.4, "#7dd3fc"],
	[0.5, "#334155"],
	[0.6, "#fcd34d"],
	[0.8, "#f59e0b"],
	[1, "#b45309"],
];

const COLORSCALE_LIGHT: [number, string][] = [
	[0, "#0c4a6e"],
	[0.2, "#0284c7"],
	[0.4, "#bae6fd"],
	[0.5, "#eef2f6"],
	[0.6, "#fde68a"],
	[0.8, "#d97706"],
	[1, "#92400e"],
];

/** Symmetric cap so the colour scale stays centred on zero. */
const CAP_PERCENT = 2.5;

/**
 * Months in the trailing average.
 *
 * The daily estimator is noisy enough that a raw monthly mean alternates sign
 * from cell to cell and the panel renders as static. A trailing year is the
 * right resolution for a 27-year overview: it is long enough to show regimes
 * and short enough that the 2000 and 2008 turns stay where they happened.
 */
const SMOOTH_MONTHS = 12;

/** Trailing mean over up to `window` months, skipping gaps. */
function smooth(values: (number | null)[], window: number) {
	return values.map((_, i) => {
		let sum = 0;
		let count = 0;
		for (let j = Math.max(0, i - window + 1); j <= i; j++) {
			const v = values[j];
			if (v !== null) {
				sum += v;
				count++;
			}
		}
		// Require at least half the window, so the first months of a newly
		// listed ticker do not show a confident-looking one-month average.
		return count >= window / 2 ? sum / count : null;
	});
}

export function CrossAssetHeatmap({
	tauGroups,
	selectedStock,
	onSelectStock,
}: CrossAssetHeatmapProps) {
	const { theme } = useTheme();
	const { Plot, palette, baseConfig, ready, isDark } = usePlotlyTheme(theme);
	const [payload, setPayload] = useState<CrossAssetPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tauIndex, setTauIndex] = useState(2);

	useEffect(() => {
		let cancelled = false;
		fetch("/data/cross-asset.json")
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data: CrossAssetPayload) => {
				if (!cancelled) setPayload(data);
			})
			.catch((e: Error) => {
				if (!cancelled) setError(e.message);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const plot = useMemo(() => {
		if (!payload) return null;

		// Sort by peak reading so the assets that ever ran hottest sit at the top
		// and the eye lands on the signal rather than on alphabetical order.
		const rows = [...payload.series]
			.map((s) => {
				const slice = s.byTau[tauIndex] ?? s.byTau[0];
				const values = smooth(slice.values, SMOOTH_MONTHS);
				const peak = values.reduce<number>(
					(max, v) => (v !== null && v > max ? v : max),
					Number.NEGATIVE_INFINITY,
				);
				return { stock: s.stock, values, peak };
			})
			// Ascending, because plotly draws a category axis bottom-up: the
			// hottest asset ends up at the top of the panel.
			.sort((a, b) => a.peak - b.peak);

		return {
			data: [
				{
					type: "heatmap" as const,
					x: payload.months,
					y: rows.map((r) => r.stock),
					z: rows.map((r) => r.values),
					colorscale: isDark ? COLORSCALE_DARK : COLORSCALE_LIGHT,
					zmid: 0,
					zmin: -CAP_PERCENT,
					zmax: CAP_PERCENT,
					hoverongaps: false,
					xgap: 0,
					ygap: 1,
					colorbar: {
						title: {
							text: "% of price",
							side: "right" as const,
							font: { size: 11, color: palette.muted },
						},
						thickness: 12,
						len: 0.9,
						tickfont: { color: palette.muted, size: 10 },
						outlinewidth: 0,
						ticksuffix: "%",
					},
					hovertemplate:
						"<b>%{y}</b>  %{x}<br>Trailing 12m bubble: %{z:.2f}% of price<extra></extra>",
				},
			],
			layout: {
				paper_bgcolor: "transparent",
				plot_bgcolor: "transparent",
				font: { color: palette.text, size: 11 },
				height: Math.max(420, rows.length * 20 + 120),
				margin: { l: 62, r: 10, t: 34, b: 46 },
				xaxis: {
					type: "date" as const,
					gridcolor: "transparent",
					linecolor: palette.axisLine,
					tickfont: { color: palette.muted, size: 10 },
				},
				yaxis: {
					type: "category" as const,
					gridcolor: "transparent",
					linecolor: "transparent",
					tickfont: { color: palette.muted, size: 10 },
					automargin: true,
				},
				shapes: MARKET_EPISODES.map((e) => ({
					type: "line" as const,
					xref: "x" as const,
					yref: "paper" as const,
					x0: e.start,
					x1: e.start,
					y0: 0,
					y1: 1,
					line: { color: palette.zeroLine, width: 1, dash: "dot" as const },
				})),
				annotations: MARKET_EPISODES.map((e) => ({
					x: e.start,
					y: 1,
					xref: "x" as const,
					yref: "paper" as const,
					text: e.label,
					showarrow: false,
					xanchor: "left" as const,
					yanchor: "bottom" as const,
					font: { size: 10, color: palette.muted },
				})),
			},
			rows,
		};
	}, [payload, tauIndex, palette, isDark]);

	const horizonLabel = (i: number) => {
		const mean = tauGroups[i]?.mean ?? [0.25, 0.5, 1][i];
		return `τ ≈ ${mean}y (${Math.round(mean * 12)} month)`;
	};

	return (
		<Card className="mb-5">
			<CardContent className="p-5">
				<div className="flex flex-wrap items-start justify-between gap-3 mb-1">
					<div>
						<h3 className="text-base font-semibold tracking-tight">
							Cross-asset bubble panel
						</h3>
						<p className="text-sm text-muted-foreground mt-0.5">
							Trailing 12-month mean estimate as a share of price, all 26
							assets. Rows are ordered by their historical peak. Click a row to
							load that asset below.
						</p>
					</div>
					<Select
						value={String(tauIndex)}
						onValueChange={(v) => setTauIndex(Number(v))}
					>
						<SelectTrigger className="w-[190px]" aria-label="Maturity horizon">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{[0, 1, 2].map((i) => (
								<SelectItem key={i} value={String(i)}>
									{horizonLabel(i)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{error && (
					<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
						Cross-asset panel unavailable ({error}). Regenerate it with{" "}
						<code className="mx-1">bun run build:cross-asset</code>.
					</div>
				)}

				{!error && (!ready || !plot) && (
					<LoadingSpinner
						message="Loading cross-asset panel…"
						className="h-64"
						inline
					/>
				)}

				{!error && ready && plot && (
					<>
						<Plot
							data={plot.data}
							layout={plot.layout}
							config={{ ...baseConfig, displayModeBar: false }}
							style={{ width: "100%" }}
							useResizeHandler
							onClick={(event) => {
								// Heatmap y values are the ticker strings we passed in.
								const ticker = event.points?.[0]?.y;
								if (typeof ticker === "string") {
									onSelectStock(ticker as StockCode);
								}
							}}
						/>
						<p className="text-xs text-muted-foreground mt-2">
							Currently showing detail for{" "}
							<span className="font-medium text-foreground">
								{STOCK_NAMES[selectedStock]}
							</span>
							. Amber is trading above option-implied fundamental value, blue is
							below.
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}
