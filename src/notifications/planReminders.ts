const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_REMINDERS = 60;
const BACKUP_LEAD_MINUTES = 120;

export type ReminderEvent = {
  id: string;
  title: string;
  startTime: string;
  caregiverId: string;
  backupCaregiverId: string;
  deleted?: boolean;
  timeTbd?: boolean;
  cancelled?: boolean;
};

export type ReminderPlan = {
  eventId: string;
  title: string;
  fireAt: number;
  leadMinutes: number;
  quiet: boolean;
};

export function clampLead(value: number): number {
  if (!Number.isInteger(value)) return 15;
  return Math.min(10080, Math.max(1, value));
}

export function formatLead(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

export function planReminders(input: {
  now: number;
  deviceCaregiverId: string;
  leads: [number, number];
  events: ReminderEvent[];
}): ReminderPlan[] {
  const me = input.deviceCaregiverId;
  if (!me) return [];
  const horizon = input.now + HORIZON_MS;
  const leads = [...new Set(input.leads.map(clampLead))];
  const planned: ReminderPlan[] = [];
  for (const event of input.events) {
    if (event.deleted || event.timeTbd || event.cancelled) continue;
    const start = Date.parse(event.startTime);
    if (!Number.isFinite(start) || start <= input.now || start > horizon) continue;
    const onDuty = event.caregiverId === me;
    const backup = !onDuty && event.backupCaregiverId === me;
    if (!onDuty && !backup) continue;
    const slots = onDuty ? leads.map((leadMinutes) => ({ leadMinutes, quiet: false })) : [{ leadMinutes: BACKUP_LEAD_MINUTES, quiet: true }];
    for (const slot of slots) {
      const fireAt = start - slot.leadMinutes * 60 * 1000;
      if (fireAt <= input.now) continue;
      planned.push({
        eventId: event.id,
        title: event.title.trim() || 'Event',
        fireAt,
        leadMinutes: slot.leadMinutes,
        quiet: slot.quiet,
      });
    }
  }
  planned.sort((a, b) => a.fireAt - b.fireAt || a.eventId.localeCompare(b.eventId));
  return planned.slice(0, MAX_REMINDERS);
}
