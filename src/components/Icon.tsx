import { Circle, Path, Rect, Svg } from 'react-native-svg';

export type IconName =
  | 'car'
  | 'ball'
  | 'basketball'
  | 'volleyball'
  | 'music'
  | 'school'
  | 'run'
  | 'robot'
  | 'book'
  | 'health'
  | 'calendar'
  | 'camera'
  | 'note'
  | 'qr'
  | 'gear'
  | 'plus'
  | 'close'
  | 'back'
  | 'clock'
  | 'pin'
  | 'overlap'
  | 'swap'
  | 'cancel'
  | 'later';

const DEFAULT_WIDTH: Partial<Record<IconName, number>> = {
  plus: 2.2,
  close: 2,
  back: 2,
};

export function Icon({
  name,
  size = 24,
  color,
  strokeWidth,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const width = strokeWidth ?? DEFAULT_WIDTH[name] ?? 1.8;
  const pen = {
    stroke: color,
    strokeWidth: width,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'car' && (
        <>
          <Path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" {...pen} />
          <Rect x={3} y={11} width={18} height={6} rx={2} {...pen} />
          <Circle cx={7.5} cy={17.5} r={1.5} {...pen} />
          <Circle cx={16.5} cy={17.5} r={1.5} {...pen} />
        </>
      )}
      {name === 'ball' && (
        <>
          <Circle cx={12} cy={12} r={9} {...pen} />
          <Path d="M12 7.5l4 2.9-1.5 4.6h-5L8 10.4z" {...pen} />
        </>
      )}
      {name === 'basketball' && (
        <>
          <Circle cx={12} cy={12} r={9} {...pen} />
          <Path d="M3 12h18M12 3v18M5.6 5.6c3 2.5 3 10.3 0 12.8M18.4 5.6c-3 2.5-3 10.3 0 12.8" {...pen} />
        </>
      )}
      {name === 'volleyball' && (
        <>
          <Circle cx={12} cy={12} r={9} {...pen} />
          <Path d="M12 3c3 3 3 15 0 18M3.5 9c5 1 12 1 17 0M4 16c5-1.5 11-1.5 16 0" {...pen} />
        </>
      )}
      {name === 'music' && (
        <>
          <Path d="M9 18V5l11-2v13" {...pen} />
          <Circle cx={6} cy={18} r={3} {...pen} />
          <Circle cx={17} cy={16} r={3} {...pen} />
        </>
      )}
      {name === 'school' && (
        <>
          <Path d="M3 10l9-5 9 5-9 5z" {...pen} />
          <Path d="M7 12v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4" {...pen} />
        </>
      )}
      {name === 'run' && (
        <>
          <Circle cx={13} cy={4.5} r={2} {...pen} />
          <Path d="M7 21l3-6 3 2v5M10 15l1-5 4 3h3M11 10l-3 1-2 3" {...pen} />
        </>
      )}
      {name === 'robot' && (
        <>
          <Rect x={5} y={8} width={14} height={11} rx={3} {...pen} />
          <Path d="M12 4v4M9 13h.01M15 13h.01M3 13h2M19 13h2" {...pen} />
        </>
      )}
      {name === 'book' && (
        <>
          <Path d="M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z" {...pen} />
          <Path d="M8 9h6M8 13h6" {...pen} />
        </>
      )}
      {name === 'health' && (
        <>
          <Circle cx={12} cy={12} r={9} {...pen} />
          <Path d="M12 8v8M8 12h8" {...pen} />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Rect x={4} y={5} width={16} height={15} rx={2} {...pen} />
          <Path d="M4 10h16M9 3v4M15 3v4" {...pen} />
        </>
      )}
      {name === 'camera' && (
        <>
          <Path d="M4 8h3l2-3h6l2 3h3v11H4z" {...pen} />
          <Circle cx={12} cy={13} r={3.5} {...pen} />
        </>
      )}
      {name === 'note' && (
        <>
          <Path d="M6 3h9l4 4v14H6z" {...pen} />
          <Path d="M9 11h7M9 15h7" {...pen} />
        </>
      )}
      {name === 'qr' && (
        <>
          <Rect x={4} y={4} width={6} height={6} {...pen} />
          <Rect x={14} y={4} width={6} height={6} {...pen} />
          <Rect x={4} y={14} width={6} height={6} {...pen} />
          <Path d="M14 14h2v2h-2zM18 18h2v2h-2z" {...pen} />
        </>
      )}
      {name === 'gear' && (
        <>
          <Circle cx={12} cy={12} r={3} {...pen} />
          <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" {...pen} />
        </>
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...pen} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...pen} />}
      {name === 'back' && <Path d="M15 5l-7 7 7 7" {...pen} />}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={9} {...pen} />
          <Path d="M12 7v5l3 2" {...pen} />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" {...pen} />
          <Circle cx={12} cy={10} r={2.5} {...pen} />
        </>
      )}
      {name === 'overlap' && <Path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" {...pen} />}
      {name === 'swap' && <Path d="M7 7h11l-3-3M17 17H6l3 3" {...pen} />}
      {name === 'cancel' && (
        <>
          <Circle cx={12} cy={12} r={9} {...pen} />
          <Path d="M6 6l12 12" {...pen} />
        </>
      )}
      {name === 'later' && (
        <>
          <Circle cx={12} cy={13} r={8} {...pen} />
          <Path d="M12 9v4l2 2M9 2h6" {...pen} />
        </>
      )}
    </Svg>
  );
}

const KEYWORDS: [IconName, string[]][] = [
  ['car', ['ride', 'pickup', 'pick-up', 'pick up', 'drop-off', 'drop off', 'carpool']],
  ['basketball', ['basketball', 'hoops', 'tip-off', 'tipoff', 'home game']],
  ['volleyball', ['volleyball', 'v-ball', 'vball']],
  ['ball', ['soccer', 'game', 'match', 'tournament']],
  ['run', ['track', 'run', 'cross country']],
  ['music', ['piano', 'music', 'band', 'choir', 'recital']],
  ['robot', ['robot', 'stem', 'coding']],
  ['book', ['sat', 'tutor', 'class', 'prep', 'homework']],
  ['health', ['doctor', 'dentist', 'ortho', 'physical', 'clinic']],
  ['school', ['school', 'half day', 'conference', 'picture day']],
];

export function iconForTitle(title: string): IconName {
  const text = title.toLowerCase();
  for (const [icon, words] of KEYWORDS) {
    if (words.some((word) => hasWord(text, word))) return icon;
  }
  return 'calendar';
}

function hasWord(text: string, word: string): boolean {
  if (word.includes(' ')) return text.includes(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}
