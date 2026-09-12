import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { BlockMath, InlineMath } from "react-katex";

/**
 * What the numbers mean, on the page rather than only in the README. A chart of
 * an unfamiliar estimator is unreadable without it, and a reader who has to go
 * find the paper first will not.
 */
export function MethodologyNote() {
	return (
		<Card className="mt-6">
			<CardContent className="p-5">
				<h3 className="text-base font-semibold tracking-tight">
					How the estimate is built
				</h3>

				<div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
					<p>
						A bubble is the gap between what an asset trades for and what it is
						worth. The hard part is the second number. This method reads it out
						of the option market instead of assuming a pricing model: the
						cross-section of puts and calls at a single maturity pins down the
						risk-neutral distribution of the future price, and the discounted
						mean of that distribution is the fundamental value.
					</p>

					<BlockMath math="\hat{\Pi}_t(\tau) \;=\; S_t \;-\; e^{-r\tau}\,\mathbb{E}^{\mathbb{Q}}_t\!\left[S_{t+\tau}\right]" />

					<p>
						<InlineMath math="S_t" /> is the spot price and the second term is
						the option-implied fundamental value at horizon{" "}
						<InlineMath math="\tau" />. A positive reading means the market is
						paying more than the options imply the asset is worth. The shaded
						band is the confidence interval; when it contains zero the reading
						is not distinguishable from no bubble, which is why the summary
						above reads the interval rather than the midpoint.
					</p>

					<p>
						Estimates are grouped into three maturity windows because option
						liquidity clusters around common expiries. The horizon matters: for
						the S&amp;P 500 the 2006&ndash;07 run-up is clear at{" "}
						<InlineMath math="\tau \approx 1" /> year and close to invisible at{" "}
						<InlineMath math="\tau \approx 0.25" />.
					</p>

					<p>
						Put-only and call-only estimates are shown separately because they
						disagree in a structured way, with puts running high and calls
						running low across most of the sample. That ordering is not noise:
						a call price bounds the fundamental value from above and a put
						price bounds it from below, so the two one-sided series bracket the
						combined one. Both bounds are sharpest at deep in-the-money
						strikes, which are the least liquid contracts on the board, so in
						practice both stay loose. Read the combined series for a number and
						the spread between the other two as a measure of how much the
						option market actually pins down.
					</p>
				</div>

				<div className="mt-4 border-t border-border pt-4">
					<p className="text-sm">
						<span className="text-muted-foreground">Method from </span>
						<a
							href="https://doi.org/10.1002/jae.2862"
							target="_blank"
							rel="noreferrer"
							className="font-medium underline underline-offset-4 hover:text-primary"
						>
							Jarrow &amp; Kwok (2021), &ldquo;Inferring financial bubbles from
							option data&rdquo;
							<ExternalLink className="ml-1 inline h-3 w-3" />
						</a>
						<span className="text-muted-foreground">
							, Journal of Applied Econometrics 36(7), 1013&ndash;1046.
						</span>
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
