import { forwardRef, type ElementRef } from 'react';
import { Pressable, Text, StyleSheet, PressableProps, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../theme';

type Props = Omit<PressableProps, 'style'> & {
  title: string;
  variant?: 'primary' | 'secondary';
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const PillButton = forwardRef<ElementRef<typeof Pressable>, Props>(function PillButton(
  { title, variant = 'primary', compact = false, disabled, style, ...rest },
  ref,
) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        {
          backgroundColor: primary ? theme.primary : 'transparent',
          borderColor: theme.primary,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <Text style={{ color: primary ? theme.onPrimary : theme.primary, fontWeight: '700', fontSize: compact ? 14 : 16 }}>
        {title}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 36, paddingHorizontal: 14 },
});
