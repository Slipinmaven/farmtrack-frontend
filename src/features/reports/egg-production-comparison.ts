export type EggProductionPeriod = "today" | "week" | "month" | "custom" | "all";

export type ComparisonDateRange = {
  from: string;
  to: string;
};

export type EggProductionComparison = {
  current: ComparisonDateRange;
  previous: ComparisonDateRange;
  label: string;
};

export function getComparisonRange({
  period,
  from,
  to,
  today,
  weekStart,
}: {
  period: EggProductionPeriod;
  from: string;
  to: string;
  today: string;
  weekStart: number;
}): EggProductionComparison | null {
  if (period === "all") return null;

  const normalizedWeekStart = normalizeWeekStart(weekStart);
  if (normalizedWeekStart === null) return null;

  const todayDate = parseDate(today);
  if (!todayDate) return null;

  let currentFrom: Date;
  let currentTo = todayDate;
  let previousFrom: Date;
  let previousTo: Date;
  let labelPrefix: string;

  if (period === "today") {
    currentFrom = todayDate;
    previousFrom = addDays(todayDate, -1);
    previousTo = previousFrom;
    labelPrefix = "vs yesterday";
  } else if (period === "week") {
    const offset = (todayDate.getUTCDay() - normalizedWeekStart + 7) % 7;
    currentFrom = addDays(todayDate, -offset);
    const elapsedDays = offset + 1;
    previousFrom = addDays(currentFrom, -7);
    previousTo = addDays(previousFrom, elapsedDays - 1);
    labelPrefix = "vs last week";
  } else if (period === "month") {
    currentFrom = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1));
    const previousMonthEnd = new Date(
      Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 0),
    );
    const previousMonthStart = new Date(
      Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1),
    );
    const elapsedDays = todayDate.getUTCDate();
    previousFrom = previousMonthStart;
    previousTo = new Date(
      Date.UTC(
        previousMonthStart.getUTCFullYear(),
        previousMonthStart.getUTCMonth(),
        Math.min(elapsedDays, previousMonthEnd.getUTCDate()),
      ),
    );
    labelPrefix = "vs last month";
  } else {
    const customFrom = parseDate(from);
    const customTo = parseDate(to);
    if (!customFrom || !customTo || customFrom > customTo) return null;
    currentFrom = customFrom;
    currentTo = customTo;
    const duration =
      Math.round((customTo.getTime() - customFrom.getTime()) / 86_400_000) + 1;
    previousTo = addDays(customFrom, -1);
    previousFrom = addDays(previousTo, -duration + 1);
    labelPrefix = "vs previous period";
  }

  return {
    current: { from: toIsoDate(currentFrom), to: toIsoDate(currentTo) },
    previous: { from: toIsoDate(previousFrom), to: toIsoDate(previousTo) },
    label: `${labelPrefix} (${formatComparisonDateRange({
      from: toIsoDate(previousFrom),
      to: toIsoDate(previousTo),
    })})`,
  };
}

export function getEggProductionComparisonResult(
  current: number,
  previous: number,
): {
  kind: "new" | "empty" | "equal" | "up" | "down";
  change: number;
  percentage: number | null;
} {
  const change = current - previous;
  if (previous === 0) {
    return {
      kind: current === 0 ? "empty" : "new",
      change,
      percentage: null,
    };
  }
  if (change === 0) return { kind: "equal", change: 0, percentage: 0 };
  return {
    kind: change > 0 ? "up" : "down",
    change,
    percentage: (Math.abs(change) / previous) * 100,
  };
}

export function formatComparisonDateRange(range: ComparisonDateRange): string {
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  if (!from || !to) return "";
  if (range.from === range.to) return formatComparisonDate(from);
  return `${formatComparisonDate(from)} – ${formatComparisonDate(to)}`;
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function normalizeWeekStart(weekStart: number): number | null {
  if (!Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6) return null;
  return weekStart;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatComparisonDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
