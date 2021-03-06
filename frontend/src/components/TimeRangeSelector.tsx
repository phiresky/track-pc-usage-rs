import { observer, useLocalObservable } from "mobx-react"
import React from "react"
import * as dfn from "date-fns"
import "react-dates/initialize"
import "react-dates/lib/css/_datepicker.css"
import {
	DateRangePicker,
	DayPickerRangeController,
	SingleDatePicker,
} from "react-dates"
import moment from "moment"
import {
	Button,
	ButtonGroup,
	Card,
	DropdownItem,
	DropdownMenu,
	DropdownToggle,
	Row as div,
	UncontrolledDropdown,
} from "reactstrap"

const Modes = ["day", "week", "month"] as const
export type TimeRangeMode = typeof Modes[number]

export type TimeRangeTarget = {
	from: Date
	to: Date
	mode: TimeRangeMode
}
type TimeRangeStore = {
	focusedW: "startDate" | "endDate" | null
	focused: boolean
	setMode(mode: TimeRangeMode): void
	setDate(d: Date | undefined): void
	back(): void
	forward(): void
}

export function useTimeRange(target: TimeRangeTarget): TimeRangeStore {
	const store = useLocalObservable(() => ({
		focusedW: null as "startDate" | "endDate" | null,
		focused: false,
		setMode(mode: TimeRangeMode) {
			target.mode = mode
			if (mode === "day") {
				target.from = dfn.startOfDay(target.from)
				target.to = dfn.endOfDay(target.from)
			} else if (mode === "week") {
				const s = dfn.subDays(new Date(), 7)
				const d = dfn.min([target.from, s])
				target.from = dfn.startOfDay(d)
				target.to = dfn.endOfDay(dfn.addDays(d, 6))
			} else if (mode === "month") {
				target.from = dfn.startOfMonth(target.from)
				target.to = dfn.endOfMonth(target.from)
			}
		},
		setDate(d: Date | undefined) {
			console.log("set date", d)
			if (!d) d = new Date()
			target.from = dfn.startOfDay(d)
			if (target.mode === "day") target.to = dfn.endOfDay(d)
			else if (target.mode === "week")
				target.to = dfn.endOfDay(dfn.addDays(d, 6))
			else if (target.mode === "month") target.to = dfn.endOfMonth(d)
		},
		back() {
			if (target.mode === "day") {
				this.setDate(dfn.addDays(target.from, -1))
			} else if (target.mode === "week") {
				this.setDate(dfn.addDays(target.from, -7))
			} else if (target.mode === "month") {
				this.setDate(dfn.startOfMonth(dfn.addDays(target.from, -1)))
			}
		},
		forward() {
			if (target.mode === "day") {
				this.setDate(dfn.addDays(target.from, 1))
			} else if (target.mode === "week") {
				this.setDate(dfn.addDays(target.from, 7))
			} else if (target.mode === "month") {
				this.setDate(dfn.startOfMonth(dfn.addDays(target.to, 1)))
			}
		},
	}))
	return store
}
export const TimeRangeSelector: React.FC<{
	target: TimeRangeTarget
}> = observer(({ target }) => {
	const state = useTimeRange(target)
	const commonProps = {
		key: target.mode,
		displayFormat: "YYYY-MM-DD",
		showDefaultInputIcon: true,
	}
	let picker
	if (target.mode === "day")
		picker = (
			<SingleDatePicker
				{...commonProps}
				id="time-range-seli"
				onDateChange={(e) => state.setDate(e?.toDate())}
				focused={state.focused}
				onFocusChange={(focused) => (state.focused = focused.focused)}
				numberOfMonths={1}
				date={moment(target.from)}
				isOutsideRange={(d) => d.isAfter(new Date())}
			/>
		)
	if (target.mode === "week")
		picker = (
			<DateRangePicker
				{...commonProps}
				startDateOffset={(d) => d}
				endDateOffset={(d) => d.add(6, "days")}
				startDateId="time-range-seli1"
				endDateId="timee-range-seli2"
				onDatesChange={(e) => state.setDate(e.startDate?.toDate())}
				focusedInput={state.focusedW}
				onFocusChange={(focused) => (state.focusedW = focused)}
				numberOfMonths={1}
				startDate={moment(target.from)}
				endDate={moment(target.to)}
				isOutsideRange={(d) => d.isAfter(new Date())}
			/>
		)
	if (target.mode === "month")
		picker = (
			<DateRangePicker
				{...commonProps}
				showDefaultInputIcon
				startDateOffset={(d) => d.startOf("month")}
				endDateOffset={(d) => d.endOf("month")}
				startDateId="time-range-seliq1"
				endDateId="timee-range-seliq2"
				onDatesChange={(e) => state.setDate(e.startDate?.toDate())}
				focusedInput={state.focusedW}
				onFocusChange={(focused) => (state.focusedW = focused)}
				numberOfMonths={1}
				startDate={moment(target.from)}
				endDate={moment(target.to)}
				isOutsideRange={(d) => false}
			/>
		)
	return (
		<Card className="time-range-selector mt-3 mb-4">
			<div>
				<Button
					title="day before"
					className="caretbutton"
					onClick={() => state.back()}
				>
					{"<"}
				</Button>
				<select
					className="btn"
					value={target.mode}
					onChange={(e) =>
						state.setMode(e.currentTarget.value as TimeRangeMode)
					}
				>
					{Modes.map((mode) => (
						<option key={mode} value={mode}>
							{mode}
						</option>
					))}
				</select>
				{picker}
				{target.to < new Date() && (
					<Button
						className="caretbutton"
						title="day after"
						onClick={() => state.forward()}
					>
						{">"}
					</Button>
				)}
			</div>
		</Card>
	)
})

export const TimeRangeSelectorSimple: React.FC<{
	target: TimeRangeTarget
}> = observer(({ target }) => {
	const state = useTimeRange(target)
	let picker: string
	if (target.mode === "day") {
		const date = dfn.isToday(target.from)
			? "today"
			: dfn.isYesterday(target.from)
			? "yesterday"
			: dfn.format(target.from, "yyyy-MM-dd")
		picker = date
	} else if (target.mode === "week") {
		picker =
			dfn.format(target.from, "yyyy-MM-dd") +
			" to " +
			dfn.format(target.to, "yyyy-MM-dd")
	} else if (target.mode === "month") {
		picker = dfn.format(target.from, "MMM. yyyy")
	} else {
		throw Error(`unknown mode ${target.mode}`)
	}

	return (
		<ButtonGroup>
			<Button
				title="day before"
				className="caretbutton"
				onClick={() => state.back()}
			>
				{"<"}
			</Button>
			<UncontrolledDropdown className="btn-group">
				<DropdownToggle caret>{picker}</DropdownToggle>
				<DropdownMenu>
					{Modes.map((mode) => (
						<DropdownItem
							key={mode}
							onClick={() => state.setMode(mode)}
						>
							{mode === target.mode ? picker : mode}
						</DropdownItem>
					))}
				</DropdownMenu>
			</UncontrolledDropdown>
			{target.to < new Date() && (
				<Button
					className="caretbutton"
					title="day after"
					onClick={() => state.forward()}
				>
					{">"}
				</Button>
			)}
		</ButtonGroup>
	)
})
