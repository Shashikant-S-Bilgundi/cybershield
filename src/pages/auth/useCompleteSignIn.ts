import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/store/session';
import type { Session } from '@/types';

export function useCompleteSignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useSession((s) => s.setSession);
  const qc = useQueryClient();
  return (session: Session) => {
    setSession(session);
    qc.setQueryData(['setup-status'], { needsSetup: false });
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/login' ? from : '/', { replace: true });
  };
}