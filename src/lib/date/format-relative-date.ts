export function formatRelativeDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const elapsedSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (elapsedSeconds >= 0 && elapsedSeconds < 60) return "Just now";
  if (elapsedSeconds >= 60 && elapsedSeconds < 3600) {
    const minutes = Math.floor(elapsedSeconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  const calendarDays = getCalendarDaysAgo(date, now);
  if (calendarDays === 0) {
    const hours = Math.floor(elapsedSeconds / 3600);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (calendarDays === 1) return "Yesterday";
  if (calendarDays > 1 && calendarDays < 7) return `${calendarDays} days ago`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatRelativeDateTime(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const calendarDays = getCalendarDaysAgo(date, now);
  if (calendarDays === 0) return `Today at ${time}`;
  if (calendarDays === 1) return `Yesterday at ${time}`;
  if (calendarDays > 1 && calendarDays < 7) {
    return `${calendarDays} days ago at ${time}`;
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
  return `${dateLabel} at ${time}`;
}

function getCalendarDaysAgo(date: Date, now: Date): number {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );
}
