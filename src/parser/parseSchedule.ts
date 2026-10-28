import { DraftEvent } from '../types';

function offsetISO(date: Date): string {
  const pad = (value: number) => String(Math.abs(value)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function atLocalTime(dayOffset: number, hour: number, minute: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function demoDrafts(): DraftEvent[] {
  const soccerStart = atLocalTime(1, 16, 0);
  const soccerEnd = atLocalTime(1, 17, 30);
  const pianoStart = atLocalTime(1, 15, 0);
  const pianoEnd = atLocalTime(1, 15, 45);
  const checkupStart = atLocalTime(2, 9, 0);
  const checkupEnd = atLocalTime(2, 9, 30);
  return [
    {
      title: 'Soccer practice',
      start: offsetISO(soccerStart),
      end: offsetISO(soccerEnd),
      location: 'Field',
      confidence: 0.92,
      rawText: 'Soccer practice 4:00-5:30',
    },
    {
      title: 'Piano lesson',
      start: offsetISO(pianoStart),
      end: offsetISO(pianoEnd),
      location: 'Studio',
      confidence: 0.86,
      rawText: 'Piano lesson 3:00-3:45',
    },
    {
      title: 'Checkup',
      start: offsetISO(checkupStart),
      end: offsetISO(checkupEnd),
      location: 'Clinic',
      confidence: 0.42,
      rawText: 'chkup 9?',
    },
  ];
}

// One function for the whole scan. Step 8 replaces the demo return below
// with the real on-device parsers. Those parsers should read photoPath on
// this phone and return the same DraftEvent list. Do not send the photo,
// the text, or the drafts off the phone.
export async function parseScheduleFromPhoto(photoPath: string): Promise<DraftEvent[]> {
  void photoPath;
  return demoDrafts();
}
