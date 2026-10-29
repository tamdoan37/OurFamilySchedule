import Constants from 'expo-constants';
import { Platform } from 'react-native';

type SyncEngine = {
  prepareSync: () => Promise<void>;
  startSync: () => void;
  createFamily: (relayUrl: string) => Promise<string>;
  joinFamily: (raw: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  currentPairingCode: () => Promise<string | null>;
  syncNow: () => void;
  backgroundSync: () => Promise<void>;
};

export function syncSupported(): boolean {
  if (Platform.OS === 'web') return false;
  return Constants.executionEnvironment !== 'storeClient';
}

export function loadSyncEngine(): SyncEngine | null {
  if (!syncSupported()) return null;
  require('../utils/installCrypto');
  return require('./syncEngine') as SyncEngine;
}
