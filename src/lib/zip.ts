import { unzip, zip, type Zippable } from 'fflate';

export const zipAsync = (files: Zippable) =>
  new Promise<Uint8Array>((resolve, reject) =>
    zip(files, (err, data) => (err ? reject(err) : resolve(data))),
  );

export const unzipAsync = (data: Uint8Array) =>
  new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(data, (err, files) => (err ? reject(err) : resolve(files))),
  );
