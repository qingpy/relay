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

/** Optimistic capability fallback while the resolved config is still loading. */
export const FULL_CAPS: Capabilities = {
  vision: true,
  pdf: true,
  reasoning: true,
  webSearch: true,
  toolUse: true,
};

/** Split files into what the model takes and what it must refuse. */
export function partitionAllowed(
  files: FileList | File[],
  caps: Capabilities,
): { accepted: File[]; refused: File[] } {
  const accepted: File[] = [];
  const refused: File[] = [];
  for (const f of [...files]) {
    (isAllowed(f.type, f.name, caps) ? accepted : refused).push(f);
  }
  return { accepted, refused };
}

/** Files pasted from the clipboard — screenshots, copied images, or files
 *  copied from the OS file manager. Nameless pastes get a generated name. */
export function filesFromClipboard(data: DataTransfer): File[] {
  return Array.from(data.items)
    .filter((it) => it.kind === 'file')
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f)
    .map((f) =>
      f.name
        ? f
        : new File([f], `pasted-${Date.now()}.${f.type.split('/')[1] || 'png'}`, {
            type: f.type,
          }),
    );
}

/** `accept` attribute for the file input, narrowed to what the provider takes. */
export function acceptFor(caps: Capabilities): string {
  const parts = ['text/*', '.md', '.csv', '.json', '.log'];
  if (caps.vision) parts.push('image/*');
  if (caps.pdf) parts.push('application/pdf');
  return parts.join(',');
}

/** SHA-256 of raw bytes as lowercase hex — the content identity of a stored file. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
