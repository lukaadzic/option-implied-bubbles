import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useDashboardData } from "../hooks/useDashboardData";
import { STOCK_NAMES } from "../types/bubbleData";
import { BubbleSummaryPanel } from "./BubbleSummaryPanel";
import { CrossAssetHeatmap } from "./CrossAssetHeatmap";
import { DashboardControls } from "./DashboardControls";
import { MethodologyNote } from "./MethodologyNote";
import { PlotlyBubbleChart } from "./PlotlyBubbleChart";
import { PriceDifferenceChart } from "./PriceDifferenceChart";

const CHARTS = [
	{
		optionType: "combined" as const,
		title: "Combined estimate",
		description:
			"Puts and calls pooled. This is the headline series for a single reading.",
		math: "\\hat{\\Pi}_{cp}(\\tau)",
	},
	{
		optionType: "put" as const,
		title: "Put-only estimate",
		description:
			"Fundamental value recovered from put prices alone. Runs persistently positive.",
		math: "\\hat{\\Pi}_{p}(\\tau)",
	},
	{
		optionType: "call" as const,
		title: "Call-only estimate",
		description:
			"Fundamental value recovered from call prices alone. Runs persistently negative.",
		math: "\\hat{\\Pi}_{c}(\\tau)",
	},
];

export function Dashboard() {
	const {
		selectedStock,
		startDate,
		endDate,
		loading,
		error,
		scale,
		summary,
		tauGroups,
		summaryTauGroup,
		availableDateRange,
		priceDifferenceData,
		setScale,
		setSelectedStock,
		setDateRange,
		resetDateRange,
		retry,
		getChartData,
	} = useDashboardData();

	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
				<header className="mb-6">
					<h1 className="text-2xl font-semibold tracking-tight">
						Option-implied bubble estimates
					</h1>
					<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
						Daily estimates of how far 26 US equities and the S&amp;P 500 traded
						from the fundamental value implied by their option prices, 1996 to
						2023. Method from{" "}
						<a
							href="https://doi.org/10.1002/jae.2862"
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-4 hover:text-foreground"
						>
							Jarrow &amp; Kwok (2021)
							<ExternalLink className="ml-0.5 inline h-3 w-3" />
						</a>
						.
					</p>
				</header>

				<DashboardControls
					selectedStock={selectedStock}
					startDate={startDate}
					endDate={endDate}
					scale={scale}
					onStockChange={setSelectedStock}
					onScaleChange={setScale}
					onDateRangeChange={setDateRange}
					onResetDateRange={resetDateRange}
					availableDateRange={availableDateRange}
					loading={loading}
				/>

				{error ? (
					<Card className="mb-5">
						<CardContent className="flex flex-col items-center p-10 text-center">
							<AlertTriangle className="mb-4 h-10 w-10 text-destructive" />
							<h2 className="text-lg font-semibold">
								Could not load {STOCK_NAMES[selectedStock]}
							</h2>
							<p className="mt-1 max-w-md text-sm text-muted-foreground">
								{error}
							</p>
							{/* Retries the fetch instead of reloading the page, so the
							    selected asset and date range survive the failure. */}
							<Button className="mt-5" onClick={retry}>
								Try again
							</Button>
						</CardContent>
					</Card>
				) : (
					<BubbleSummaryPanel
						summary={summary}
						stock={selectedStock}
						tauGroup={summaryTauGroup}
						loading={loading}
					/>
				)}

				{/* The panel reads a local file and does not depend on the selected
				    asset, so it stays up when that asset fails to load. It is also
				    the fastest way back to a working one. */}
				<CrossAssetHeatmap
					tauGroups={tauGroups}
					selectedStock={selectedStock}
					onSelectStock={setSelectedStock}
				/>

				{!error && (
					<>
						<div className="space-y-5">
							{CHARTS.map((chart) => (
								<PlotlyBubbleChart
									key={chart.optionType}
									data={getChartData(chart.optionType)}
									optionType={chart.optionType}
									title={chart.title}
									description={chart.description}
									mathExpression={chart.math}
									tauGroups={tauGroups}
									scale={scale}
									loading={loading}
								/>
							))}

							<PriceDifferenceChart
								data={priceDifferenceData}
								title={`${STOCK_NAMES[selectedStock]} price history`}
								loading={loading}
							/>
						</div>

						<MethodologyNote />
					</>
				)}

				<footer className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
					<p>
						Research output, not investment advice. Estimates cover{" "}
						{availableDateRange?.min.getFullYear() ?? "1996"}&ndash;
						{availableDateRange?.max.getFullYear() ?? "2023"} and are not
						updated in real time.
					</p>
					<p className="mt-1">
						<a
							href="https://github.com/lukaadzic/financial-bubble-detection-dashboard"
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-4 hover:text-foreground"
						>
							Source on GitHub
						</a>
					</p>
				</footer>
			</div>
		</div>
	);
}
