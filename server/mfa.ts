import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
} from "node:crypto";
import { sha256 } from "./security.js";

/** RFC 6238 time-based one-time passwords (HMAC-SHA1, 30 s, 6 digits). */
const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer) {
  let bits = 0,
    value = 0,
    output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string) {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const character of clean) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret: string, step: number, digits = DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const currentStep = (now = Date.now()) =>
  Math.floor(now / 1000 / STEP_SECONDS);

/**
 * Accepts a code from the previous, current or next step (clock drift) and
 * returns the matched step. A step at or before `lastStep` is a replay.
 */
export function verifyTotp(
  secret: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const candidate of [step - 1, step, step + 1])
    if (
      (lastStep === null || candidate > lastStep) &&
      totpCode(secret, candidate) === code
    )
      return candidate;
  return null;
}

export function otpauthUri(secret: string, account: string, issuer: string) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/**
 * AES-256-GCM, bound to the user id so a stored secret cannot be copied onto
 * another account. Format: v1:<iv>:<tag>:<ciphertext>, base64 parts.
 */
export function encryptSecret(key: Buffer, userId: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`agribridge-mfa:${userId}`));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(key: Buffer, userId: string, stored: string) {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Unsupported two-factor secret format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAAD(Buffer.from(`agribridge-mfa:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Ten base32 characters (50 bits) as xxxxx-xxxxx; stored only as hashes. */
export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const characters = Array.from(
      { length: 10 },
      () => BASE32[randomInt(32)],
    ).join("");
    return `${characters.slice(0, 5)}-${characters.slice(5)}`.toLowerCase();
  });
}

export const recoveryCodeHash = (userId: string, code: string) =>
  sha256(`agribridge-recovery:${userId}:${code.trim().toLowerCase()}`);

export const isRecoveryCode = (code: string) =>
  /^[a-z2-7]{5}-[a-z2-7]{5}$/i.test(code.trim());
