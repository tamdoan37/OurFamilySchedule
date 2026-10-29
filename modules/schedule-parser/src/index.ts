import { requireOptionalNativeModule } from 'expo-modules-core';

export type OnDeviceParse = {
  text: string;
  model: string;
  eventsJson: string;
};

type NativeScheduleParser = {
  parsePhoto(photoPath: string, prompt: string): Promise<Partial<OnDeviceParse> | null>;
};

const native = requireOptionalNativeModule<NativeScheduleParser>('ScheduleParser');

export async function parsePhotoOnDevice(photoPath: string, prompt: string): Promise<OnDeviceParse | null> {
  if (!native || !photoPath) return null;
  try {
    const result = await native.parsePhoto(photoPath, prompt);
    if (!result) return null;
    return {
      text: typeof result.text === 'string' ? result.text : '',
      model: typeof result.model === 'string' ? result.model : 'none',
      eventsJson: typeof result.eventsJson === 'string' ? result.eventsJson : '[]',
    };
  } catch {
    return null;
  }
}
