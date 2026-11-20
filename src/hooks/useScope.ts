import { usePreferences } from '@/store/preferences';

/** The global Application and Environment filter, shaped for list API calls. */
export function useScope() {
  const applicationId = usePreferences((s) => s.applicationId);
  const environmentId = usePreferences((s) => s.environmentId);
  return {
    applicationId: applicationId ?? undefined,
    environmentId: environmentId ?? undefined,
  };
}