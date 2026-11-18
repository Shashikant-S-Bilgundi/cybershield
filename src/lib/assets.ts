import type { AssetAuthorization } from '@/types';

/** Only verified or approved assets may be checked or scanned. */
export const isAuthorized = (a: AssetAuthorization) => a.status === 'verified' || a.status === 'approved';