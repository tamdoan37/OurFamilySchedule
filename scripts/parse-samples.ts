import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { draftsFromRecognizedText, groundModelDrafts, weeklyDates } from '../src/parser/fromText.ts';

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
  assert(!!checkup && checkup.timeTbd === true, 'TBD time should be flagged');
  assert(!!checkup && new Date(checkup.start).getHours() === 12, 'TBD time should not be midnight');
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
  assert(grounded[1].timeTbd === true, 'model TBD should be flagged');
  assert(new Date(grounded[1].start).getHours() === 12, 'model TBD should not be midnight');
  checkLayouts();
}

function checkLayouts() {
  const scan = new Date(2026, 9, 29, 12, 0, 0);
  const games = `Sat 9/12 4:00 PM vs Hawks North Park Field 3
Sat 9/19 5:30 PM vs Eagles North Park Field 3`;
  const cells = `Sat 9/12
4:00 PM
vs Hawks
North Park Field 3
Sat 9/19
5:30 PM
vs Eagles
North Park Field 3`;
  const columns = `Sat 9/12
Sat 9/19
4:00 PM
5:30 PM
vs Hawks
vs Eagles
North Park Field 3
North Park Field 3`;
  for (const [name, text] of [['row', games], ['cell', cells], ['column', columns]] as const) {
    const drafts = draftsFromRecognizedText(text, scan);
    assert(drafts.length === 2, `${name} table found ${drafts.length}`);
    const hawks = drafts.find((event) => /hawks/i.test(event.title));
    const eagles = drafts.find((event) => /eagles/i.test(event.title));
    assert(!!hawks && !/north|park|field/i.test(hawks.title), `${name} hawks title ${hawks?.title}`);
    assert(!!eagles && !/north|park|field/i.test(eagles.title), `${name} eagles title ${eagles?.title}`);
    assert(hawks?.location === 'North Park Field 3', `${name} hawks location ${hawks?.location}`);
    assert(eagles?.location === 'North Park Field 3', `${name} eagles location ${eagles?.location}`);
    const hawksStart = new Date(hawks?.start ?? '');
    const eaglesStart = new Date(eagles?.start ?? '');
    assert(hawksStart.getFullYear() === 2026 && hawksStart.getMonth() === 8 && hawksStart.getDate() === 12, `${name} hawks date`);
    assert(hawksStart.getDay() === 6 && hawksStart.getHours() === 16 && hawksStart.getMinutes() === 0, `${name} hawks weekday or time`);
    assert(eaglesStart.getFullYear() === 2026 && eaglesStart.getMonth() === 8 && eaglesStart.getDate() === 19, `${name} eagles date`);
    assert(eaglesStart.getDay() === 6 && eaglesStart.getHours() === 17 && eaglesStart.getMinutes() === 30, `${name} eagles weekday or time`);
  }

  const newsletter = draftsFromRecognizedText(`Half day dismissal at 12:30 PM on Friday, November 20.
Picture Day is Thursday, October 15.
November News
Parent meeting TBD Friday, November 6.`, scan);
  assert(newsletter.length === 3, `newsletter found ${newsletter.length}: ${newsletter.map((event) => event.title).join(', ')}`);
  const half = newsletter.find((event) => /half day/i.test(event.title));
  const picture = newsletter.find((event) => event.title === 'Picture Day');
  const parent = newsletter.find((event) => /parent meeting/i.test(event.title));
  const halfStart = new Date(half?.start ?? '');
  assert(!!half && half.title === 'Half day dismissal', `half day title ${half?.title}`);
  assert(halfStart.getFullYear() === 2026 && halfStart.getMonth() === 10 && halfStart.getDate() === 20, 'half day used the wrong date');
  assert(halfStart.getHours() === 12 && halfStart.getMinutes() === 30 && half?.timeTbd !== true, 'half day time was lost');
  assert(!newsletter.some((event) => {
    const date = new Date(event.start);
    return date.getMonth() === 9 && date.getDate() === 30;
  }), 'half day became October 30');
  const pictureStart = new Date(picture?.start ?? '');
  assert(!!picture && picture.timeTbd === true && picture.confidence < 0.5, 'picture day should be time TBD');
  assert(pictureStart.getFullYear() === 2026 && pictureStart.getMonth() === 9 && pictureStart.getDate() === 15, 'picture day year');
  assert(pictureStart.getDay() === 4 && pictureStart.getHours() === 12, 'picture day weekday or midnight');
  assert(!newsletter.some((event) => /november news/i.test(event.title)), 'month-only line became an event');
  const parentStart = new Date(parent?.start ?? '');
  assert(!!parent && parent.timeTbd === true && parent.confidence < 0.5, 'parent meeting should start as a low-confidence TBD');
  assert(parentStart.getFullYear() === 2026 && parentStart.getMonth() === 10 && parentStart.getDate() === 6, 'parent meeting date');

  const flyer = draftsFromRecognizedText(`Season runs September 8 – November 10
Practices every Tuesday 5:30–7:00 PM
Games TBD`, scan);
  assert(flyer.length === 1, `flyer found ${flyer.length}: ${flyer.map((event) => event.title).join(', ')}`);
  const practice = flyer[0];
  const practiceStart = new Date(practice.start);
  const practiceEnd = new Date(practice.end);
  assert(/practice/i.test(practice.title) && !/every|tuesday/i.test(practice.title), `practice title ${practice.title}`);
  assert(practice.repeat === 'weekly', 'practice should be a weekly series');
  assert(practiceStart.getFullYear() === 2026 && practiceStart.getMonth() === 10 && practiceStart.getDate() === 3, 'practice should start next Tuesday');
  assert(practiceStart.getDay() === 2 && practiceStart.getHours() === 17 && practiceStart.getMinutes() === 30, 'practice clock');
  assert(practiceEnd.getHours() === 19 && practiceEnd.getMinutes() === 0, 'practice end');
  const until = new Date(practice.seriesUntil ?? '');
  const expectedUntil = new Date(practiceStart);
  expectedUntil.setDate(expectedUntil.getDate() + 56);
  assert(until.getFullYear() === expectedUntil.getFullYear() && until.getMonth() === expectedUntil.getMonth() && until.getDate() === expectedUntil.getDate(), 'series should default to 8 weeks');
  assert(weeklyDates(practiceStart, until).length === 9, 'eight weeks inclusive should be 9 Tuesdays');
  assert(!flyer.some((event) => /season|games/i.test(event.title)), 'season range or games TBD became an event');
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
