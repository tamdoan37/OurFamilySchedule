import { View, Text, Pressable, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTypeface } from '../fonts';
import { useTheme } from '../theme';

const TABS = [
  { href: '/timeline', label: 'Timeline' },
  { href: '/capture', label: 'Scan' },
  { href: '/notes', label: 'Notes' },
  { href: '/pair', label: 'Pair' },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const type = useTypeface();
  return (
    <View style={[styles.bar, { backgroundColor: theme.dark ? theme.card : '#FFFDF9', borderTopColor: theme.line, paddingBottom: Math.max(insets.bottom, 10) }]}>
      {TABS.map((tab) => {
        const on = pathname === tab.href;
        const color = on ? theme.text : theme.muted;
        return (
          <Pressable key={tab.href} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => router.push(tab.href)} style={styles.item}>
            <TabIcon name={tab.label} color={color} />
            <Text style={{ color, fontSize: 11, fontWeight: on ? '800' : '600', fontFamily: on ? type.extra : type.semibold }}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ name, color }: { name: string; color: string }) {
  if (name === 'Timeline') {
    return (
      <View style={styles.icon}>
        <View style={[styles.cal, { borderColor: color }]} />
        <View style={[styles.calLine, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'Scan') {
    return (
      <View style={styles.icon}>
        <View style={[styles.cam, { borderColor: color }]} />
        <View style={[styles.camLens, { borderColor: color }]} />
      </View>
    );
  }
  if (name === 'Notes') {
    return (
      <View style={styles.icon}>
        <View style={[styles.note, { borderColor: color }]} />
        <View style={[styles.noteLine, { backgroundColor: color, top: 9 }]} />
        <View style={[styles.noteLine, { backgroundColor: color, top: 13, width: 10 }]} />
      </View>
    );
  }
  return (
    <View style={styles.icon}>
      <View style={[styles.qr, { borderColor: color, left: 3, top: 3 }]} />
      <View style={[styles.qr, { borderColor: color, right: 3, top: 3 }]} />
      <View style={[styles.qr, { borderColor: color, left: 3, bottom: 3 }]} />
      <View style={[styles.qrDot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    paddingTop: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
  },
  item: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  icon: { width: 22, height: 22 },
  cal: { position: 'absolute', left: 2, right: 2, top: 3, bottom: 1, borderWidth: 1.8, borderRadius: 3 },
  calLine: { position: 'absolute', left: 2, right: 2, top: 8, height: 1.8 },
  cam: { position: 'absolute', left: 1, right: 1, top: 5, bottom: 2, borderWidth: 1.8, borderRadius: 3 },
  camLens: { position: 'absolute', left: 7, top: 8, width: 8, height: 8, borderRadius: 4, borderWidth: 1.8 },
  note: { position: 'absolute', left: 4, right: 4, top: 1, bottom: 1, borderWidth: 1.8, borderRadius: 2 },
  noteLine: { position: 'absolute', left: 6, width: 8, height: 1.6 },
  qr: { position: 'absolute', width: 7, height: 7, borderWidth: 1.8 },
  qrDot: { position: 'absolute', right: 4, bottom: 4, width: 4, height: 4 },
});
