import * as chrono from 'chrono-node';

export type QuickAddPreview = {
  title: string;
  start: Date | null;
  end: Date | null;
  childIds: string[];
  timeTbd: boolean;
  matched: boolean;
};

export function parseQuickAdd(
  text: string,
  children: { id: string; name: string }[],
  now = new Date(),
): QuickAddPreview {
  const childIds: string[] = [];
  let rest = text;
  const ordered = children
    .filter((child) => child.name.trim())
    .sort((left, right) => right.name.trim().length - left.name.trim().length);
  for (const child of ordered) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(child.name.trim())}(?=$|[^A-Za-z0-9])`, 'ig');
    if (!pattern.test(rest)) continue;
    childIds.push(child.id);
    rest = rest.replace(pattern, ' ');
  }
  const results = chrono.parse(rest, now, { forwardDate: true });
  const chosen = results.find((result) => result.start.isCertain('hour'))
    ?? results.find((result) => result.start.isCertain('day') || result.start.isCertain('weekday'))
    ?? null;
  let start: Date | null = null;
  let end: Date | null = null;
  let timeTbd = false;
  if (chosen) {
    start = chosen.start.date();
    timeTbd = !chosen.start.isCertain('hour');
    if (!timeTbd && start.getHours() > 0 && start.getHours() < 7 && !/[ap]\.?m/i.test(chosen.text)) {
      start.setHours(start.getHours() + 12);
    }
    if (timeTbd) start.setHours(12, 0, 0, 0);
    end = new Date(start.getTime() + 60 * 60 * 1000);
    rest = `${rest.slice(0, chosen.index)} ${rest.slice(chosen.index + chosen.text.length)}`;
  }
  const title = tidy(rest) || 'New event';
  return { title, start, end, childIds, timeTbd, matched: !!chosen };
}

function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^[\s,;:\-–—|]+|[\s,;:\-–—|]+$/g, '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
