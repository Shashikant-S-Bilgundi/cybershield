import { createContext, useContext } from 'react';
import { ApiError } from '@/api';

export type CriticalRunner = <T>(fn: () => Promise<T>) => Promise<T>;

export const ReauthContext = createContext<CriticalRunner | null>(null);

export const REAUTH_CANCELLED = 'REAUTH_CANCELLED';
export const isReauthCancelled = (e: unknown) => e instanceof ApiError && e.code === REAUTH_CANCELLED;

/** Runs a critical action, asking the user to confirm it's them if the backend requires it. */
export function useCritical(): CriticalRunner {
  const ctx = useContext(ReauthContext);
  if (!ctx) throw new Error('useCritical must be used inside ReauthProvider');
  return ctx;
}