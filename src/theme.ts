import { useColorScheme } from 'react-native';

export type Theme = {
  dark: boolean;
  bg: string;
  text: string;
  muted: string;
  card: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
  now: string;
  amber: string;
  amberBg: string;
  sheet: string;
  input: string;
  meta: string;
  line: string;
  synced: string;
};

const light: Theme = {
  dark: false,
  bg: '#F2ECE3',
  text: '#17202A',
  muted: '#5B6673',
  card: '#FFFFFF',
  border: '#DCD3C5',
  primary: '#17202A',
  onPrimary: '#FFFFFF',
  danger: '#B3392B',
  now: '#C5221F',
  amber: '#B07A00',
  amberBg: '#FFF8E6',
  sheet: '#FFFFFF',
  input: '#17202A',
  meta: '#3F4A55',
  line: '#E3DACD',
  synced: '#0B5E5B',
};

const dark: Theme = {
  dark: true,
  bg: '#1C1712',
  text: '#F6F1E8',
  muted: '#B7A898',
  card: '#2A241C',
  border: '#4A4036',
  primary: '#F6F1E8',
  onPrimary: '#1C1712',
  danger: '#F0A8A0',
  now: '#FF8A80',
  amber: '#E3B15A',
  amberBg: '#3A2C16',
  sheet: '#2A241C',
  input: '#F6F1E8',
  meta: '#D5CBBF',
  line: '#4A4036',
  synced: '#8FDED8',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const momColor = '#C2412F';
export const momTint = '#FCEBE8';
export const dadColor = '#0F7C78';
export const dadTint = '#E3F4F3';
export const ridePill = '#FFE3A3';
export const rideText = '#7A5200';

const MOM_COLORS = new Set(['#c2412f', '#ff6b6b', '#b3392b']);
const DAD_COLORS = new Set(['#0f7c78', '#4ecdc4', '#0b5e5b']);

export function caregiverLook(person: { name: string; color: string }): { color: string; tint: string } {
  const name = person.name.trim().toLowerCase();
  const color = person.color.trim().toLowerCase();
  if (name === 'mom' || MOM_COLORS.has(color)) return { color: momColor, tint: momTint };
  if (name === 'dad' || DAD_COLORS.has(color)) return { color: dadColor, tint: dadTint };
  return { color: person.color, tint: tintColor(person.color, '#FFFFFF', 0.16) };
}

export function tintColor(hex: string, toward: string, amount: number): string {
  const color = parseHex(hex);
  const base = parseHex(toward);
  if (!color || !base) return hex;
  const mixed = color.map((channel, index) => Math.round(channel * amount + base[index] * (1 - amount)));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace('#', '');
  if (hex.length === 3) {
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (hex.length !== 6) return null;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}
