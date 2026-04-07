import { env } from '#lib/env.ts';

interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

interface CloudflareResponse {
  iceServers: {
    urls: string[];
    username?: string;
    credential?: string;
  };
}

const CREDENTIAL_TTL = 86400;

export class TurnService {
  get isConfigured(): boolean {
    return env.cfTurnKeyId !== '' && env.cfTurnApiToken !== '';
  }

  async generateIceServers(): Promise<IceServer[]> {
    if (!this.isConfigured) {
      return [{ urls: ['stun:stun.l.google.com:19302'] }];
    }

    const resp = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.cfTurnKeyId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.cfTurnApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL }),
      },
    );

    if (!resp.ok) {
      throw new Error(`Cloudflare TURN API error: ${resp.status}`);
    }

    const data = (await resp.json()) as CloudflareResponse;
    return [data.iceServers];
  }
}
