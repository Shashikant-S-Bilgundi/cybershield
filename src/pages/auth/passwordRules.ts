export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}