import { Text, StyleSheet } from 'react-native';
import { useScheduleStore } from '../store/scheduleStore';
import { useTheme } from '../theme';

export default function SyncStatus() {
  const paired = useScheduleStore((state) => state.paired);
  const syncStatus = useScheduleStore((state) => state.syncStatus);
  const syncWaiting = useScheduleStore((state) => state.syncWaiting);
  const syncError = useScheduleStore((state) => state.syncError);
  const theme = useTheme();
  if (!paired) return null;
  const label = syncStatus === 'offline'
    ? (syncError ? `${syncError} – ${syncWaiting} waiting` : `Offline – ${syncWaiting} changes waiting`)
    : syncStatus === 'syncing'
      ? 'Syncing…'
      : 'Synced';
  return <Text style={[styles.label, { color: theme.muted }]} numberOfLines={1}>{label}</Text>;
}

const styles = StyleSheet.create({
  label: { fontSize: 11, color: '#666', maxWidth: 170 },
});
