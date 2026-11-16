import { randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(pin, Buffer.from(saltHex, 'hex'), 32);
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

/** Un PIN de 4 dígitos es débil: limitamos intentos fallidos por teléfono. */
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

export function isLocked(phone: string): boolean {
  const f = failures.get(phone);
  return !!f && f.count >= MAX_FAILS && f.until > Date.now();
}
export function recordFailure(phone: string) {
  const f = failures.get(phone);
  const count = f && f.until > Date.now() ? f.count + 1 : 1;
  failures.set(phone, { count, until: Date.now() + LOCK_MS });
}
export function clearFailures(phone: string) {
  failures.delete(phone);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I
/** Código de recuperación de 8 caracteres (≈ 40 bits), mostrado como ABCD-EFGH. */
export function recoveryCode(): { plain: string; display: string } {
  const plain = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return { plain, display: `${plain.slice(0, 4)}-${plain.slice(4)}` };
}
