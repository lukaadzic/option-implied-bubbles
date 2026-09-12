import { DatePicker } from "@/components/date-picker";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import React from "react";
import {
	type BubbleScale,
	STOCK_LIST,
	STOCK_NAMES,
	type StockCode,
} from "../types/bubbleData";

interface DashboardControlsProps {
	selectedStock: StockCode;
	startDate: Date | null;
	endDate: Date | null;
	scale: BubbleScale;
	onStockChange: (stock: StockCode) => void;
	onScaleChange: (scale: BubbleScale) => void;
	onDateRangeChange: (startDate: Date | null, endDate: Date | null) => void;
	onResetDateRange: () => void;
	availableDateRange: { min: Date; max: Date } | null;
	loading?: boolean;
}

const SCALES: { value: BubbleScale; label: string; hint: string }[] = [
	{
		value: "percent",
		label: "% of price",
		hint: "Comparable across assets and across decades",
	},
	{
		value: "price",
		label: "Price units",
		hint: "Raw estimator output, in index points or dollars",
	},
];

function Field({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label
				htmlFor={htmlFor}
				className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
			>
				{label}
			</label>
			{children}
		</div>
	);
}

export const DashboardControls = React.memo(function DashboardControls({
	selectedStock,
	startDate,
	endDate,
	scale,
	onStockChange,
	onScaleChange,
	onDateRangeChange,
	onResetDateRange,
	availableDateRange,
	loading,
}: DashboardControlsProps) {
	return (
		<Card className="mb-5">
			<CardContent className="p-5">
				<div className="flex flex-wrap items-end gap-4">
					<Field label="Asset" htmlFor="stock-select">
						<Select
							value={selectedStock}
							onValueChange={onStockChange}
							disabled={loading}
						>
							<SelectTrigger id="stock-select" className="w-[230px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{STOCK_LIST.map((stock) => (
									<SelectItem key={stock} value={stock}>
										<span className="font-medium">{stock}</span>
										<span className="ml-2 text-muted-foreground">
											{STOCK_NAMES[stock]}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<Field label="From">
						<DatePicker
							date={startDate ?? undefined}
							onSelect={(date) => onDateRangeChange(date ?? null, endDate)}
							minDate={availableDateRange?.min}
							maxDate={endDate ?? availableDateRange?.max}
							disabled={loading}
							placeholder="Start"
						/>
					</Field>

					<Field label="To">
						<DatePicker
							date={endDate ?? undefined}
							onSelect={(date) => onDateRangeChange(startDate, date ?? null)}
							minDate={startDate ?? availableDateRange?.min}
							maxDate={availableDateRange?.max}
							disabled={loading}
							placeholder="End"
						/>
					</Field>

					<Field label="Bubble scale">
						{/* A segmented control rather than a dropdown: two options that get
						    toggled often should not cost two clicks. */}
						<fieldset className="inline-flex rounded-md border border-border p-0.5">
							<legend className="sr-only">Bubble scale</legend>
							{SCALES.map((option) => (
								<label
									key={option.value}
									title={option.hint}
									className={cn(
										"cursor-pointer rounded px-3 py-1.5 text-sm transition-colors",
										scale === option.value
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<input
										type="radio"
										name="bubble-scale"
										className="sr-only"
										checked={scale === option.value}
										onChange={() => onScaleChange(option.value)}
									/>
									{option.label}
								</label>
							))}
						</fieldset>
					</Field>

					<Button
						type="button"
						variant="outline"
						onClick={onResetDateRange}
						disabled={loading}
					>
						<RotateCcw className="mr-2 h-4 w-4" />
						Full range
					</Button>

					<div className="ml-auto">
						<ThemeSwitcher />
					</div>
				</div>
			</CardContent>
		</Card>
	);
});
