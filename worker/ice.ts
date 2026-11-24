// پیکربندی ICE برای WebRTC
// STUN عمومی همیشه فعال است؛ TURN فقط در صورت تنظیم Secrets زیر:
//   npx wrangler secret put TURN_URLS
//   npx wrangler secret put TURN_USERNAME
//   npx wrangler secret put TURN_CREDENTIAL
// هیچ اطلاعات فرضی یا ساختگی استفاده نمی‌شود؛ بدون Secret فقط STUN برمی‌گردد.

const STUN_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
];

export function iceServersFromEnv(env: { TURN_URLS?: string; TURN_USERNAME?: string; TURN_CREDENTIAL?: string }): RTCIceServerLike[] {
  const out: RTCIceServerLike[] = [...STUN_SERVERS];
  const urls = env.TURN_URLS?.trim();
  const user = env.TURN_USERNAME?.trim();
  const cred = env.TURN_CREDENTIAL?.trim();
  if (urls && user && cred) {
    out.push({ urls: urls.split(',').map((u) => u.trim()).filter(Boolean), username: user, credential: cred });
  }
  return out;
}

export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}
