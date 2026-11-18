export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isReauthRequired = (e: unknown): e is ApiError =>
  e instanceof ApiError && e.code === 'REAUTH_REQUIRED';

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : 'Something went wrong. Try again.';