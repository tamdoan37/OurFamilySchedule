import { View, Text, Pressable, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from './Icon';
import { useTypeface } from '../fonts';
import { useTheme } from '../theme';

const TABS: { href: '/timeline' | '/capture' | '/notes' | '/pair'; label: string; icon: IconName }[] = [
  { href: '/timeline', label: 'Timeline', icon: 'calendar' },
  { href: '/capture', label: 'Scan', icon: 'camera' },
  { href: '/notes', label: 'Notes', icon: 'note' },
  { href: '/pair', label: 'Pair', icon: 'qr' },
];

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const type = useTypeface();
  return (
    <View style={[styles.bar, { backgroundColor: theme.dark ? theme.card : theme.cardWarm, borderTopColor: theme.line, height: 72 + insets.bottom, paddingBottom: 14 + insets.bottom }]}>
      {TABS.map((tab) => {
        const on = pathname === tab.href;
        const color = on ? theme.text : theme.muted;
        return (
          <Pressable key={tab.href} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => router.push(tab.href)} style={styles.item}>
            <Icon name={tab.icon} size={22} color={color} strokeWidth={on ? 2 : 1.8} />
            <Text style={{ color, fontSize: 11, fontFamily: on ? type.extra : type.semibold }}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 7,
    borderTopWidth: 1,
    paddingTop: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
});
