import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	BubbleData,
	BubbleScale,
	OptionType,
	RegularPriceData,
	StockCode,
} from "../types/bubbleData";
import {
	calculatePriceDifferences,
	getDateRange,
	loadBubbleData,
	loadRegularPriceData,
	summarise,
	transformDataForChart,
} from "../utils/dataLoader";

interface DashboardState {
	selectedStock: StockCode;
	startDate: Date | null;
	endDate: Date | null;
	bubbleData: BubbleData | null;
	regularPriceData: RegularPriceData[] | null;
	loading: boolean;
	error: string | null;
}

/** Maturity group behind the headline summary. Index into tau_groups_info. */
export const SUMMARY_TAU_INDEX = 2;

const INITIAL_STATE: DashboardState = {
	selectedStock: "SPX",
	startDate: null,
	endDate: null,
	bubbleData: null,
	regularPriceData: null,
	loading: true,
	error: null,
};

export function useDashboardData() {
	const [state, setState] = useState<DashboardState>(INITIAL_STATE);
	const [scale, setScale] = useState<BubbleScale>("percent");
	const [reloadToken, setReloadToken] = useState(0);
	const dateChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is a retry trigger, not a value read inside the effect
	useEffect(() => {
		let cancelled = false;

		(async () => {
			setState((prev) => ({ ...prev, loading: true, error: null }));

			const [bubble, raw] = await Promise.allSettled([
				loadBubbleData(state.selectedStock),
				loadRegularPriceData(state.selectedStock),
			]);

			if (cancelled) return;

			if (bubble.status === "rejected") {
				setState((prev) => ({
					...prev,
					loading: false,
					bubbleData: null,
					error:
						bubble.reason instanceof Error
							? bubble.reason.message
							: `Could not load ${state.selectedStock}`,
				}));
				return;
			}

			const range = getDateRange(bubble.value);
			setState((prev) => ({
				...prev,
				bubbleData: bubble.value,
				// Raw prices are a nice-to-have; a failure here only hides the
				// split-adjustment chart.
				regularPriceData: raw.status === "fulfilled" ? raw.value : null,
				loading: false,
				error: null,
				// Reset the window whenever the asset changes, since two assets
				// rarely share a coverage period.
				startDate: range.min,
				endDate: range.max,
			}));
		})();

		return () => {
			cancelled = true;
		};
	}, [state.selectedStock, reloadToken]);

	useEffect(
		() => () => {
			if (dateChangeTimeoutRef.current) {
				clearTimeout(dateChangeTimeoutRef.current);
			}
		},
		[],
	);

	const setSelectedStock = useCallback((stock: StockCode) => {
		setState((prev) => ({ ...prev, selectedStock: stock }));
	}, []);

	const setDateRange = useCallback(
		(startDate: Date | null, endDate: Date | null) => {
			if (dateChangeTimeoutRef.current) {
				clearTimeout(dateChangeTimeoutRef.current);
			}
			dateChangeTimeoutRef.current = setTimeout(() => {
				setState((prev) => ({ ...prev, startDate, endDate }));
			}, 100);
		},
		[],
	);

	const resetDateRange = useCallback(() => {
		setState((prev) => {
			if (!prev.bubbleData) return prev;
			const range = getDateRange(prev.bubbleData);
			return { ...prev, startDate: range.min, endDate: range.max };
		});
	}, []);

	const retry = useCallback(() => setReloadToken((n) => n + 1), []);

	const { bubbleData, startDate, endDate, regularPriceData } = state;

	const chartData = useMemo(() => {
		if (!bubbleData) return { put: [], call: [], combined: [] };
		const window = [startDate ?? undefined, endDate ?? undefined] as const;
		return {
			put: transformDataForChart(bubbleData, "put", ...window),
			call: transformDataForChart(bubbleData, "call", ...window),
			combined: transformDataForChart(bubbleData, "combined", ...window),
		};
	}, [bubbleData, startDate, endDate]);

	// Previously recomputed on every render because it was a useCallback invoked
	// directly in JSX; over a 7,000-point series that is a full rescan per frame.
	const priceDifferenceData = useMemo(() => {
		if (!bubbleData || !regularPriceData) return [];
		return calculatePriceDifferences(
			bubbleData,
			regularPriceData,
			startDate ?? undefined,
			endDate ?? undefined,
		);
	}, [bubbleData, regularPriceData, startDate, endDate]);

	/**
	 * Headline reading: combined estimator at the longest maturity group. The
	 * one-year horizon is where the historical episodes actually show up — the
	 * 2006-07 S&P run-up reads +1.3% of index at τ ≈ 1y and +0.15% at τ ≈ 0.25y.
	 * Must stay in step with the tau group the summary panel is labelled with.
	 */
	const summary = useMemo(
		() =>
			bubbleData ? summarise(bubbleData, "combined", SUMMARY_TAU_INDEX) : null,
		[bubbleData],
	);

	const availableDateRange = useMemo(
		() => (bubbleData ? getDateRange(bubbleData) : null),
		[bubbleData],
	);

	const getChartData = useCallback(
		(optionType: OptionType) => chartData[optionType],
		[chartData],
	);

	return {
		...state,
		scale,
		setScale,
		summary,
		availableDateRange,
		priceDifferenceData,
		tauGroups: bubbleData?.metadata.tau_groups_info ?? [],
		summaryTauGroup: bubbleData?.metadata.tau_groups_info?.[SUMMARY_TAU_INDEX],
		setSelectedStock,
		setDateRange,
		resetDateRange,
		retry,
		getChartData,
	};
}
