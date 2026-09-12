/**
 * Data model for the Jarrow & Kwok (2021) option-implied bubble estimates.
 *
 * The estimator compares the observed spot price against a fundamental value
 * recovered from the cross-section of option prices at a given maturity. The
 * difference is the bubble, reported in the SAME UNITS AS PRICE (index points
 * for SPX, dollars for single names) — not as a probability or a percentage.
 *
 * Reference: Jarrow, R. A., & Kwok, S. S. (2021). Inferring financial bubbles
 * from option data. Journal of Applied Econometrics, 36(7), 1013-1046.
 * https://doi.org/10.1002/jae.2862
 */

export interface TauGroupInfo {
	/** Machine name from the pipeline, e.g. "tau_1". */
	name: string;
	/** Maturity window in years, e.g. "0.15-0.35". */
	range: string;
	/** Midpoint of the window in years, e.g. 0.25. */
	mean: number;
}

/** A point estimate with its confidence interval, in price units. */
export interface BubbleEstimate {
	/** Point estimate of the bubble. */
	mu: number;
	/** Lower confidence bound. */
	lb: number;
	/** Upper confidence bound. */
	ub: number;
}

export interface DailyGroupedData {
	put: BubbleEstimate;
	call: BubbleEstimate;
	combined: BubbleEstimate;
}

export interface TimeSeriesDataPoint {
	date: string;
	stock_prices: {
		adjusted: number;
		regular?: number;
	};
	bubble_estimates: {
		/** One entry per tau group, ordered to match metadata.tau_groups_info. */
		daily_grouped: DailyGroupedData[];
	};
}

export interface BubbleDataMetadata {
	stockcode: string;
	start_date_param: string;
	end_date_param: string;
	rolling_window_days: number;
	num_steps: number;
	optimization_threshold: number;
	h_number_sd: number;
	tau_groups_info: TauGroupInfo[];
	option_types_info: string[];
	time_series_start_date: string;
	time_series_end_date: string;
}

export interface BubbleData {
	metadata: BubbleDataMetadata;
	time_series_data: TimeSeriesDataPoint[];
}

export type OptionType = "put" | "call" | "combined";

/**
 * How the bubble axis is scaled.
 *
 * - `price`: raw estimator output, in index points or dollars.
 * - `percent`: estimate divided by the spot price. Comparable across tickers
 *   and across decades, which raw price units are not — a 50-point bubble on a
 *   600-point index is not the same event as a 50-point bubble at 4,500.
 */
export type BubbleScale = "price" | "percent";

export interface ChartDataPoint {
	date: string;
	stockPrice: number;
	tau1: BubbleEstimate;
	tau2: BubbleEstimate;
	tau3: BubbleEstimate;
}

export interface RegularPriceData {
	date: string;
	price: number;
}

export interface PriceDifferenceDataPoint {
	date: string;
	adjustedPrice: number;
	regularPrice: number;
	difference: number;
	percentageDifference: number;
}

/** Latest-reading summary shown above the charts. */
export interface BubbleSummary {
	date: string;
	stockPrice: number;
	/** Bubble estimate in price units. */
	value: number;
	/** Bubble estimate as a share of spot price, in percent. */
	percentOfPrice: number;
	lb: number;
	ub: number;
	/** Where this reading sits in the asset's own history, 0-100. */
	percentile: number;
	/** True when the whole confidence interval sits above zero. */
	significant: boolean;
}

export const STOCK_LIST = [
	"SPX",
	"AAPL",
	"AMD",
	"AMZN",
	"AIG",
	"BA",
	"BABA",
	"BAC",
	"C",
	"CSCO",
	"DIS",
	"F",
	"FB",
	"GE",
	"GM",
	"GOOG",
	"INTC",
	"JPM",
	"MS",
	"MSFT",
	"NVDA",
	"T",
	"TSLA",
	"TWTR",
	"WFC",
	"XOM",
] as const;

export type StockCode = (typeof STOCK_LIST)[number];

/** Display names, so the UI is not a wall of tickers. */
export const STOCK_NAMES: Record<StockCode, string> = {
	SPX: "S&P 500 Index",
	AAPL: "Apple",
	AMD: "AMD",
	AMZN: "Amazon",
	AIG: "AIG",
	BA: "Boeing",
	BABA: "Alibaba",
	BAC: "Bank of America",
	C: "Citigroup",
	CSCO: "Cisco",
	DIS: "Disney",
	F: "Ford",
	FB: "Meta (Facebook)",
	GE: "General Electric",
	GM: "General Motors",
	GOOG: "Alphabet",
	INTC: "Intel",
	JPM: "JPMorgan Chase",
	MS: "Morgan Stanley",
	MSFT: "Microsoft",
	NVDA: "NVIDIA",
	T: "AT&T",
	TSLA: "Tesla",
	TWTR: "Twitter",
	WFC: "Wells Fargo",
	XOM: "ExxonMobil",
};

/**
 * A bubble larger than the entire price of the asset is not a reading, it is
 * the estimator breaking down on a degenerate input. GM is the clear case: its
 * split-adjusted price is recorded as 0.00 through the June 2009 bankruptcy and
 * under $1 for weeks either side, which turns a -$15 estimate into -2,000% of
 * price. Those observations are dropped from percent-of-price views rather than
 * plotted or silently clamped to the edge of the colour scale.
 */
export const PERCENT_SANITY_LIMIT = 100;

/** Bubble as a share of spot price, or null where that is not meaningful. */
export function bubblePercent(value: number, price: number): number | null {
	if (!Number.isFinite(price) || price <= 0) return null;
	const pct = (value / price) * 100;
	return Math.abs(pct) > PERCENT_SANITY_LIMIT ? null : pct;
}

/**
 * Series colours. Chosen to stay distinguishable under deuteranopia and to
 * hold contrast on both the light and dark backgrounds.
 */
export const TAU_COLORS = {
	tau1: "#3b82f6", // blue
	tau2: "#14b8a6", // teal
	tau3: "#f59e0b", // amber
	stockPrice: "#94a3b8", // slate, deliberately muted: price is context, not the subject
} as const;

/**
 * Market episodes shaded on the time axis, so a reader can tell at a glance
 * whether an estimated bubble lines up with a known one. Dates are the
 * conventional run-up windows, not precise peak/trough calls.
 */
export const MARKET_EPISODES = [
	{ label: "Dot-com", start: "1998-10-01", end: "2000-03-24" },
	{ label: "Housing / pre-GFC", start: "2006-01-01", end: "2007-10-09" },
	{ label: "COVID rebound", start: "2020-03-23", end: "2021-12-31" },
] as const;
