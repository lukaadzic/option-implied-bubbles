import { useEffect, useMemo, useState } from "react";
import type { PlotParams } from "react-plotly.js";

/**
 * Shared Plotly wiring for every chart on the dashboard.
 *
 * Two jobs:
 *
 * 1. Load plotly.js on demand. It is roughly 4MB minified — statically
 *    importing it blocks first paint on a bundle most of which is never used
 *    before the data arrives. The charts render a spinner until `ready`.
 * 2. Own the light/dark palette in one place. Previously each chart carried its
 *    own copy of the same forty lines of `theme === "dark" ? … : …`, which is
 *    how the two charts drifted apart.
 */

type PlotComponent = React.ComponentType<PlotParams>;

export interface PlotlyPalette {
	text: string;
	muted: string;
	grid: string;
	axisLine: string;
	zeroLine: string;
	priceLine: string;
	episodeFill: string;
	hoverBg: string;
	hoverBorder: string;
	controlBg: string;
	controlActive: string;
}

const DARK: PlotlyPalette = {
	text: "#e2e8f0",
	muted: "#94a3b8",
	grid: "rgba(148, 163, 184, 0.14)",
	axisLine: "rgba(148, 163, 184, 0.35)",
	zeroLine: "rgba(226, 232, 240, 0.55)",
	priceLine: "#64748b",
	episodeFill: "rgba(148, 163, 184, 0.07)",
	hoverBg: "rgba(15, 23, 42, 0.96)",
	hoverBorder: "rgba(148, 163, 184, 0.3)",
	controlBg: "rgba(30, 41, 59, 0.9)",
	controlActive: "#3b82f6",
};

const LIGHT: PlotlyPalette = {
	text: "#0f172a",
	muted: "#64748b",
	grid: "rgba(15, 23, 42, 0.08)",
	axisLine: "rgba(15, 23, 42, 0.2)",
	zeroLine: "rgba(15, 23, 42, 0.45)",
	priceLine: "#94a3b8",
	episodeFill: "rgba(15, 23, 42, 0.05)",
	hoverBg: "rgba(255, 255, 255, 0.97)",
	hoverBorder: "rgba(15, 23, 42, 0.15)",
	controlBg: "rgba(241, 245, 249, 0.9)",
	controlActive: "#3b82f6",
};

const FONT_STACK =
	'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Module-level cache so switching tabs does not re-import plotly.js. */
let plotPromise: Promise<PlotComponent> | null = null;

function loadPlot(): Promise<PlotComponent> {
	if (!plotPromise) {
		plotPromise = Promise.all([
			// The prebuilt bundle, not the `plotly.js` entry point. The entry
			// pulls in plotly's source tree, which requires `buffer/` and breaks
			// Vite's dependency pre-bundling in dev. The dist build is the same
			// library with that already resolved.
			import("plotly.js/dist/plotly.min.js"),
			import("react-plotly.js/factory"),
		]).then(([plotly, factory]) =>
			factory.default(plotly.default ?? plotly),
		) as Promise<PlotComponent>;
	}
	return plotPromise;
}

export function usePlotlyTheme(theme: string) {
	const [Plot, setPlot] = useState<PlotComponent | null>(null);

	useEffect(() => {
		let cancelled = false;
		loadPlot().then((component) => {
			if (!cancelled) setPlot(() => component);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	// `theme` may be "system"; resolve it the same way ThemeProvider does.
	const isDark = useMemo(() => {
		if (theme === "dark") return true;
		if (theme === "light") return false;
		return (
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches
		);
	}, [theme]);

	const palette = isDark ? DARK : LIGHT;

	const baseLayout = useMemo(
		() => ({
			paper_bgcolor: "transparent",
			plot_bgcolor: "transparent",
			font: { color: palette.text, family: FONT_STACK, size: 12 },
			hovermode: "x unified" as const,
			hoverdistance: 40,
			spikedistance: -1,
			hoverlabel: {
				bgcolor: palette.hoverBg,
				bordercolor: palette.hoverBorder,
				font: { color: palette.text, family: FONT_STACK, size: 12 },
				align: "left" as const,
				namelength: -1,
			},
			showlegend: true,
			xaxis: {
				gridcolor: palette.grid,
				linecolor: palette.axisLine,
				tickcolor: palette.axisLine,
				tickfont: { color: palette.muted, size: 11 },
				showspikes: true,
				spikecolor: palette.axisLine,
				spikethickness: 1,
				spikedash: "dot" as const,
				spikemode: "across" as const,
			},
			yaxis: {
				gridcolor: palette.grid,
				linecolor: palette.axisLine,
				tickcolor: palette.axisLine,
				tickfont: { color: palette.muted, size: 11 },
			},
		}),
		[palette],
	);

	const baseConfig = useMemo(
		() => ({
			responsive: true,
			displayModeBar: true,
			displaylogo: false,
			modeBarButtonsToRemove: [
				"lasso2d",
				"select2d",
				"autoScale2d",
			] as Plotly.ModeBarDefaultButtons[],
		}),
		[],
	);

	return {
		Plot: Plot as PlotComponent,
		palette,
		baseLayout,
		baseConfig,
		ready: Plot !== null,
	};
}
