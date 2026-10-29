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
  nowLine: string;
  amber: string;
  amberBg: string;
  sheet: string;
  input: string;
  meta: string;
  line: string;
  synced: string;
  cardWarm: string;
  divider: string;
  softFill: string;
  darkCard: string;
  darkCardInner: string;
  darkCardMeta: string;
  rideBorder: string;
  ridePill: string;
  rideText: string;
  cancelledBg: string;
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
  nowLine: '#D93025',
  amber: '#B07A00',
  amberBg: '#FFF8E6',
  sheet: '#FFFFFF',
  input: '#17202A',
  meta: '#3F4A55',
  line: '#E3DACD',
  synced: '#0B5E5B',
  cardWarm: '#FFFDF9',
  divider: '#F0E9DE',
  softFill: '#FAF6EF',
  darkCard: '#17202A',
  darkCardInner: '#2E3A47',
  darkCardMeta: '#C9D1D9',
  rideBorder: '#B07A00',
  ridePill: '#FFE3A3',
  rideText: '#7A5200',
  cancelledBg: '#E9ECEF',
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
  nowLine: '#FF8A80',
  amber: '#E3B15A',
  amberBg: '#3A2C16',
  sheet: '#2A241C',
  input: '#F6F1E8',
  meta: '#D5CBBF',
  line: '#4A4036',
  synced: '#8FDED8',
  cardWarm: '#241E18',
  divider: '#3A322A',
  softFill: '#322A22',
  darkCard: '#101418',
  darkCardInner: '#2E3A47',
  darkCardMeta: '#C9D1D9',
  rideBorder: '#E3B15A',
  ridePill: '#5A4318',
  rideText: '#E3B15A',
  cancelledBg: '#2C3136',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export type Look = { solid: string; tint: string; text: string };

export const momLook: Look = { solid: '#C2412F', tint: '#FCEBE8', text: '#B3392B' };
export const dadLook: Look = { solid: '#0F7C78', tint: '#E3F4F3', text: '#0B5E5B' };

export const momColor = momLook.solid;
export const momTint = momLook.tint;
export const dadColor = dadLook.solid;
export const dadTint = dadLook.tint;
export const ridePill = light.ridePill;
export const rideText = light.rideText;

export const KID_PALETTES: (Look & { name: string })[] = [
  { name: 'Blue', solid: '#1D4FB8', tint: '#E6EDFB', text: '#1D4FB8' },
  { name: 'Pink', solid: '#B0215E', tint: '#FBE7EF', text: '#B0215E' },
  { name: 'Green', solid: '#17773A', tint: '#E3F3E8', text: '#17773A' },
  { name: 'Purple', solid: '#5A3FB0', tint: '#EFEAFB', text: '#5A3FB0' },
  { name: 'Amber', solid: '#8A5A12', tint: '#FBF0DD', text: '#8A5A12' },
];

export function laneLook(index: number, color = '#5B6673'): Look {
  if (index === 0) return momLook;
  if (index === 1) return dadLook;
  return { solid: color, tint: '#FFFFFF', text: color };
}

export function kidLook(child: { palette?: string; color?: string }): Look & { name: string } {
  const named = KID_PALETTES.find((entry) => entry.name === child.palette);
  if (named) return named;
  return closestKidPalette(child.color ?? '');
}

export function closestKidPalette(hex: string): Look & { name: string } {
  const color = parseHex(hex);
  if (!color) return KID_PALETTES[0];
  let best = KID_PALETTES[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of KID_PALETTES) {
    const solid = parseHex(entry.solid);
    if (!solid) continue;
    const distance = (color[0] - solid[0]) ** 2 + (color[1] - solid[1]) ** 2 + (color[2] - solid[2]) ** 2;
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

export function caregiverLook(person: { name: string; color: string }, index = -1): Look {
  if (index === 0 || index === 1) return laneLook(index, person.color);
  const name = person.name.trim().toLowerCase();
  if (name === 'mom') return momLook;
  if (name === 'dad') return dadLook;
  return { solid: person.color, tint: tintColor(person.color, '#FFFFFF', 0.16), text: person.color };
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
