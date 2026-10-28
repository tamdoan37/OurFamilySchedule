export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function titlesSimilar(left: string, right: string): boolean {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  return a.length > 0 && a === b;
}

export function sameStartMinute(left: Date, right: Date): boolean {
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
    && left.getHours() === right.getHours()
    && left.getMinutes() === right.getMinutes();
}

export function draftProblems(row: { title: string; start: Date; end: Date }): string[] {
  const problems: string[] = [];
  if (!row.title.trim()) problems.push('Add a title');
  if (Number.isNaN(row.start.getTime()) || Number.isNaN(row.end.getTime())) {
    problems.push('Date is not valid');
    return problems;
  }
  if (row.end.getTime() < row.start.getTime()) problems.push('End time is before the start time');
  return problems;
}

export function findDuplicateId(
  row: { title: string; start: Date },
  events: { id: string; title: string; startTime: string }[],
): string {
  const match = events.find((event) => titlesSimilar(event.title, row.title) && sameStartMinute(new Date(event.startTime), row.start));
  return match?.id ?? '';
}
