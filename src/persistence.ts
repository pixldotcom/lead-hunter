import { emptyData, parseBackup, STORE_KEY, uid, type AppData } from './domain';
import { requireUniqueLeadIds, validateData } from './dataValidation';

type StorageAccess = Pick<Storage,'getItem'|'setItem'>;
export type Workspace = { data: AppData | null; raw: string | null; error: string; normalizationPending: boolean };
export function loadWorkspace(storage: StorageAccess): Workspace {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORE_KEY);
    if (raw === null) return { data:emptyData(), raw:null, error:'', normalizationPending:false };
    const data = requireUniqueLeadIds(parseBackup(raw));
    return { data, raw, error:'', normalizationPending:JSON.stringify(data)!==JSON.stringify(JSON.parse(raw)) };
  } catch (error) {
    return { data:null, raw, error:error instanceof Error ? error.message : 'Browser storage is unavailable.', normalizationPending:false };
  }
}
export function persistWorkspace(storage: StorageAccess, current: Workspace, next: AppData): Workspace {
  if (!current.data || current.error) throw new Error('Workspace writes are blocked until the saved data is repaired. Download the original data for recovery.');
  const data = requireUniqueLeadIds(validateData(next));
  const encoded = JSON.stringify(data);
  // Do not overwrite changes from another tab or from outside this workspace.
  if (storage.getItem(STORE_KEY) !== current.raw) throw new Error('Saved data changed in another tab. Export your current backup and reload before saving.');
  if (current.normalizationPending && current.raw !== null) storage.setItem(`${STORE_KEY}-recovery-${uid()}`,current.raw);
  // If either write fails, the caller keeps the previous in-memory workspace.
  storage.setItem(STORE_KEY,encoded);
  return { data, raw:encoded, error:'', normalizationPending:false };
}

// Called only after the user reviews and confirms a repaired backup in recovery mode.
export function restoreWorkspace(storage: StorageAccess, current: Workspace, next: AppData): Workspace {
  if (current.data || current.raw === null) throw new Error('Reload the workspace before attempting recovery.');
  const data = requireUniqueLeadIds(validateData(next));
  if (storage.getItem(STORE_KEY) !== current.raw) throw new Error('Saved data changed. Reload before attempting recovery.');
  storage.setItem(`${STORE_KEY}-recovery-${uid()}`,current.raw);
  const raw = JSON.stringify(data);
  storage.setItem(STORE_KEY,raw);
  return { data, raw, error:'', normalizationPending:false };
}
