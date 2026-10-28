import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Button, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Caregiver, Child } from '../types';

const ICONS = ['⚽', '🎹', '🩺', '🏫', '⭐'];

export type EventDraftFields = {
  title: string;
  start: Date;
  end: Date;
  location: string;
  childIds: string[];
  caregiverId: string;
  icon: string;
};

export function EventFields({
  value,
  onChange,
  caregivers,
  children,
}: {
  value: EventDraftFields;
  onChange: (next: EventDraftFields) => void;
  caregivers: Caregiver[];
  children: Child[];
}) {
  const [picker, setPicker] = useState<'date' | 'start' | 'end' | null>(null);

  return (
    <View style={styles.fields}>
      <TextInput
        value={value.title}
        onChangeText={(title) => onChange({ ...value, title })}
        placeholder="Title"
        style={styles.input}
      />
      <DateField
        label="Date"
        value={value.start}
        mode="date"
        open={picker === 'date'}
        onOpen={() => setPicker('date')}
        onClose={() => setPicker(null)}
        onChange={(picked) => onChange({ ...value, start: applyDate(value.start, picked), end: applyDate(value.end, picked) })}
      />
      <DateField
        label="Start"
        value={value.start}
        mode="time"
        open={picker === 'start'}
        onOpen={() => setPicker('start')}
        onClose={() => setPicker(null)}
        onChange={(picked) => onChange({ ...value, start: applyTime(value.start, picked) })}
      />
      <DateField
        label="End"
        value={value.end}
        mode="time"
        open={picker === 'end'}
        onOpen={() => setPicker('end')}
        onClose={() => setPicker(null)}
        onChange={(picked) => onChange({ ...value, end: applyTime(value.end, picked) })}
      />
      <TextInput
        value={value.location}
        onChangeText={(location) => onChange({ ...value, location })}
        placeholder="Location"
        style={styles.input}
      />
      <Text style={styles.label}>Children</Text>
      <ChoiceRow
        options={children.map((child) => ({ id: child.id, label: child.name, color: child.color }))}
        selected={value.childIds}
        onToggle={(id) => onChange({ ...value, childIds: toggleId(value.childIds, id) })}
      />
      <Text style={styles.label}>Caregiver on duty</Text>
      <ChoiceRow
        options={[{ id: '', label: 'Unassigned', color: '#666' }, ...caregivers.map((person) => ({ id: person.id, label: person.name, color: person.color }))]}
        selected={[value.caregiverId]}
        onToggle={(id) => onChange({ ...value, caregiverId: id })}
      />
      <Text style={styles.label}>Icon</Text>
      <IconField value={value.icon} onChange={(icon) => onChange({ ...value, icon })} />
    </View>
  );
}

export function ChoiceRow({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string; color: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) return <Text style={styles.note}>None yet. Add them from Family.</Text>;
  return (
    <View style={styles.choiceLine}>
      {options.map((option) => {
        const on = selected.includes(option.id);
        return (
          <Pressable key={option.id || 'none'} onPress={() => onToggle(option.id)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={{ color: option.color, fontWeight: '600' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconField({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <View>
      <View style={styles.choiceLine}>
        {ICONS.map((icon) => (
          <Pressable key={icon} onPress={() => onChange(icon)} style={[styles.chip, value === icon && styles.chipOn]}>
            <Text>{icon}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={value} onChangeText={onChange} placeholder="Icon" style={styles.input} />
    </View>
  );
}

function DateField({
  label,
  value,
  mode,
  open,
  onOpen,
  onClose,
  onChange,
}: {
  label: string;
  value: Date;
  mode: 'date' | 'time';
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (picked: Date) => void;
}) {
  const invalid = Number.isNaN(value.getTime());
  const shown = invalid ? new Date() : value;
  const text = invalid
    ? 'Not a date'
    : mode === 'date'
      ? shown.toLocaleDateString()
      : shown.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onOpen} style={styles.pickerButton}>
        <Text>{text}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={shown}
          mode={mode}
          onChange={(event, picked) => {
            if (Platform.OS === 'android') onClose();
            if (event.type === 'dismissed' || !picked) return;
            onChange(picked);
          }}
        />
      )}
      {open && Platform.OS === 'ios' && <Button title="Done" onPress={onClose} />}
    </View>
  );
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function applyDate(current: Date, picked: Date): Date {
  const next = new Date(Number.isNaN(current.getTime()) ? picked : current);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next;
}

function applyTime(current: Date, picked: Date): Date {
  const next = new Date(Number.isNaN(current.getTime()) ? picked : current);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

const styles = StyleSheet.create({
  fields: { gap: 8 },
  note: { fontSize: 14, color: '#666' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  input: { borderBottomWidth: 1, borderColor: '#ccc', fontSize: 16, minHeight: 44 },
  pickerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#f8f9fa' },
  choiceLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: '#fff' },
  chipOn: { borderWidth: 2, borderColor: '#111' },
});
