/**
 * `react-plotly.js/factory` ships without types. It takes a plotly.js module
 * and returns a React component, which is how we load plotly lazily instead of
 * pulling 4MB into the entry bundle.
 */
declare module "react-plotly.js/factory" {
	import type { ComponentType } from "react";
	import type { PlotParams } from "react-plotly.js";

	export default function createPlotlyComponent(
		plotly: unknown,
	): ComponentType<PlotParams>;
}

/** Prebuilt plotly bundle, imported instead of the source entry point. */
declare module "plotly.js/dist/plotly.min.js" {
	const plotly: unknown;
	export default plotly;
}
