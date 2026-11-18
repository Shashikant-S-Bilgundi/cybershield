const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export const isIPv4 = (v: string) => IPV4.test(v.trim());

const ipToInt = (ip: string) =>
  ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;

export function isValidCidr(value: string): boolean {
  const [ip, bits] = value.trim().split('/');
  if (!ip || bits === undefined || !/^\d+$/.test(bits)) return false;
  if (isIPv4(ip)) return Number(bits) >= 8 && Number(bits) <= 32;
  // Basic IPv6 shape check; the backend does the strict validation.
  return /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':') && Number(bits) >= 16 && Number(bits) <= 128;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  if (!isIPv4(ip) || !isIPv4(range)) return false;
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
}

/** RFC 1918, loopback and link-local ranges. */
export function isPrivateIPv4(ip: string): boolean {
  return ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16'].some((c) =>
    ipInCidr(ip, c),
  );
}

/** Pulls a bare host out of a URL, connection string or plain host. */
export function hostOf(identifier: string): string {
  const v = identifier.trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return new URL(v.replace(/^[a-z0-9+.-]+:\/\//i, 'http://')).hostname;
  } catch {
    /* fall through */
  }
  return v.split('/')[0].split(':')[0];
}

const DOMAIN = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/i;
export const isDomain = (v: string) => DOMAIN.test(v.trim());