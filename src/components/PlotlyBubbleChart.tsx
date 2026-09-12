import { useTheme } from "@/components/theme-provider";
import { Card, CardContent } from "@/components/ui/card";
import React, { useMemo } from "react";
import { InlineMath } from "react-katex";
import {
	type BubbleScale,
	type ChartDataPoint,
	MARKET_EPISODES,
	type OptionType,
	type TauGroupInfo,
	bubblePercent,
} from "../types/bubbleData";
import { LoadingSpinner } from "./LoadingSpinner";
import { usePlotlyTheme } from "./usePlotlyTheme";

interface PlotlyBubbleChartProps {
	data: ChartDataPoint[];
	optionType: OptionType;
	title: string;
	description: string;
	mathExpression?: string;
	tauGroups: TauGroupInfo[];
	scale: BubbleScale;
	loading?: boolean;
}

const TAU_KEYS = ["tau1", "tau2", "tau3"] as const;
const DASHES = ["solid", "dash", "dashdot"] as const;

/** Adds an alpha channel to a #rrggbb colour. */
function withAlpha(hex: string, alpha: number) {
	const n = Number.parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Full label for the legend, e.g. "τ ≈ 0.25y (3m) · 0.15-0.35y". */
function tauLabel(group: TauGroupInfo | undefined, fallbackMean: number) {
	const mean = group?.mean ?? fallbackMean;
	const months = Math.round(mean * 12);
	const range = group?.range ? ` · ${group.range}y` : "";
	return `τ ≈ ${mean}y (${months}m)${range}`;
}

/**
 * Short label for a hover row, e.g. "3m".
 *
 * The unified tooltip has room for a colour swatch and a number, and the legend
 * label is far too long to sit next to one. Without this every row was a bare
 * number and the only way to tell the three maturities apart was to match the
 * swatch against the legend at the bottom of the chart.
 */
function tauShortLabel(group: TauGroupInfo | undefined, fallbackMean: number) {
	const mean = group?.mean ?? fallbackMean;
	return `${Math.round(mean * 12)}m`;
}

export const PlotlyBubbleChart = React.memo(function PlotlyBubbleChart({
	data,
	optionType,
	title,
	description,
	mathExpression,
	tauGroups,
	scale,
	loading,
}: PlotlyBubbleChartProps) {
	const { theme } = useTheme();
	const { Plot, palette, baseLayout, baseConfig, ready } =
		usePlotlyTheme(theme);

	const asPercent = scale === "percent";

	const plotData = useMemo(() => {
		if (!data.length) return [];

		const dates = data.map((d) => d.date);
		// In percent mode every estimate is divided by that day's spot price, so
		// a 1996 reading and a 2023 reading sit on the same axis. Observations
		// where that ratio is not meaningful come back null, which plotly draws
		// as a gap rather than as a spike.
		const rescale = (value: number, price: number): number | null =>
			asPercent ? bubblePercent(value, price) : value;

		const bands = TAU_KEYS.flatMap((key, i) => {
			const colour = palette.series[i];
			return [
				{
					x: dates,
					y: data.map((d) => rescale(d[key].lb, d.stockPrice)),
					type: "scatter" as const,
					mode: "lines" as const,
					line: { color: "transparent", width: 0 },
					showlegend: false,
					hoverinfo: "skip" as const,
					legendgroup: key,
				},
				{
					x: dates,
					y: data.map((d) => rescale(d[key].ub, d.stockPrice)),
					type: "scatter" as const,
					mode: "lines" as const,
					fill: "tonexty" as const,
					// Light enough that three overlapping bands stay readable, but
					// theme-dependent: a tint that reads on near-black vanishes on white.
					fillcolor: withAlpha(colour, palette.bandAlpha),
					line: { color: "transparent", width: 0 },
					showlegend: false,
					hoverinfo: "skip" as const,
					legendgroup: key,
				},
			];
		});

		const lines = TAU_KEYS.map((key, i) => ({
			x: dates,
			y: data.map((d) => rescale(d[key].mu, d.stockPrice)),
			type: "scatter" as const,
			mode: "lines" as const,
			name: tauLabel(tauGroups[i], [0.25, 0.5, 1][i]),
			legendgroup: key,
			line: {
				color: palette.series[i],
				width: 1.8,
				dash: DASHES[i],
				shape: "linear" as const,
			},
			customdata: data.map((d) => [
				rescale(d[key].lb, d.stockPrice),
				rescale(d[key].ub, d.stockPrice),
			]),
			// x unified prints the date once as a header, so each row carries its
			// own maturity label, value and interval and nothing else.
			hovertemplate: `<b>${tauShortLabel(tauGroups[i], [0.25, 0.5, 1][i])}</b>  %{y:.2f}${asPercent ? "%" : ""}  [%{customdata[0]:.2f}, %{customdata[1]:.2f}]<extra></extra>`,
		}));

		const price = {
			x: dates,
			y: data.map((d) => d.stockPrice),
			type: "scatter" as const,
			mode: "lines" as const,
			name: "Spot price",
			line: { color: palette.priceLine, width: 1.4 },
			connectgaps: false,
			yaxis: "y2",
			hovertemplate: "<b>Spot</b>  %{y:,.2f}<extra></extra>",
		};

		// Order matters: bands are drawn first so the estimate lines sit on top.
		return [...bands, ...lines, price];
	}, [data, tauGroups, asPercent, palette]);

	const layout = useMemo(() => {
		// Shade known run-ups so an estimated bubble can be read against a
		// remembered one without leaving the chart.
		const episodes = MARKET_EPISODES.map((episode) => ({
			type: "rect" as const,
			xref: "x" as const,
			yref: "paper" as const,
			x0: episode.start,
			x1: episode.end,
			y0: 0,
			y1: 1,
			fillcolor: palette.episodeFill,
			line: { width: 0 },
			layer: "below" as const,
		}));

		const episodeLabels = MARKET_EPISODES.map((episode) => ({
			x: episode.start,
			y: 1,
			xref: "x" as const,
			yref: "paper" as const,
			text: episode.label,
			showarrow: false,
			xanchor: "left" as const,
			yanchor: "bottom" as const,
			font: { size: 10, color: palette.muted },
		}));

		return {
			...baseLayout,
			shapes: episodes,
			annotations: episodeLabels,
			xaxis: {
				...baseLayout.xaxis,
				title: { text: "", font: { color: palette.text } },
				type: "date" as const,
				// Range selector beats hunting in the date pickers for the common
				// "show me the last 5 years" question.
				rangeselector: {
					buttons: [
						{
							count: 1,
							label: "1Y",
							step: "year" as const,
							stepmode: "backward" as const,
						},
						{
							count: 5,
							label: "5Y",
							step: "year" as const,
							stepmode: "backward" as const,
						},
						{
							count: 10,
							label: "10Y",
							step: "year" as const,
							stepmode: "backward" as const,
						},
						{ step: "all" as const, label: "All" },
					],
					bgcolor: palette.controlBg,
					activecolor: palette.controlActive,
					font: { color: palette.text, size: 11 },
					x: 0,
					y: 1.12,
				},
			},
			yaxis: {
				...baseLayout.yaxis,
				title: {
					text: asPercent ? "Bubble (% of price)" : "Bubble (price units)",
					font: { color: palette.text, size: 12 },
				},
				// Zero is the whole story on a bubble chart: above it the market
				// trades over fundamental value, below it under.
				zeroline: true,
				zerolinecolor: palette.zeroLine,
				zerolinewidth: 1.5,
				ticksuffix: asPercent ? "%" : "",
			},
			yaxis2: {
				...baseLayout.yaxis,
				title: { text: "Spot price", font: { color: palette.muted, size: 12 } },
				side: "right" as const,
				overlaying: "y" as const,
				showgrid: false,
				tickfont: { color: palette.muted, size: 11 },
			},
			legend: {
				orientation: "h" as const,
				y: -0.18,
				x: 0,
				font: { color: palette.text, size: 11 },
				bgcolor: "transparent",
			},
			margin: { l: 62, r: 62, t: 44, b: 72 },
		};
	}, [baseLayout, palette, asPercent]);

	const header = (
		<div className="mb-3">
			<h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
				{title}
				{mathExpression && (
					<span className="text-muted-foreground">
						<InlineMath math={mathExpression} />
					</span>
				)}
			</h3>
			<p className="text-sm text-muted-foreground mt-0.5">{description}</p>
		</div>
	);

	if (loading || !ready) {
		return (
			<Card>
				<CardContent className="p-5">
					{header}
					<LoadingSpinner
						message={`Loading ${optionType} estimates…`}
						className="h-[480px]"
						inline
					/>
				</CardContent>
			</Card>
		);
	}

	if (!data.length) {
		return (
			<Card>
				<CardContent className="p-5">
					{header}
					<div className="flex h-[480px] items-center justify-center text-sm text-muted-foreground">
						No estimates in the selected date range.
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent className="p-5">
				{header}
				<div className="plotly-chart-container">
					<Plot
						data={plotData}
						layout={layout}
						style={{ width: "100%", height: "480px" }}
						useResizeHandler
						config={{
							...baseConfig,
							toImageButtonOptions: {
								format: "png",
								filename: `bubble_${optionType}`,
								height: 600,
								width: 1200,
								scale: 2,
							},
						}}
					/>
				</div>
			</CardContent>
		</Card>
	);
});
