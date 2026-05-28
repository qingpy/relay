import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
}

/**
 * Load the Vertex service-account JSON from the environment (creds stay
 * server-side, never the browser): `GOOGLE_VERTEX_CREDENTIALS` (inline JSON) or
 * `GOOGLE_VERTEX_CREDENTIALS_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` (a path).
 */
export function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_VERTEX_CREDENTIALS;
  const file =
    process.env.GOOGLE_VERTEX_CREDENTIALS_FILE ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    if (raw) return JSON.parse(raw) as ServiceAccount;
    if (file) return JSON.parse(readFileSync(file, 'utf-8')) as ServiceAccount;
  } catch {
    return null;
  }
  return null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const cache = new Map<string, { token: string; exp: number }>();

/** Mint (and cache) a GCP access token from the service account via signed JWT. */
export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const hit = cache.get(sa.client_email);
  if (hit && hit.exp - 60 > now) return hit.token;

  // Private keys pasted/transported as JSON keep literal "\n"; restore them.
  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(privateKey))}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  const token = json.access_token;
  cache.set(sa.client_email, { token, exp: now + (json.expires_in ?? 3600) });
  return token;
}
