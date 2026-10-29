import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Button, Alert, ScrollView, Pressable, AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useScheduleStore } from '../src/store/scheduleStore';
import { loadSyncEngine, syncSupported } from '../src/sync/loadSync';
import { refreshReminders } from '../src/notifications/reminders';
import { useTheme } from '../src/theme';
import { useTypeface } from '../src/fonts';

export default function SettingsScreen() {
  const styles = useSettingsStyles();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.note}>Pairing lives on the Pair tab. Reminders stay here.</Text>
      <ReminderChoices />
      <Text style={styles.title}>Demo</Text>
      <Text style={styles.note}>Removes the sample events loaded from the home screen. Events you added stay.</Text>
      <Button title="Remove demo events" onPress={removeDemoEvents} />
    </ScrollView>
  );
}

function removeDemoEvents() {
  const ids = [...useScheduleStore.getState().demoEventIds];
  if (ids.length === 0) {
    Alert.alert('No demo events to remove.');
    return;
  }
  const deleteEvent = useScheduleStore.getState().deleteEvent;
  for (const id of ids) deleteEvent(id);
}

function ReminderChoices() {
  const styles = useSettingsStyles();
  const leads = useScheduleStore((state) => state.reminderLeads);
  const setReminderLeads = useScheduleStore((state) => state.setReminderLeads);
  return (
    <>
      <Text style={styles.title}>Reminders</Text>
      <Text style={styles.note}>On duty, this phone is reminded before the event. The backup gets one quiet reminder, 2 hours before.</Text>
      <LeadRow
        label="First reminder"
        selected={leads[0]}
        onPick={(minutes) => setReminderLeads(minutes, leads[1])}
      />
      <LeadRow
        label="Second reminder"
        selected={leads[1]}
        onPick={(minutes) => setReminderLeads(leads[0], minutes)}
      />
      <ReminderPermission />
    </>
  );
}

function ReminderPermission() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const grantedRef = useRef<boolean | null>(null);

  async function refresh() {
    const current = await Notifications.getPermissionsAsync();
    const ok = current.granted === true;
    if (ok && grantedRef.current === false) {
      void refreshReminders();
      if (syncSupported()) loadSyncEngine()?.syncNow();
    }
    grantedRef.current = ok;
    setGranted(ok);
  }

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, []);

  if (granted !== false) return null;

  async function turnOn() {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      grantedRef.current = true;
      setGranted(true);
      void refreshReminders();
      if (syncSupported()) loadSyncEngine()?.syncNow();
      return;
    }
    if (current.canAskAgain) {
      const next = await Notifications.requestPermissionsAsync();
      const ok = next.granted === true;
      grantedRef.current = ok;
      setGranted(ok);
      if (ok) {
        void refreshReminders();
        if (syncSupported()) loadSyncEngine()?.syncNow();
      }
      return;
    }
    await Linking.openSettings();
  }

  return <Button title="Turn on reminders" onPress={() => void turnOn()} />;
}

function LeadRow({ label, selected, onPick }: { label: string; selected: number; onPick: (minutes: number) => void }) {
  const styles = useSettingsStyles();
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {LEAD_OPTIONS.map((option) => (
          <Pressable
            key={option.minutes}
            onPress={() => onPick(option.minutes)}
            style={[styles.choice, selected === option.minutes && styles.choiceOn]}
          >
            <Text style={selected === option.minutes ? styles.choiceOnText : styles.choiceText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const LEAD_OPTIONS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 1440, label: '1 day' },
];

function useSettingsStyles() {
  const theme = useTheme();
  const type = useTypeface();
  return useMemo(() => StyleSheet.create({
    container: { padding: 20, gap: 12, backgroundColor: theme.bg },
    title: { fontSize: 22, color: theme.text, fontFamily: type.extra, marginTop: 8 },
    label: { fontSize: 14, marginTop: 4, color: theme.text, fontFamily: type.bold },
    note: { fontSize: 14, color: theme.muted, fontFamily: type.medium },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: { borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card },
    choiceOn: { borderColor: theme.primary, backgroundColor: theme.primary },
    choiceText: { fontSize: 14, color: theme.text, fontFamily: type.semibold },
    choiceOnText: { fontSize: 14, color: theme.onPrimary, fontFamily: type.semibold },
  }), [theme, type]);
}
