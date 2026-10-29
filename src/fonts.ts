import { createContext, useContext } from 'react';

export const FontReadyContext = createContext(false);

export function useTypeface() {
  const ready = useContext(FontReadyContext);
  if (!ready) {
    return { medium: undefined, semibold: undefined, bold: undefined, extra: undefined };
  }
  return {
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    extra: 'PlusJakartaSans_800ExtraBold',
  };
}
