import { importChartPackage } from './importRpe';
import type { ImportResult } from './types';

const API = 'https://phira.5wyxi.com';

// Phira's CDN only allows CORS from whitelisted origins; set VITE_PHIRA_PROXY to the worker URL.
const PROXY = import.meta.env.VITE_PHIRA_PROXY as string | undefined;
const viaProxy = (url: string) => (PROXY ? `${PROXY}?url=${encodeURIComponent(url)}` : url);

export function parsePhiraId(input: string): string | null {
  const text = input.trim();
  return /^\d+$/.test(text) ? text : (/phira\.moe\/chart\/(\d+)/i.exec(text)?.[1] ?? null);
}

// Downloads a Phira chart by URL or ID and unpacks it. Throws a user-facing Error on failure.
export async function importFromPhira(input: string): Promise<ImportResult> {
  const id = parsePhiraId(input);
  if (!id) throw new Error('Enter a phira.moe/chart/[ID] URL or a chart ID.');

  const res = await fetch(viaProxy(`${API}/chart/${id}`)).catch(() => null);
  if (!res) throw new Error('Could not reach Phira.');
  if (!res.ok) throw new Error(res.status === 404 ? 'Chart not found.' : 'Phira request failed.');
  const fileUrl = ((await res.json().catch(() => null)) as { file?: string } | null)?.file;
  if (!fileUrl) throw new Error('This chart has no downloadable file.');

  let blob: Blob;
  try {
    const res = await fetch(viaProxy(fileUrl));
    if (!res.ok) throw new Error();
    blob = await res.blob();
  } catch {
    throw new Error('Could not download the chart.');
  }
  const result = await importChartPackage(blob);
  if (!result) throw new Error('The downloaded file is not a valid chart.');
  return result;
}
