import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
	BubbleSummary,
	StockCode,
	TauGroupInfo,
} from "../types/bubbleData";
import { STOCK_NAMES } from "../types/bubbleData";

interface BubbleSummaryPanelProps {
	summary: BubbleSummary | null;
	stock: StockCode;
	tauGroup?: TauGroupInfo;
	loading?: boolean;
}

const fmtDate = (iso: string) =>
	new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

const fmtNum = (n: number, digits = 2) =>
	n.toLocaleString("en-US", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});

/**
 * Reads the latest estimate in plain language.
 *
 * Direction is taken from the confidence interval, not the point estimate: an
 * interval straddling zero means the data cannot distinguish the reading from
 * no bubble at all, and saying so is more honest than reporting the sign of a
 * noisy midpoint.
 */
function interpret(summary: BubbleSummary) {
	if (summary.lb > 0) {
		return {
			tone: "elevated" as const,
			label: "Bubble detected",
			blurb:
				"The full confidence interval sits above zero, so the market traded above the option-implied fundamental value on this date.",
		};
	}
	if (summary.ub < 0) {
		return {
			tone: "discount" as const,
			label: "Trading below fundamental",
			blurb:
				"The full interval sits below zero: options implied a fundamental value above the traded price.",
		};
	}
	return {
		tone: "neutral" as const,
		label: "No significant bubble",
		blurb:
			"The confidence interval includes zero, so this reading is not statistically distinguishable from no bubble.",
	};
}

const TONE_STYLES = {
	elevated: "text-amber-600 dark:text-amber-400",
	discount: "text-sky-600 dark:text-sky-400",
	neutral: "text-muted-foreground",
} as const;

const DOT_STYLES = {
	elevated: "bg-amber-500",
	discount: "bg-sky-500",
	neutral: "bg-muted-foreground/50",
} as const;

function Stat({
	label,
	value,
	hint,
	className,
}: {
	label: string;
	value: string;
	hint?: string;
	className?: string;
}) {
	return (
		<div>
			<div className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div
				className={cn("text-2xl font-semibold tabular-nums mt-1", className)}
			>
				{value}
			</div>
			{hint && (
				<div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
			)}
		</div>
	);
}

export function BubbleSummaryPanel({
	summary,
	stock,
	tauGroup,
	loading,
}: BubbleSummaryPanelProps) {
	if (loading || !summary) {
		return (
			<Card className="mb-5">
				<CardContent className="p-5">
					<div className="h-24 animate-pulse rounded bg-muted/50" />
				</CardContent>
			</Card>
		);
	}

	const reading = interpret(summary);
	const horizon = tauGroup?.mean ?? 0.25;

	return (
		<Card className="mb-5">
			<CardContent className="p-5">
				<div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
					<div className="flex items-center gap-2">
						<span
							className={cn("h-2 w-2 rounded-full", DOT_STYLES[reading.tone])}
						/>
						<h2
							className={cn("text-sm font-semibold", TONE_STYLES[reading.tone])}
						>
							{reading.label}
						</h2>
					</div>
					<p className="text-xs text-muted-foreground">
						{STOCK_NAMES[stock]} · combined put/call estimator · τ ≈ {horizon}y
						· as of {fmtDate(summary.date)}
					</p>
				</div>

				<div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
					<Stat
						label="Bubble"
						value={`${summary.percentOfPrice >= 0 ? "" : "−"}${fmtNum(Math.abs(summary.percentOfPrice))}%`}
						hint="of spot price"
						className={TONE_STYLES[reading.tone]}
					/>
					<Stat
						label="In price units"
						value={fmtNum(summary.value)}
						hint={`spot ${fmtNum(summary.stockPrice)}`}
					/>
					<Stat
						label="95% interval"
						value={`${fmtNum(summary.lb, 1)} – ${fmtNum(summary.ub, 1)}`}
						hint={summary.significant ? "excludes zero" : "includes zero"}
					/>
					<Stat
						label="Historical rank"
						value={`${Math.round(summary.percentile)}th`}
						hint="percentile since 1996"
					/>
				</div>

				<p className="mt-4 text-sm text-muted-foreground leading-relaxed">
					{reading.blurb}
				</p>
			</CardContent>
		</Card>
	);
}
