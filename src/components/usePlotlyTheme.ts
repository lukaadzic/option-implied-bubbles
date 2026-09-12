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
	/** Estimate line colours, one per tau group, ordered shortest maturity first. */
	series: readonly [string, string, string];
	/** Opacity of the confidence bands. Light backgrounds need more. */
	bandAlpha: number;
}

/*
 * Two palettes rather than one, because a single set of series colours cannot
 * clear the 3:1 contrast minimum for graphical objects against both a near-black
 * and a white background. Measured against their own background:
 *
 *              dark      light (before)   light (now)
 *   tau1       4.73:1    3.68:1           5.17:1
 *   tau2       6.99:1    2.49:1  FAIL     3.74:1
 *   tau3       8.10:1    8.10:1 -> 2.15:1 FAIL   5.02:1
 *   price      3.66:1    2.56:1  FAIL     4.76:1
 *
 * The light values are darker shades of the same hues, so the two themes still
 * read as the same chart.
 */
const DARK: PlotlyPalette = {
	text: "#e2e8f0",
	muted: "#94a3b8",
	grid: "rgba(148, 163, 184, 0.14)",
	axisLine: "rgba(148, 163, 184, 0.35)",
	zeroLine: "rgba(226, 232, 240, 0.55)",
	priceLine: "#64748b",
	episodeFill: "rgba(148, 163, 184, 0.07)",
	hoverBg: "rgba(15, 23, 42, 0.97)",
	hoverBorder: "rgba(148, 163, 184, 0.35)",
	controlBg: "rgba(30, 41, 59, 0.9)",
	controlActive: "#3b82f6",
	series: ["#3b82f6", "#14b8a6", "#f59e0b"],
	bandAlpha: 0.14,
};

const LIGHT: PlotlyPalette = {
	text: "#0f172a",
	muted: "#475569",
	grid: "rgba(15, 23, 42, 0.08)",
	axisLine: "rgba(15, 23, 42, 0.22)",
	zeroLine: "rgba(15, 23, 42, 0.45)",
	// 4.76:1 on white. Clears the 3:1 minimum while staying recessive: the spot
	// price is context for the estimates, not the subject of the chart.
	priceLine: "#64748b",
	episodeFill: "rgba(15, 23, 42, 0.05)",
	hoverBg: "rgba(255, 255, 255, 0.98)",
	hoverBorder: "rgba(15, 23, 42, 0.22)",
	controlBg: "rgba(241, 245, 249, 0.95)",
	controlActive: "#2563eb",
	series: ["#2563eb", "#0d9488", "#b45309"],
	// A 14% tint that reads on near-black washes out on white.
	bandAlpha: 0.2,
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
		isDark,
		ready: Plot !== null,
	};
}
