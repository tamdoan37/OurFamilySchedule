import Constants from 'expo-constants';

type SyncEngine = {
  prepareSync: () => Promise<void>;
  startSync: () => void;
  createFamily: (relayUrl: string) => Promise<string>;
  joinFamily: (raw: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  currentPairingCode: () => Promise<string | null>;
  syncNow: () => void;
};

export function syncSupported(): boolean {
  return Constants.executionEnvironment !== 'storeClient';
}

export function loadSyncEngine(): SyncEngine | null {
  if (!syncSupported()) return null;
  require('../utils/installCrypto');
  return require('./syncEngine') as SyncEngine;
}
