// Stored name of a file, or a fallback for plain blobs.
export const fileName = (blob: Blob | undefined, fallback: string) =>
  blob instanceof File && blob.name ? blob.name : fallback;

// Fallback name with an extension from the MIME type.
export function withExt(base: string, blob: Blob) {
  const ext = blob.type.split('/')[1]?.replace(/^x-|\+.*$/g, '');
  return ext ? `${base}.${ext}` : base;
}
