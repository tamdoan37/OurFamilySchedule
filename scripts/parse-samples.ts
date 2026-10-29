import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { draftsFromRecognizedText, groundModelDrafts } from '../src/parser/fromText.ts';

const now = new Date(2026, 9, 28, 12, 0, 0);
const root = path.join(import.meta.dirname, '..', 'parser-tests', 'photos');
const imageExt = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp', '.tif', '.tiff']);

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function checkRules() {
  const table = draftsFromRecognizedText(`March 14
4:00 PM Soccer vs Hawks Field 2
5:30-6:15 PM Piano lesson Studio
March 15
TBD Checkup Clinic
Practice notes`, now);
  assert(table.length === 3, `table found ${table.length}`);
  const soccer = table.find((event) => /hawks/i.test(event.title));
  const piano = table.find((event) => /piano/i.test(event.title));
  const checkup = table.find((event) => /checkup/i.test(event.title));
  assert(!!soccer && soccer.location.toLowerCase().includes('field'), 'soccer row lost its field');
  assert(!!soccer && new Date(soccer.start).getFullYear() === 2027, 'missing year did not roll forward');
  assert(!!soccer && new Date(soccer.start).getHours() === 16, 'soccer time was lost');
  assert(!!soccer && soccer.confidence < 0.7 && soccer.confidence >= 0.5, 'timed fallback should be low but readable');
  assert(!!piano && new Date(piano.end).getHours() === 18 && new Date(piano.end).getMinutes() === 15, 'range end was lost');
  assert(!!piano && piano.location.toLowerCase().includes('studio'), 'piano location was lost');
  assert(!!checkup && checkup.confidence < 0.5, 'TBD time should be low confidence');
  assert(!table.some((event) => /practice notes/i.test(event.title)), 'invented an event from a note');
  assert(table.every((event) => new Date(event.start).getMonth() === 2), 'rows were split apart');

  const past = draftsFromRecognizedText('March 14, 2020 4:00 PM Reunion Gym', now);
  assert(past.length === 1 && new Date(past[0].start).getFullYear() === 2020, 'explicit year was rewritten');

  const empty = draftsFromRecognizedText('Bring snacks for the team', now);
  assert(empty.length === 0, 'invented an event with no date');

  const grounded = groundModelDrafts(
    'March 14 4:00 PM Soccer vs Hawks Field 2',
    [
      { title: 'Soccer vs Hawks', start: '2026-03-14T16:00:00', end: '2026-03-14T17:00:00', location: 'Field 2', confidence: 0.95, rawText: 'March 14 4:00 PM Soccer vs Hawks Field 2' },
      { title: 'Invented parade', start: '2026-03-14T18:00:00', end: '2026-03-14T19:00:00', location: 'Town', confidence: 0.99, rawText: 'parade downtown' },
      { title: 'Soccer vs Hawks', start: '2026-03-15T00:00:00', end: '2026-03-15T01:00:00', location: '', confidence: 0.9, rawText: 'March 15 TBD Soccer vs Hawks' },
    ],
    now,
  );
  assert(grounded.length === 2, `grounding kept ${grounded.length}`);
  assert(!grounded.some((event) => /parade/i.test(event.title)), 'kept an invented title');
  assert(grounded[0].confidence >= 0.7, 'a real time should keep model confidence');
  assert(new Date(grounded[0].start).getFullYear() === 2027, 'model year was left in the past');
  assert(grounded[1].confidence < 0.5, 'model TBD time stayed high confidence');
}

async function readRecognized(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function main() {
  checkRules();
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch {
    names = [];
  }
  const images = names.filter((name) => imageExt.has(path.extname(name).toLowerCase()));
  const usedText = new Set<string>();
  for (const name of images) {
    const textName = `${path.basename(name, path.extname(name))}.txt`;
    usedText.add(textName);
    const text = await readRecognized(path.join(root, textName));
    if (text == null) {
      console.log(`${name}: no recognized text next to the photo`);
      continue;
    }
    const count = draftsFromRecognizedText(text, now).length;
    console.log(`${name}: ${count} events`);
  }
  for (const name of names.filter((item) => item.endsWith('.txt') && !usedText.has(item))) {
    const text = await readFile(path.join(root, name), 'utf8');
    const count = draftsFromRecognizedText(text, now).length;
    console.log(`${name}: ${count} events`);
  }
  console.log('parser rules passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
