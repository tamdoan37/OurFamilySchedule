import * as chrono from 'chrono-node';

const TIMED_CONFIDENCE = 0.62;
const LOW_CONFIDENCE = 0.35;
const MONTH_WORD_RE = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;
const SLASH_DATE_RE = /\b\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?\b/;
const FULL_HYPHEN_DATE_RE = /\b\d{1,2}-\d{1,2}-\d{2,4}\b/;
const CLOCK_RE = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b\d{1,2}:\d{2}\b/i;
const TBD_RE = /\b(?:tbd|tba)\b/i;
const TIME_RE = new RegExp(`${TBD_RE.source}|${CLOCK_RE.source}`, 'i');
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const PLACE_RE = /^(.*?)\s+((?:field|park|gym|court|studio|clinic|room|rink|pool|hall|center|centre)\b.*)$/i;
const AT_RE = /^(.*?)\s+(?:@|at)\s+(.+)$/i;
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'vs', 'game']);

export type TextDraft = {
  title: string;
  start: string;
  end: string;
  location: string;
  confidence: number;
  rawText: string;
};

export function draftsFromRecognizedText(text: string, now = new Date()): TextDraft[] {
  const seen = new Set<string>();
  const drafts: TextDraft[] = [];
  for (const row of groupRows(text, now)) {
    const draft = draftFromRow(row, now);
    if (!draft) continue;
    const key = `${draft.title.toLowerCase()}|${draft.start.slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(draft);
  }
  return drafts;
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
    const title = typeof record.title === 'string' ? tidy(record.title) : '';
    if (!titleGrounded(title, hay)) continue;
    const rawText = typeof record.rawText === 'string' && record.rawText.trim() ? record.rawText.trim() : title;
    const source = `${rawText}\n${title}`;
    let start = parseWhen(typeof record.start === 'string' ? record.start : '', source, now);
    if (!start) continue;
    if (!YEAR_RE.test(source)) start = upcoming(start, false, now);
    const low = isLowTime(source);
    if (low) {
      start = new Date(start);
      start.setHours(0, 0, 0, 0);
    }
    let end = parseWhen(typeof record.end === 'string' ? record.end : '', source, now);
    if (low || !end || end.getTime() <= start.getTime()) end = new Date(start.getTime() + 60 * 60 * 1000);
    let confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? Math.min(1, Math.max(0, record.confidence))
      : 0.9;
    if (low) confidence = LOW_CONFIDENCE;
    const location = typeof record.location === 'string' ? groundedLocation(record.location, hay) : '';
    drafts.push({
      title,
      start: offsetISO(start),
      end: offsetISO(end),
      location,
      confidence,
      rawText,
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

function groupRows(text: string, now: Date): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: string[][] = [];
  let current: string[] | null = null;
  let carryDate = '';
  for (const line of lines) {
    const dated = hasDate(line);
    const timed = TIME_RE.test(line);
    if (dated) {
      const snippet = dateSnippet(line, now);
      if (snippet) carryDate = snippet;
    }
    const starts = dated || (timed && (!current || current.some((item) => TIME_RE.test(item))));
    if (!starts) {
      if (current && (needsTitle(current) || looksLikePlace(line))) current.push(line);
      continue;
    }
    if (current) rows.push(current);
    current = !dated && timed && carryDate ? [carryDate, line] : [line];
  }
  if (current) rows.push(current);
  return rows.map((row) => row.join('\n'));
}

function hasDate(line: string): boolean {
  if (MONTH_WORD_RE.test(line) || SLASH_DATE_RE.test(line) || FULL_HYPHEN_DATE_RE.test(line)) return true;
  if (!/\b\d{1,2}-\d{1,2}\b/.test(line)) return false;
  if (/:/.test(line) || /(?:a\.?m\.?|p\.?m\.?)/i.test(line)) return false;
  return true;
}

function needsTitle(row: string[]): boolean {
  const leftover = row.join(' ')
    .replace(CLOCK_RE, ' ')
    .replace(TBD_RE, ' ')
    .replace(MONTH_WORD_RE, ' ')
    .replace(SLASH_DATE_RE, ' ')
    .replace(FULL_HYPHEN_DATE_RE, ' ')
    .replace(/\b\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
  return leftover.length === 0;
}

function looksLikePlace(line: string): boolean {
  return /\b(?:field|park|gym|court|studio|clinic|room|rink|pool|hall|center|centre)\b/i.test(line);
}

function dateSnippet(line: string, now: Date): string {
  const dated = chrono.parse(line, now, { forwardDate: true }).find((result) => hasDay(result));
  if (!dated) return '';
  return tidy(dated.text.replace(CLOCK_RE, ' ').replace(TBD_RE, ' '));
}

function draftFromRow(row: string, now: Date): TextDraft | null {
  const results = chrono.parse(row, now, { forwardDate: true });
  const chosen = results.find((result) => hasDay(result));
  if (!chosen) return null;
  let start = upcoming(chosen.start.date(), YEAR_RE.test(row), now);
  const missingTime = isLowTime(row) || !chosen.start.isCertain('hour');
  if (missingTime) {
    start = new Date(start);
    start.setHours(0, 0, 0, 0);
  }
  let end = new Date(start.getTime() + 60 * 60 * 1000);
  if (!missingTime) {
    const ranged = rangeEnd(row, start);
    if (ranged) {
      end = ranged;
    } else {
      const later = results.find((result) => result !== chosen && result.start.isCertain('hour') && CLOCK_RE.test(result.text));
      if (later) {
        const endDate = combineEnd(start, later);
        if (endDate.getTime() > start.getTime()) end = endDate;
      }
    }
  }
  const { title, location } = splitTitleAndLocation(stripSpans(row, results));
  if (!title) return null;
  return {
    title,
    start: offsetISO(start),
    end: offsetISO(end),
    location,
    confidence: missingTime ? LOW_CONFIDENCE : TIMED_CONFIDENCE,
    rawText: row.replace(/\s+/g, ' ').trim(),
  };
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

function combineEnd(start: Date, result: chrono.ParsedResult): Date {
  const hour = result.start.get('hour');
  const minute = result.start.get('minute') ?? 0;
  if (hour == null) return new Date(start.getTime() + 60 * 60 * 1000);
  if (!result.start.isCertain('day') && !result.start.isCertain('month')) {
    const end = new Date(start);
    end.setHours(hour, minute, 0, 0);
    if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
    return end;
  }
  const dated = result.start.date();
  dated.setHours(hour, minute, 0, 0);
  return dated;
}

function stripSpans(row: string, results: chrono.ParsedResult[]): string {
  const spans = results
    .map((result) => ({ index: result.index, length: result.text.length }))
    .sort((left, right) => right.index - left.index);
  let text = row;
  for (const span of spans) {
    text = `${text.slice(0, span.index)} ${text.slice(span.index + span.length)}`;
  }
  return tidy(text.replace(TBD_RE, ' ').replace(/[|•·]+/g, ' '));
}

function splitTitleAndLocation(text: string): { title: string; location: string } {
  const cleaned = tidy(text);
  if (!cleaned) return { title: '', location: '' };
  const at = cleaned.match(AT_RE);
  if (at?.[1] && at[2] && !/^(?:a|an|the)$/i.test(at[1].trim())) {
    return { title: tidy(at[1]), location: tidy(at[2]) };
  }
  const place = cleaned.match(PLACE_RE);
  if (place?.[1] && place[2]) return { title: tidy(place[1]), location: tidy(place[2]) };
  return { title: cleaned, location: '' };
}

function hasDay(result: chrono.ParsedResult): boolean {
  return result.start.isCertain('day') || result.start.isCertain('weekday') || result.start.isCertain('month');
}

function upcoming(date: Date, certainYear: boolean, now: Date): Date {
  const next = new Date(date.getTime());
  if (certainYear) return next;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  let guard = 0;
  while (next.getTime() < startOfToday.getTime() && guard < 3) {
    next.setFullYear(next.getFullYear() + 1);
    guard += 1;
  }
  return next;
}

function isLowTime(source: string): boolean {
  return TBD_RE.test(source) || !CLOCK_RE.test(source);
}

function parseWhen(value: string, source: string, now: Date): Date | null {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const fromValue = chrono.parse(value, now, { forwardDate: true })[0];
    if (fromValue) return fromValue.start.date();
  }
  const fromSource = chrono.parse(source, now, { forwardDate: true }).find((result) => hasDay(result));
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
