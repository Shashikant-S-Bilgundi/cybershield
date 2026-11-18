import { create } from 'zustand';
import type { Session } from '@/types';

interface SessionState {
  session: Session | null;
  loaded: boolean;
  setSession: (s: Session | null) => void;
  setReauthUntil: (v: string) => void;
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  loaded: false,
  setSession: (session) => set({ session, loaded: true }),
  setReauthUntil: (reauthUntil) =>
    set((s) => (s.session ? { session: { ...s.session, reauthUntil } } : s)),
}));