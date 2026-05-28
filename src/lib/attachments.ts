import type { StoredFile } from '@/db/types';
import type { Attachment } from '@/providers/types';
import type { Capabilities } from '@/providers/types';

export type AttachmentKind = 'image' | 'pdf' | 'text';

/** Classify a MIME type into a supported attachment kind, or null. */
export function classify(mimeType: string, name = ''): AttachmentKind | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    /\.(txt|md|csv|json|ya?ml|toml|ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|css|html|xml|sh)$/i.test(
      name,
    )
  ) {
    return 'text';
  }
  return null;
}

/** Whether a file may be attached given the provider's capabilities. */
export function isAllowed(
  mimeType: string,
  name: string,
  caps: Capabilities,
): boolean {
  const kind = classify(mimeType, name);
  if (kind === 'image') return caps.vision;
  if (kind === 'pdf') return caps.pdf;
  return kind === 'text';
}

/** `accept` attribute for the file input, narrowed to what the provider takes. */
export function acceptFor(caps: Capabilities): string {
  const parts = ['text/*', '.md', '.csv', '.json', '.log'];
  if (caps.vision) parts.push('image/*');
  if (caps.pdf) parts.push('application/pdf');
  return parts.join(',');
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Resolve a stored file to inline data for sending. */
export async function fileToAttachment(
  file: StoredFile,
): Promise<Attachment | null> {
  const kind = classify(file.mimeType, file.name);
  if (!kind) return null;
  if (kind === 'text') {
    return { kind, name: file.name, mimeType: file.mimeType, data: await file.blob.text() };
  }
  return {
    kind,
    name: file.name,
    mimeType: file.mimeType,
    data: await blobToBase64(file.blob),
  };
}
