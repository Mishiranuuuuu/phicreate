export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadJson = (data: unknown, filename: string) =>
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export const toSafeFilename = (name: string) => name.replace(/[^\w\- ]+/g, '_').trim() || 'project';
