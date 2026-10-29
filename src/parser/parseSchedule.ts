import { parsePhotoOnDevice } from 'schedule-parser';
import { DraftEvent } from '../types';
import { draftsFromRecognizedText, groundModelDrafts, offsetISO, parseModelEvents } from './fromText';

function modelPrompt(now: Date): string {
  const today = offsetISO(now).slice(0, 10);
  return [
    'Extract schedule events from the flyer text.',
    'Schedules are often tables. Keep each row together: date, time, opponent or title, and field or location.',
    `Today is ${today}. If the year is missing, choose the next upcoming date after today.`,
    'If the time is TBD or missing, still include the event and set confidence below 0.5.',
    'Never invent an event that is not in the text.',
    'Return JSON only: an array of { title, start, end, location, confidence, rawText }.',
    'start and end are ISO 8601. If the row has a start but no end, end is one hour later.',
  ].join('\n');
}

// Reads the photo on this phone. Vision or ML Kit gets the text, then
// Foundation Models or Gemini Nano structures it when that model is on the
// device. Otherwise the text is parsed here. Nothing is uploaded.
export async function parseScheduleFromPhoto(photoPath: string): Promise<DraftEvent[]> {
  if (!photoPath) return [];
  const now = new Date();
  let parsed: { text: string; model: string; eventsJson: string } | null = null;
  try {
    parsed = await parsePhotoOnDevice(photoPath, modelPrompt(now));
  } catch {
    return [];
  }
  const text = parsed?.text?.trim() ?? '';
  if (!text) return [];
  if (parsed && parsed.model !== 'none') {
    const grounded = groundModelDrafts(text, parseModelEvents(parsed.eventsJson), now);
    if (grounded.length > 0) return grounded;
  }
  return draftsFromRecognizedText(text, now);
}
