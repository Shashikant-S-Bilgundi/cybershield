import { httpApi } from './http';
import { mockApi } from './mock';
import type { ShieldOpsApi } from './contract';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';

export const api: ShieldOpsApi = USE_MOCKS ? mockApi : httpApi;

export * from './contract';
export * from './errors';