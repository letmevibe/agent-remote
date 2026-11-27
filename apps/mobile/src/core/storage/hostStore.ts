import * as SecureStore from 'expo-secure-store';

export interface SavedHost {
  hostId: string;
  hostName: string;
  url: string;
  deviceToken: string;
  workspacePath: string;
}

const STORAGE_KEY = 'agent_remote.active_host.v1';
let memoryFallback: SavedHost | null = null;

export async function loadActiveHost(): Promise<SavedHost | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return memoryFallback;
    return JSON.parse(raw) as SavedHost;
  } catch {
    return memoryFallback;
  }
}

export async function saveActiveHost(host: SavedHost): Promise<void> {
  memoryFallback = host;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(host));
  } catch {
    // Fallback for environments where SecureStore is unavailable
  }
}

export async function clearActiveHost(): Promise<void> {
  memoryFallback = null;
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Ignore cleanup errors
  }
}
