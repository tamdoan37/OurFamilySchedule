import * as chrono from 'chrono-node';

const TIMED_CONFIDENCE = 0.62;
const LOW_CONFIDENCE = 0.35;
const PAST_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const MONTH_NAME_RE = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const WEEKDAY_RE = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/i;
const EVERY_RE = /\bevery\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/i;
const SLASH_DATE_RE = /\b\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?\b/;
const FULL_HYPHEN_DATE_RE = /\b\d{1,2}-\d{1,2}-\d{2,4}\b/;
const CLOCK_RE = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b\d{1,2}:\d{2}\b/i;
const TBD_RE = /\b(?:tbd|tba)\b/i;
const TIME_RE = new RegExp(`${TBD_RE.source}|${CLOCK_RE.source}`, 'i');
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const SEASON_RE = /\bseason\s+runs\b/i;
const PLACE_WORD = /^(?:fields|field|parks|park|gyms|gym|courts|court|studios|studio|clinics|clinic|rooms|room|rinks|rink|pools|pool|halls|hall|centers|center|centres|centre)$/i;
const DANGLING = /^(?:is|are|at|on|the|a|an|vs|v|to|for|with|from|and|or|of|in|by|every)$/i;
const SMALL = new Set(['vs', 'v', 'the', 'a', 'an', 'at', 'on', 'is', 'to', 'for', 'and', 'or', 'of', 'in', 'by', 'from']);
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'vs', 'game']);

export type TextDraft = {
  title: string;
  start: string;
  end: string;
  location: string;
  confidence: number;
  rawText: string;
  timeTbd: boolean;
  repeat?: 'weekly';
  seriesUntil?: string;
};

export function draftsFromRecognizedText(text: string, now = new Date()): TextDraft[] {
  const seen = new Set<string>();
  const drafts: TextDraft[] = [];
  for (const row of layoutRows(text)) {
    const draft = draftFromRow(row, now);
    if (!draft) continue;
    const key = `${draft.title.toLowerCase()}|${draft.start.slice(0, 16)}|${draft.repeat ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(draft);
  }
  return drafts;
}

export function defaultSeriesEnd(start: Date): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + 8 * 7);
  return end;
}

export function weeklyDates(start: Date, until: Date): Date[] {
  const dates: Date[] = [];
  const end = new Date(until);
  end.setHours(23, 59, 59, 999);
  const cursor = new Date(start);
  if (end.getTime() < cursor.getTime()) return [new Date(start)];
  for (let guard = 0; cursor.getTime() <= end.getTime() && guard < 52; guard += 1) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates.length > 0 ? dates : [new Date(start)];
}

export function parseModelEvents(eventsJson: string): unknown {
  const start = eventsJson.indexOf('[');
  const end = eventsJson.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    return JSON.parse(eventsJson.slice(start, end + 1)) as unknown;
  } catch {
    return [];
  }
}

export function groundModelDrafts(ocr: string, raw: unknown, now: Date): TextDraft[] {
  if (!Array.isArray(raw)) return [];
  const hay = ocr.toLowerCase();
  const drafts: TextDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? tidyTitle(record.title) : '';
    if (!titleGrounded(title, hay)) continue;
    const rawText = typeof record.rawText === 'string' && record.rawText.trim() ? record.rawText.trim() : title;
    const source = `${rawText}\n${title}`;
    if (SEASON_RE.test(source) || monthWithoutDay(source)) continue;
    let start = parseWhen(typeof record.start === 'string' ? record.start : '', source, now);
    if (!start) continue;
    const low = isLowTime(source);
    start = placeOnCalendar(start.getMonth(), start.getDate(), low ? 12 : start.getHours(), low ? 0 : start.getMinutes(), source, now) ?? start;
    if (low) start.setHours(12, 0, 0, 0);
    let end = parseWhen(typeof record.end === 'string' ? record.end : '', source, now);
    if (low || !end || end.getTime() <= start.getTime()) end = new Date(start.getTime() + 60 * 60 * 1000);
    let confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? Math.min(1, Math.max(0, record.confidence))
      : 0.9;
    if (low) confidence = LOW_CONFIDENCE;
    const location = typeof record.location === 'string' ? groundedLocation(record.location, hay) : '';
    const weekly = EVERY_RE.test(source);
    drafts.push({
      title,
      start: offsetISO(start),
      end: offsetISO(end),
      location,
      confidence,
      rawText,
      timeTbd: low,
      repeat: weekly ? 'weekly' : undefined,
      seriesUntil: weekly ? offsetISO(defaultSeriesEnd(start)) : undefined,
    });
  }
  return drafts;
}

export function offsetISO(date: Date): string {
  const pad = (value: number) => String(Math.abs(value)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function layoutRows(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return zipColumns(lines) ?? groupRows(lines);
}

function zipColumns(lines: string[]): string[] | null {
  if (lines.length < 4) return null;
  const groups: string[][] = [];
  for (const line of lines) {
    const kind = lineKind(line);
    const last = groups[groups.length - 1];
    if (last && lineKind(last[0]) === kind) last.push(line);
    else groups.push([line]);
  }
  const dateGroup = groups.find((group) => group.length >= 2 && lineKind(group[0]) === 'date');
  if (!dateGroup) return null;
  const width = dateGroup.length;
  if (!groups.some((group) => group !== dateGroup && group.length === width)) return null;
  const rows: string[] = [];
  for (let index = 0; index < width; index += 1) {
    rows.push(groups.filter((group) => group.length === width).map((group) => group[index]).join(' | '));
  }
  return rows;
}

function lineKind(line: string): 'date' | 'time' | 'place' | 'text' {
  if (hasSpecificDay(line) && !CLOCK_RE.test(line)) return 'date';
  if ((CLOCK_RE.test(line) || TBD_RE.test(line)) && !hasSpecificDay(line)) return 'time';
  if (looksLikePlace(line) && !hasSpecificDay(line)) return 'place';
  if (hasSpecificDay(line)) return 'date';
  return 'text';
}

function groupRows(lines: string[]): string[] {
  const rows: string[][] = [];
  let current: string[] | null = null;
  let carryDate = '';
  for (const line of lines) {
    const dated = hasDate(line);
    const timed = TIME_RE.test(line);
    const every = EVERY_RE.test(line);
    const season = SEASON_RE.test(line);
    if (dated && !season) {
      const snippet = dateSnippet(line);
      if (snippet && hasSpecificDay(snippet)) carryDate = snippet;
    }
    const starts = every || season || dated || (timed && (!current || current.some((item) => TIME_RE.test(item))));
    if (!starts) {
      if (current && !SEASON_RE.test(current.join(' ')) && (needsTitle(current) || looksLikePlace(line))) current.push(line);
      else if (timed || every || dated) {
        if (current) rows.push(current);
        current = !dated && timed && carryDate ? [carryDate, line] : [line];
      }
      continue;
    }
    if (current) rows.push(current);
    current = !dated && timed && carryDate && !every ? [carryDate, line] : [line];
  }
  if (current) rows.push(current);
  return rows.map((row) => row.join('\n'));
}

function hasDate(line: string): boolean {
  if (MONTH_NAME_RE.test(line) || SLASH_DATE_RE.test(line) || FULL_HYPHEN_DATE_RE.test(line)) return true;
  if (!/\b\d{1,2}-\d{1,2}\b/.test(line)) return false;
  if (/:/.test(line) || /(?:a\.?m\.?|p\.?m\.?)/i.test(line)) return false;
  return true;
}

function hasSpecificDay(row: string): boolean {
  if (SLASH_DATE_RE.test(row) || FULL_HYPHEN_DATE_RE.test(row)) return true;
  if (!MONTH_NAME_RE.test(row)) return false;
  return /\b(?:[1-9]|[12]\d|3[01])\b/.test(row.replace(YEAR_RE, ' '));
}

function monthWithoutDay(row: string): boolean {
  if (EVERY_RE.test(row) || SLASH_DATE_RE.test(row) || FULL_HYPHEN_DATE_RE.test(row)) return false;
  if (!MONTH_NAME_RE.test(row)) return false;
  return !/\b(?:[1-9]|[12]\d|3[01])\b/.test(row.replace(YEAR_RE, ' '));
}

function needsTitle(row: string[]): boolean {
  const leftover = row.join(' ')
    .replace(CLOCK_RE, ' ')
    .replace(TBD_RE, ' ')
    .replace(MONTH_NAME_RE, ' ')
    .replace(WEEKDAY_RE, ' ')
    .replace(SLASH_DATE_RE, ' ')
    .replace(FULL_HYPHEN_DATE_RE, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
  return leftover.length === 0;
}

function looksLikePlace(line: string): boolean {
  return line.split(/\s+/).some((token) => PLACE_WORD.test(token.replace(/[^A-Za-z]/g, '')));
}

function dateSnippet(line: string): string {
  const dated = chrono.parse(line, new Date(), { forwardDate: false }).find((result) => isRealDateText(result.text));
  if (!dated) return '';
  return tidy(dated.text.replace(CLOCK_RE, ' ').replace(TBD_RE, ' '));
}

function draftFromRow(row: string, now: Date): TextDraft | null {
  if (SEASON_RE.test(row) || monthWithoutDay(row)) return null;
  if (EVERY_RE.test(row)) return weeklyDraft(row, now);
  const results = chrono.parse(row, now, { forwardDate: false });
  const chosen = chooseDate(results);
  if (!chosen) return null;
  const parsed = chosen.start.date();
  const timeTbd = isLowTime(row);
  const clock = timeTbd ? null : clockOn(results, chosen);
  const hour = clock ? clock.hour : 12;
  const minute = clock ? clock.minute : 0;
  const placed = placeOnCalendar(parsed.getMonth(), parsed.getDate(), hour, minute, row, now);
  if (!placed) return null;
  const start = new Date(placed);
  if (timeTbd) start.setHours(12, 0, 0, 0);
  let end = new Date(start.getTime() + 60 * 60 * 1000);
  if (!timeTbd) {
    const ranged = rangeEnd(row, start);
    if (ranged) end = ranged;
  }
  const { title, location } = splitTitleAndLocation(stripSpans(row, results.filter((result) => isRealDateText(result.text))));
  if (!title) return null;
  return {
    title,
    start: offsetISO(start),
    end: offsetISO(end),
    location,
    confidence: timeTbd ? LOW_CONFIDENCE : TIMED_CONFIDENCE,
    rawText: row.replace(/\s+/g, ' ').trim(),
    timeTbd,
  };
}

function weeklyDraft(row: string, now: Date): TextDraft | null {
  const match = row.match(EVERY_RE);
  const weekday = match ? weekdayIndex(match[1]) : null;
  if (weekday == null) return null;
  const results = chrono.parse(row, now, { forwardDate: true });
  const timeTbd = isLowTime(row);
  const timed = results.find((result) => result.start.isCertain('hour'));
  const hour = !timeTbd && timed?.start.get('hour') != null ? timed.start.get('hour') as number : 12;
  const minute = !timeTbd && timed ? timed.start.get('minute') ?? 0 : 0;
  const start = nextWeekday(weekday, hour, minute, now);
  if (timeTbd) start.setHours(12, 0, 0, 0);
  let end = new Date(start.getTime() + 60 * 60 * 1000);
  if (!timeTbd) {
    const ranged = rangeEnd(row, start);
    if (ranged) end = ranged;
  }
  const parts = splitTitleAndLocation(stripSpans(row, results));
  if (!parts.title) return null;
  return {
    title: parts.title,
    start: offsetISO(start),
    end: offsetISO(end),
    location: parts.location,
    confidence: timeTbd ? LOW_CONFIDENCE : TIMED_CONFIDENCE,
    rawText: row.replace(/\s+/g, ' ').trim(),
    timeTbd,
    repeat: 'weekly',
    seriesUntil: offsetISO(defaultSeriesEnd(start)),
  };
}

function clockOn(results: chrono.ParsedResult[], chosen: chrono.ParsedResult): { hour: number; minute: number } | null {
  const timed = results.find((result) => result.start.isCertain('hour') && CLOCK_RE.test(result.text));
  const picked = timed ?? (chosen.start.isCertain('hour') && CLOCK_RE.test(chosen.text) ? chosen : undefined);
  if (!picked) return null;
  const hour = picked.start.get('hour');
  if (hour == null) return null;
  return { hour, minute: picked.start.get('minute') ?? 0 };
}

function nextWeekday(weekday: number, hour: number, minute: number, now: Date): Date {
  const start = new Date(now);
  start.setHours(hour, minute, 0, 0);
  const delta = (weekday - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + delta);
  if (start.getTime() <= now.getTime()) start.setDate(start.getDate() + 7);
  return start;
}

function placeOnCalendar(month: number, day: number, hour: number, minute: number, row: string, now: Date): Date | null {
  const explicit = row.match(YEAR_RE);
  if (explicit) {
    const dated = new Date(Number(explicit[0]), month, day, hour, minute, 0, 0);
    return dated.getMonth() === month ? dated : null;
  }
  const weekday = hasSpecificDay(row) ? namedWeekday(row) : null;
  if (weekday != null) {
    let best: Date | null = null;
    let bestDistance = Infinity;
    for (let year = now.getFullYear() - 1; year <= now.getFullYear() + 8; year += 1) {
      const candidate = new Date(year, month, day, hour, minute, 0, 0);
      if (candidate.getMonth() !== month || candidate.getDate() !== day || candidate.getDay() !== weekday) continue;
      const distance = Math.abs(candidate.getTime() - now.getTime());
      const prefer = distance < bestDistance || (distance === bestDistance && best != null && candidate.getTime() > best.getTime());
      if (best == null || prefer) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (best) return best;
  }
  const thisYear = new Date(now.getFullYear(), month, day, hour, minute, 0, 0);
  if (thisYear.getMonth() !== month) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(thisYear.getFullYear(), thisYear.getMonth(), thisYear.getDate());
  if (eventDay.getTime() >= today.getTime() - PAST_WINDOW_MS) return thisYear;
  return new Date(now.getFullYear() + 1, month, day, hour, minute, 0, 0);
}

function namedWeekday(text: string): number | null {
  const match = text.match(WEEKDAY_RE);
  if (!match) return null;
  return weekdayIndex(match[1]);
}

function weekdayIndex(word: string): number | null {
  const name = word.toLowerCase();
  if (name.startsWith('su')) return 0;
  if (name.startsWith('mo')) return 1;
  if (name.startsWith('tu')) return 2;
  if (name.startsWith('we')) return 3;
  if (name.startsWith('th')) return 4;
  if (name.startsWith('fr')) return 5;
  if (name.startsWith('sa')) return 6;
  return null;
}

function isRealDateText(text: string): boolean {
  return MONTH_NAME_RE.test(text) || SLASH_DATE_RE.test(text) || FULL_HYPHEN_DATE_RE.test(text);
}

function chooseDate(results: chrono.ParsedResult[]): chrono.ParsedResult | null {
  const real = results.filter((result) => isRealDateText(result.text) && result.start.isCertain('day'));
  if (real.length === 0) return null;
  return real.reduce((best, result) => (dateScore(result) > dateScore(best) ? result : best));
}

function dateScore(result: chrono.ParsedResult): number {
  let score = 0;
  if (MONTH_NAME_RE.test(result.text)) score += 4;
  if (SLASH_DATE_RE.test(result.text) || FULL_HYPHEN_DATE_RE.test(result.text)) score += 4;
  if (WEEKDAY_RE.test(result.text)) score += 1;
  return score + Math.min(result.text.length, 80) / 1000;
}

function rangeEnd(row: string, start: Date): Date | null {
  const match = row.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return null;
  const minute = Number(match[5] ?? '0');
  const spoken = `${match[3] || ''} ${match[6] || ''}`.toLowerCase();
  let hour = Number(match[4]);
  if (spoken.includes('p') && hour < 12) hour += 12;
  if (spoken.includes('a') && hour === 12) hour = 0;
  const end = new Date(start);
  end.setHours(hour, minute, 0, 0);
  if (!spoken.includes('p') && !spoken.includes('a') && end.getTime() <= start.getTime() && hour < 12) {
    end.setHours(hour + 12, minute, 0, 0);
  }
  return end.getTime() > start.getTime() ? end : null;
}

function stripSpans(row: string, results: chrono.ParsedResult[]): string {
  const spans = results
    .map((result) => ({ index: result.index, length: result.text.length }))
    .sort((left, right) => right.index - left.index);
  let text = row;
  for (const span of spans) {
    text = `${text.slice(0, span.index)} ${text.slice(span.index + span.length)}`;
  }
  return tidy(text.replace(TBD_RE, ' ').replace(new RegExp(CLOCK_RE.source, 'gi'), ' ').replace(EVERY_RE, ' ').replace(/[|•·]+/g, ' '));
}

function splitTitleAndLocation(text: string): { title: string; location: string } {
  const cleaned = tidy(text);
  if (!cleaned) return { title: '', location: '' };
  const tokens = cleaned.split(' ');
  const placeIndex = tokens.findIndex((token) => PLACE_WORD.test(token.replace(/[^A-Za-z]/g, '')));
  if (placeIndex >= 0) {
    let start = placeIndex;
    while (start > 0 && isCapitalized(tokens[start - 1]) && !isOpponentToken(tokens, start - 1)) {
      if (!hasContentWord(tokens.slice(0, start - 1).join(' '))) break;
      start -= 1;
    }
    const title = tidyTitle(tokens.slice(0, start).join(' '));
    if (title) return { title, location: tidy(tokens.slice(start).join(' ')) };
  }
  const at = cleaned.match(/^(.*?)\s+(?:@|at)\s+(.+)$/i);
  if (at?.[1] && at[2] && hasContentWord(at[1]) && !CLOCK_RE.test(at[2])) {
    return { title: tidyTitle(at[1]), location: tidy(at[2]) };
  }
  return { title: tidyTitle(cleaned), location: '' };
}

function isCapitalized(token: string): boolean {
  const letters = token.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  return letters[0] === letters[0].toUpperCase() && letters[0] !== letters[0].toLowerCase();
}

function isOpponentToken(tokens: string[], index: number): boolean {
  const previous = (tokens[index - 1] || '').replace(/\./g, '').toLowerCase();
  return previous === 'vs' || previous === 'v' || previous === 'versus';
}

function hasContentWord(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  return words.some((word) => !SMALL.has(word));
}

function isLowTime(source: string): boolean {
  return TBD_RE.test(source) || !CLOCK_RE.test(source);
}

function parseWhen(value: string, source: string, now: Date): Date | null {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const fromSource = chrono.parse(source, now, { forwardDate: false }).find((result) => isRealDateText(result.text) && result.start.isCertain('day'));
  return fromSource ? fromSource.start.date() : null;
}

function titleGrounded(title: string, hay: string): boolean {
  const words = title.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const meaningful = words.filter((word) => !STOP.has(word));
  if (meaningful.length > 0) return meaningful.every((word) => hay.includes(word));
  const compact = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return compact.length >= 2 && hay.replace(/[^a-z0-9]+/g, '').includes(compact);
}

function groundedLocation(location: string, hay: string): string {
  const cleaned = tidy(location);
  if (!cleaned) return '';
  const words = cleaned.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  if (words.length > 0 && !words.every((word) => hay.includes(word))) return '';
  return cleaned;
}

function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^[\s,;:\-–—|]+|[\s,;:\-–—|]+$/g, '').trim();
}

function tidyTitle(value: string): string {
  const tokens = tidy(value).split(' ').filter(Boolean);
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1].replace(/^[.,;:\-–—|]+|[.,;:\-–—|]+$/g, '');
    if (!last || DANGLING.test(last)) {
      tokens.pop();
      continue;
    }
    tokens[tokens.length - 1] = last;
    break;
  }
  return tokens.join(' ').trim();
}
