import { useTheme } from "@/components/theme-provider";
import { Card, CardContent } from "@/components/ui/card";
import React, { useMemo } from "react";
import type { PriceDifferenceDataPoint } from "../types/bubbleData";
import { LoadingSpinner } from "./LoadingSpinner";
import { usePlotlyTheme } from "./usePlotlyTheme";

interface PriceDifferenceChartProps {
	data: PriceDifferenceDataPoint[];
	title: string;
	loading?: boolean;
}

/** Below this the two series are the same line and the chart says nothing. */
const IDENTICAL_THRESHOLD_PCT = 0.01;

export const PriceDifferenceChart = React.memo(function PriceDifferenceChart({
	data,
	title,
	loading,
}: PriceDifferenceChartProps) {
	const { theme } = useTheme();
	const { Plot, palette, baseLayout, baseConfig, ready } =
		usePlotlyTheme(theme);

	/**
	 * An index like SPX never splits, so raw and split-adjusted prices are the
	 * same series. Previously that drew one line on top of another and left a
	 * legend entry pointing at nothing visible.
	 */
	const maxDivergence = useMemo(
		() =>
			data.reduce(
				(max, d) => Math.max(max, Math.abs(d.percentageDifference)),
				0,
			),
		[data],
	);
	const identical = data.length > 0 && maxDivergence < IDENTICAL_THRESHOLD_PCT;

	const plotData = useMemo(() => {
		if (!data.length) return [];
		const dates = data.map((d) => d.date);

		const adjusted = {
			x: dates,
			y: data.map((d) => d.adjustedPrice),
			type: "scatter" as const,
			mode: "lines" as const,
			name: "Split-adjusted",
			// From the shared palette, so this chart clears the same 3:1 contrast
			// minimum as the others in both themes. It used to be a hardcoded
			// #f59e0b, which is 2.15:1 on white.
			line: { color: palette.series[2], width: 1.6 },
			hovertemplate: "<b>Split-adjusted</b>  %{y:,.2f}<extra></extra>",
		};

		if (identical) return [adjusted];

		return [
			{
				x: dates,
				y: data.map((d) => d.regularPrice),
				type: "scatter" as const,
				mode: "lines" as const,
				name: "Raw (as traded)",
				line: { color: palette.series[0], width: 1.6 },
				hovertemplate: "<b>Raw</b>  %{y:,.2f}<extra></extra>",
			},
			adjusted,
		];
	}, [data, identical, palette]);

	const layout = useMemo(
		() => ({
			...baseLayout,
			xaxis: { ...baseLayout.xaxis, type: "date" as const },
			yaxis: {
				...baseLayout.yaxis,
				title: { text: "Price", font: { color: palette.text, size: 12 } },
			},
			legend: {
				orientation: "h" as const,
				y: -0.18,
				x: 0,
				font: { color: palette.text, size: 11 },
				bgcolor: "transparent",
			},
			showlegend: !identical,
			margin: { l: 62, r: 24, t: 24, b: identical ? 48 : 64 },
		}),
		[baseLayout, palette, identical],
	);

	const header = (
		<div className="mb-3">
			<h3 className="text-base font-semibold tracking-tight">{title}</h3>
			<p className="text-sm text-muted-foreground mt-0.5">
				{identical
					? "Raw and split-adjusted prices are identical for this asset, so a single line is drawn."
					: "Where the two diverge, corporate actions have been applied to the estimator's price input."}
			</p>
		</div>
	);

	if (loading || !ready) {
		return (
			<Card>
				<CardContent className="p-5">
					{header}
					<LoadingSpinner
						message="Loading prices…"
						className="h-[340px]"
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
					<div className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
						Raw price history is not available for this asset.
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
						style={{ width: "100%", height: "340px" }}
						useResizeHandler
						config={{
							...baseConfig,
							toImageButtonOptions: {
								format: "png",
								filename: "price_comparison",
								height: 500,
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
