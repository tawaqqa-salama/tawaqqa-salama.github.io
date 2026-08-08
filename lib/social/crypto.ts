/**
 * Reuse WhatsApp AES helpers; prefer SOCIAL_TOKEN_ENCRYPTION_KEY when set.
 */
import {
  decryptSecret as waDecrypt,
  encryptSecret as waEncrypt,
  redactSecrets,
} from '@/lib/whatsapp/crypto';

export function encryptSocialSecret(plaintext: string): string {
  const prev = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  if (process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  }
  try {
    return waEncrypt(plaintext);
  } finally {
    if (process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
      if (prev === undefined) delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
      else process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = prev;
    }
  }
}

export function decryptSocialSecret(payload: string | null | undefined): string | null {
  const prev = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  if (process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  }
  try {
    return waDecrypt(payload);
  } finally {
    if (process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
      if (prev === undefined) delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
      else process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = prev;
    }
  }
}

export { redactSecrets };
