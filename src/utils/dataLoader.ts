import { bubblePercent } from "../types/bubbleData";
import type {
	BubbleData,
	BubbleEstimate,
	BubbleSummary,
	ChartDataPoint,
	OptionType,
	PriceDifferenceDataPoint,
	RegularPriceData,
	StockCode,
} from "../types/bubbleData";

/**
 * Vercel Blob store holding the estimator output. Public, read-only, and
 * CDN-cached for 30 days. Regenerate the mapping with `bun run get-blob-urls`
 * if the store is ever recreated.
 */
const BLOB_HOST = "https://kpjvwsjhhmtk0pdx.public.blob.vercel-storage.com";

const bubbleUrl = (stock: StockCode) =>
	`${BLOB_HOST}/bubble_data_${stock}_splitadj_1996to2023.json`;

const rawPriceUrl = (stock: StockCode) => `${BLOB_HOST}/${stock}_data.json`;

async function fetchJson<T>(url: string, what: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`${what} unavailable (HTTP ${response.status} ${response.statusText})`,
		);
	}
	return (await response.json()) as T;
}

export async function loadBubbleData(
	stockCode: StockCode,
): Promise<BubbleData> {
	const data = await fetchJson<BubbleData>(
		bubbleUrl(stockCode),
		`Bubble estimates for ${stockCode}`,
	);

	if (!data?.time_series_data?.length) {
		throw new Error(`Bubble estimates for ${stockCode} contained no rows`);
	}
	return data;
}

/**
 * Raw (non split-adjusted) closing prices. Optional: the dashboard still works
 * without them, it just cannot draw the split-adjustment comparison.
 */
export async function loadRegularPriceData(
	stockCode: StockCode,
): Promise<RegularPriceData[]> {
	const data = await fetchJson<{
		daily_data?: { date: string; raw_price: number }[];
	}>(rawPriceUrl(stockCode), `Raw prices for ${stockCode}`);

	if (!Array.isArray(data?.daily_data)) {
		throw new Error(
			`Raw prices for ${stockCode} were not in the expected shape`,
		);
	}

	return data.daily_data.map((point) => ({
		date: point.date,
		price: point.raw_price,
	}));
}

const EMPTY_ESTIMATE: BubbleEstimate = { mu: 0, lb: 0, ub: 0 };

/** Reads one tau group, tolerating pipelines that emit fewer than three. */
const groupAt = (
	point: { bubble_estimates: { daily_grouped: unknown[] } },
	index: number,
	optionType: OptionType,
): BubbleEstimate => {
	const group = point.bubble_estimates.daily_grouped[index] as
		| Record<OptionType, BubbleEstimate>
		| undefined;
	return group?.[optionType] ?? EMPTY_ESTIMATE;
};

function inRange(dateStr: string, startTime?: number, endTime?: number) {
	if (startTime === undefined && endTime === undefined) return true;
	const t = new Date(dateStr).getTime();
	if (startTime !== undefined && t < startTime) return false;
	if (endTime !== undefined && t > endTime) return false;
	return true;
}

export function transformDataForChart(
	bubbleData: BubbleData,
	optionType: OptionType,
	startDate?: Date,
	endDate?: Date,
): ChartDataPoint[] {
	const startTime = startDate?.getTime();
	const endTime = endDate?.getTime();

	const out: ChartDataPoint[] = [];
	for (const point of bubbleData.time_series_data) {
		if (!inRange(point.date, startTime, endTime)) continue;
		out.push({
			date: point.date,
			stockPrice: point.stock_prices.adjusted,
			tau1: groupAt(point, 0, optionType),
			tau2: groupAt(point, 1, optionType),
			tau3: groupAt(point, 2, optionType),
		});
	}
	return out;
}

export function getDateRange(bubbleData: BubbleData): { min: Date; max: Date } {
	let minTime = Number.POSITIVE_INFINITY;
	let maxTime = Number.NEGATIVE_INFINITY;

	for (const point of bubbleData.time_series_data) {
		const time = new Date(point.date).getTime();
		if (time < minTime) minTime = time;
		if (time > maxTime) maxTime = time;
	}

	return { min: new Date(minTime), max: new Date(maxTime) };
}

/**
 * Latest reading for the selected series, plus where it sits in the asset's
 * own history. The percentile is computed over the full sample rather than the
 * visible window, so zooming the charts does not silently move the yardstick.
 */
export function summarise(
	bubbleData: BubbleData,
	optionType: OptionType,
	tauIndex: number,
): BubbleSummary | null {
	const series = bubbleData.time_series_data;
	if (!series.length) return null;

	const last = series[series.length - 1];
	const estimate = groupAt(last, tauIndex, optionType);
	const price = last.stock_prices.adjusted;
	const currentPercent = bubblePercent(estimate.mu, price);
	if (currentPercent === null) return null;

	// Percentile against every historical reading of the same series, measured
	// as a share of price so a 1996 reading is comparable to a 2023 one.
	// Observations the guard rejects are excluded from the ranking as well,
	// otherwise GM's 2009 blowups would anchor the whole distribution.
	let atOrBelow = 0;
	let counted = 0;
	for (const point of series) {
		const percent = bubblePercent(
			groupAt(point, tauIndex, optionType).mu,
			point.stock_prices.adjusted,
		);
		if (percent === null) continue;
		counted++;
		if (percent <= currentPercent) atOrBelow++;
	}

	return {
		date: last.date,
		stockPrice: price,
		value: estimate.mu,
		percentOfPrice: currentPercent,
		lb: estimate.lb,
		ub: estimate.ub,
		percentile: counted ? (atOrBelow / counted) * 100 : 0,
		significant: estimate.lb > 0,
	};
}

export function calculatePriceDifferences(
	bubbleData: BubbleData,
	regularPriceData: RegularPriceData[],
	startDate?: Date,
	endDate?: Date,
): PriceDifferenceDataPoint[] {
	const regularPriceMap = new Map<string, number>();
	for (const point of regularPriceData) {
		regularPriceMap.set(point.date.split("T")[0], point.price);
	}

	const startTime = startDate?.getTime();
	const endTime = endDate?.getTime();

	const result: PriceDifferenceDataPoint[] = [];
	for (const point of bubbleData.time_series_data) {
		if (!inRange(point.date, startTime, endTime)) continue;

		const regularPrice = regularPriceMap.get(point.date.split("T")[0]);
		if (regularPrice === undefined) continue;

		const adjustedPrice = point.stock_prices.adjusted;
		const difference = adjustedPrice - regularPrice;
		result.push({
			date: point.date,
			adjustedPrice,
			regularPrice,
			difference,
			percentageDifference: regularPrice
				? (difference / regularPrice) * 100
				: 0,
		});
	}

	return result;
}
