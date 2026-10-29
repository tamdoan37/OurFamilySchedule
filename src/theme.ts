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
};

const light: Theme = {
  dark: false,
  bg: '#ffffff',
  text: '#111111',
  muted: '#6b7280',
  card: '#f8f9fa',
  border: '#e5e7eb',
  primary: '#111111',
  onPrimary: '#ffffff',
  danger: '#9b1c1c',
  now: '#e11d48',
  amber: '#b45309',
  amberBg: '#fff7ed',
  sheet: '#ffffff',
  input: '#111111',
};

const dark: Theme = {
  dark: true,
  bg: '#111111',
  text: '#f5f5f5',
  muted: '#a1a1aa',
  card: '#1c1c1e',
  border: '#3f3f46',
  primary: '#f5f5f5',
  onPrimary: '#111111',
  danger: '#fca5a5',
  now: '#fb7185',
  amber: '#fbbf24',
  amberBg: '#3f2a12',
  sheet: '#1c1c1e',
  input: '#f5f5f5',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
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
