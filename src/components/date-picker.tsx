import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
	date?: Date;
	onSelect?: (date: Date | undefined) => void;
	placeholder?: string;
	disabled?: boolean;
	minDate?: Date;
	maxDate?: Date;
	className?: string;
}

export function DatePicker({
	date,
	onSelect,
	placeholder = "Pick a date",
	disabled = false,
	minDate,
	maxDate,
	className,
}: DatePickerProps) {
	const [month, setMonth] = React.useState<Date>(date || new Date());

	// Update month when date prop changes
	React.useEffect(() => {
		if (date) {
			setMonth(date);
		}
	}, [date]);

	// Calculate the valid month range
	const getValidMonthRange = () => {
		if (!minDate || !maxDate) return { start: undefined, end: undefined };

		const startMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
		const endMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

		return { start: startMonth, end: endMonth };
	};

	const { start: startMonth, end: endMonth } = getValidMonthRange();

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					disabled={disabled}
					className={cn(
						"w-[240px] justify-start text-left font-normal",
						!date && "text-muted-foreground",
						className,
					)}
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{date ? format(date, "MMM dd, yyyy") : <span>{placeholder}</span>}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={date}
					onSelect={onSelect}
					month={month}
					onMonthChange={(newMonth) => {
						// Only allow month change if within valid range
						if (!startMonth || !endMonth) {
							setMonth(newMonth);
							return;
						}

						const targetMonth = new Date(
							newMonth.getFullYear(),
							newMonth.getMonth(),
							1,
						);
						if (targetMonth >= startMonth && targetMonth <= endMonth) {
							setMonth(newMonth);
						}
					}}
					disabled={(date) => {
						if (minDate && date < minDate) return true;
						if (maxDate && date > maxDate) return true;
						return false;
					}}
					showOutsideDays={true}
					autoFocus
					captionLayout="dropdown"
					startMonth={startMonth}
					endMonth={endMonth}
				/>
			</PopoverContent>
		</Popover>
	);
}
