/**
 * Builds `public/data/cross-asset.json`, the monthly panel behind the
 * cross-asset heatmap.
 *
 * The per-ticker estimator output is ~12MB each; 26 of them is ~300MB, which no
 * browser is going to load to draw one overview. This collapses each ticker to
 * a monthly mean of the combined estimate expressed as a share of spot price,
 * which is both comparable across tickers and small enough to ship in the repo
 * (~60KB for the whole panel).
 *
 *   bun run build:cross-asset                # fetch from Blob storage
 *   bun run build:cross-asset -- --from-dir /tmp/bubble-data
 *
 * `--from-dir` expects files named `bubble_<TICKER>.json`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BubbleData, StockCode } from "../src/types/bubbleData";
import { STOCK_LIST, bubblePercent } from "../src/types/bubbleData";

const BLOB_HOST = "https://kpjvwsjhhmtk0pdx.public.blob.vercel-storage.com";
const OUT_PATH = join(process.cwd(), "public", "data", "cross-asset.json");

/**
 * All three maturity groups are emitted so the heatmap can switch horizons
 * without another fetch. The signal is not horizon-invariant: for the S&P 500
 * the pre-GFC run-up shows up most clearly at τ ≈ 1y (+1.3% of index) and is
 * nearly invisible at τ ≈ 0.25y (+0.15%).
 */
const TAU_INDICES = [0, 1, 2] as const;

const fromDirFlag = process.argv.indexOf("--from-dir");
const fromDir = fromDirFlag !== -1 ? process.argv[fromDirFlag + 1] : null;

async function loadTicker(stock: StockCode): Promise<BubbleData> {
	if (fromDir) {
		return JSON.parse(
			readFileSync(join(fromDir, `bubble_${stock}.json`), "utf-8"),
		);
	}
	const url = `${BLOB_HOST}/bubble_data_${stock}_splitadj_1996to2023.json`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${stock}: HTTP ${response.status}`);
	}
	return (await response.json()) as BubbleData;
}

interface MonthlyBucket {
	sum: number;
	count: number;
	/** Months where the whole interval sat above zero. */
	significant: number;
}

function monthlySeries(data: BubbleData, tauIndex: number) {
	const buckets = new Map<string, MonthlyBucket>();

	for (const point of data.time_series_data) {
		const spot = point.stock_prices.adjusted;
		if (!spot) continue;

		const group = point.bubble_estimates.daily_grouped[tauIndex];
		if (!group?.combined) continue;

		// Drops observations where price is degenerate; see bubblePercent.
		const percent = bubblePercent(group.combined.mu, spot);
		if (percent === null) continue;

		const month = point.date.slice(0, 7); // YYYY-MM
		const bucket = buckets.get(month) ?? { sum: 0, count: 0, significant: 0 };
		bucket.sum += percent;
		bucket.count += 1;
		if (group.combined.lb > 0) bucket.significant += 1;
		buckets.set(month, bucket);
	}

	return buckets;
}

async function main() {
	const perTicker = new Map<StockCode, Map<string, MonthlyBucket>[]>();
	const allMonths = new Set<string>();

	for (const stock of STOCK_LIST) {
		process.stdout.write(`  ${stock.padEnd(5)} `);
		try {
			const data = await loadTicker(stock);
			const byTau = TAU_INDICES.map((tau) => monthlySeries(data, tau));
			perTicker.set(stock, byTau);
			for (const month of byTau[0].keys()) allMonths.add(month);
			console.log(`${byTau[0].size} months`);
		} catch (error) {
			console.log(`skipped (${(error as Error).message})`);
		}
	}

	const months = [...allMonths].sort();

	const series = [...perTicker.entries()].map(([stock, byTau]) => ({
		stock,
		// One row per maturity group. Null where the ticker has no options data
		// for that month (Tesla has nothing in 1996), which the heatmap renders
		// as an empty cell rather than as a zero reading.
		byTau: byTau.map((buckets) => ({
			values: months.map((month) => {
				const bucket = buckets.get(month);
				if (!bucket?.count) return null;
				return Number((bucket.sum / bucket.count).toFixed(3));
			}),
			significantShare: months.map((month) => {
				const bucket = buckets.get(month);
				if (!bucket?.count) return null;
				return Number((bucket.significant / bucket.count).toFixed(2));
			}),
		})),
	}));

	const payload = {
		generated: new Date().toISOString().slice(0, 10),
		description:
			"Monthly mean of the combined put/call bubble estimate, as a percentage of spot price. byTau is ordered to match metadata.tau_groups_info.",
		months,
		series,
	};

	mkdirSync(dirname(OUT_PATH), { recursive: true });
	writeFileSync(OUT_PATH, JSON.stringify(payload));

	const bytes = existsSync(OUT_PATH) ? readFileSync(OUT_PATH).length : 0;
	console.log(
		`\nWrote ${OUT_PATH} — ${series.length} tickers x ${months.length} months, ${(bytes / 1024).toFixed(0)}KB`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
