import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { Caregiver, ChecklistItem, Child, WHOLE_FAMILY_ID } from '../types';
import { PillButton } from './PillButton';
import { useTheme } from '../theme';

const ICONS = ['⚽', '🎹', '🩺', '🏫', '⭐'];

export type EventDraftFields = {
  title: string;
  start: Date;
  end: Date;
  location: string;
  childIds: string[];
  caregiverId: string;
  icon: string;
  timeTbd?: boolean;
  notes: string;
  checklist: ChecklistItem[];
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
  const [itemText, setItemText] = useState('');
  const theme = useTheme();
  const notes = value.notes ?? '';
  const checklist = value.checklist ?? [];

  function addItem() {
    const text = itemText.trim();
    if (!text) return;
    onChange({ ...value, notes, checklist: [...checklist, { id: Crypto.randomUUID(), text, done: false }] });
    setItemText('');
  }

  return (
    <View style={styles.fields}>
      <TextInput
        value={value.title}
        onChangeText={(title) => onChange({ ...value, title })}
        placeholder="Title"
        placeholderTextColor={theme.muted}
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
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
        blankLabel={value.timeTbd ? 'Time TBD' : undefined}
        open={picker === 'start'}
        onOpen={() => setPicker('start')}
        onClose={() => setPicker(null)}
        onChange={(picked) => {
          const nextStart = applyTime(value.start, picked);
          if (value.timeTbd) {
            onChange({ ...value, start: nextStart, end: new Date(nextStart.getTime() + 60 * 60 * 1000), timeTbd: false });
            return;
          }
          const previous = Number.isNaN(value.start.getTime()) ? nextStart.getTime() : value.start.getTime();
          const delta = nextStart.getTime() - previous;
          const nextEnd = Number.isNaN(value.end.getTime())
            ? new Date(nextStart.getTime() + 60 * 60 * 1000)
            : new Date(value.end.getTime() + delta);
          onChange({ ...value, start: nextStart, end: nextEnd, timeTbd: false });
        }}
      />
      <DateField
        label="End"
        value={value.end}
        mode="time"
        blankLabel={value.timeTbd ? 'Time TBD' : undefined}
        open={picker === 'end'}
        onOpen={() => setPicker('end')}
        onClose={() => setPicker(null)}
        onChange={(picked) => {
          const nextEnd = applyTime(value.end, picked);
          if (value.timeTbd) {
            onChange({
              ...value,
              start: new Date(nextEnd.getTime() - 60 * 60 * 1000),
              end: nextEnd,
              timeTbd: false,
            });
            return;
          }
          onChange({ ...value, end: nextEnd, timeTbd: false });
        }}
      />
      <TextInput
        value={value.location}
        onChangeText={(location) => onChange({ ...value, location })}
        placeholder="Location"
        placeholderTextColor={theme.muted}
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
      />
      <TextInput
        value={notes}
        onChangeText={(next) => onChange({ ...value, notes: next, checklist })}
        placeholder="Snack duty, bring shin guards…"
        placeholderTextColor={theme.muted}
        multiline
        style={[styles.input, styles.notes, { color: theme.text, borderColor: theme.border }]}
      />
      <Text style={[styles.label, { color: theme.text }]}>Checklist</Text>
      {checklist.map((item) => (
        <View key={item.id} style={styles.checkRow}>
          <Pressable
            style={styles.checkMain}
            onPress={() => onChange({
              ...value,
              notes,
              checklist: checklist.map((entry) => (entry.id === item.id ? { ...entry, done: !entry.done } : entry)),
            })}
          >
            <Text style={{ color: theme.text }}>{item.done ? '☑' : '☐'}</Text>
            <Text style={[styles.checkText, { color: theme.text }, item.done && styles.checkDone]}>{item.text}</Text>
          </Pressable>
          <Pressable onPress={() => onChange({ ...value, notes, checklist: checklist.filter((entry) => entry.id !== item.id) })}>
            <Text style={{ color: theme.danger, fontWeight: '600' }}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.checkRow}>
        <TextInput
          value={itemText}
          onChangeText={setItemText}
          placeholder="Add an item"
          placeholderTextColor={theme.muted}
          style={[styles.input, styles.checkInput, { color: theme.text, borderColor: theme.border }]}
          onSubmitEditing={addItem}
        />
        <PillButton title="Add" variant="secondary" compact onPress={addItem} />
      </View>
      <Text style={[styles.label, { color: theme.text }]}>Children</Text>
      <ChoiceRow
        options={children.map((child) => ({ id: child.id, label: child.name, color: child.color }))}
        selected={value.childIds}
        onToggle={(id) => onChange({ ...value, childIds: toggleId(value.childIds, id) })}
      />
      <Text style={[styles.label, { color: theme.text }]}>Caregiver on duty</Text>
      <ChoiceRow
        options={[{ id: '', label: 'Needs a ride', color: '#B07A00' }, { id: WHOLE_FAMILY_ID, label: 'Whole family', color: '#17202A' }, ...caregivers.map((person) => ({ id: person.id, label: person.name, color: person.color }))]}
        selected={[value.caregiverId]}
        onToggle={(id) => onChange({ ...value, caregiverId: id })}
      />
      <Text style={[styles.label, { color: theme.text }]}>Icon</Text>
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
          <TextInput value={value} onChangeText={onChange} placeholder="Icon" placeholderTextColor="#888" style={styles.input} />
    </View>
  );
}

function DateField({
  label,
  value,
  mode,
  open,
  blankLabel,
  onOpen,
  onClose,
  onChange,
}: {
  label: string;
  value: Date;
  mode: 'date' | 'time';
  open: boolean;
  blankLabel?: string;
  onOpen: () => void;
  onClose: () => void;
  onChange: (picked: Date) => void;
}) {
  const invalid = Number.isNaN(value.getTime());
  const shown = invalid ? new Date() : value;
  const theme = useTheme();
  const text = blankLabel
    ? blankLabel
    : invalid
      ? 'Not a date'
      : mode === 'date'
        ? shown.toLocaleDateString()
        : shown.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <View>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <Pressable onPress={onOpen} style={[styles.pickerButton, { backgroundColor: theme.card }]}>
        <Text style={{ color: blankLabel ? theme.muted : theme.text }}>{text}</Text>
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
      {open && Platform.OS === 'ios' && <PillButton title="Done" variant="secondary" compact onPress={onClose} />}
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
  notes: { minHeight: 72, textAlignVertical: 'top', paddingTop: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  checkText: { flex: 1, fontSize: 15 },
  checkDone: { textDecorationLine: 'line-through', opacity: 0.6 },
  checkInput: { flex: 1 },
  pickerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#f8f9fa' },
  choiceLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: '#fff' },
  chipOn: { borderWidth: 2, borderColor: '#111' },
});
