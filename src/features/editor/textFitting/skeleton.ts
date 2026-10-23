// Zhang-Suen morphological thinning algorithm for skeletonizing text glyphs into single-pixel centerlines.

export function zhangSuenThinning(
  grid: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const current = new Uint8Array(grid);
  const toDelete: number[] = [];

  const get = (x: number, y: number): number => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return current[y * width + x] ? 1 : 0;
  };

  let changed = true;
  let iter = 0;
  const MAX_ITER = 60;

  while (changed && iter < MAX_ITER) {
    changed = false;
    iter++;

    // Step 1
    toDelete.length = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (!current[idx]) continue;

        const p2 = get(x, y - 1);
        const p3 = get(x + 1, y - 1);
        const p4 = get(x + 1, y);
        const p5 = get(x + 1, y + 1);
        const p6 = get(x, y + 1);
        const p7 = get(x - 1, y + 1);
        const p8 = get(x - 1, y);
        const p9 = get(x - 1, y - 1);

        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;

        let a = 0;
        if (!p2 && p3) a++;
        if (!p3 && p4) a++;
        if (!p4 && p5) a++;
        if (!p5 && p6) a++;
        if (!p6 && p7) a++;
        if (!p7 && p8) a++;
        if (!p8 && p9) a++;
        if (!p9 && p2) a++;

        if (a !== 1) continue;

        if (p2 * p4 * p6 !== 0) continue;
        if (p4 * p6 * p8 !== 0) continue;

        toDelete.push(idx);
      }
    }

    if (toDelete.length > 0) {
      changed = true;
      for (let i = 0; i < toDelete.length; i++) {
        current[toDelete[i]] = 0;
      }
    }

    // Step 2
    toDelete.length = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (!current[idx]) continue;

        const p2 = get(x, y - 1);
        const p3 = get(x + 1, y - 1);
        const p4 = get(x + 1, y);
        const p5 = get(x + 1, y + 1);
        const p6 = get(x, y + 1);
        const p7 = get(x - 1, y + 1);
        const p8 = get(x - 1, y);
        const p9 = get(x - 1, y - 1);

        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;

        let a = 0;
        if (!p2 && p3) a++;
        if (!p3 && p4) a++;
        if (!p4 && p5) a++;
        if (!p5 && p6) a++;
        if (!p6 && p7) a++;
        if (!p7 && p8) a++;
        if (!p8 && p9) a++;
        if (!p9 && p2) a++;

        if (a !== 1) continue;

        if (p2 * p4 * p8 !== 0) continue;
        if (p2 * p6 * p8 !== 0) continue;

        toDelete.push(idx);
      }
    }

    if (toDelete.length > 0) {
      changed = true;
      for (let i = 0; i < toDelete.length; i++) {
        current[toDelete[i]] = 0;
      }
    }
  }

  return current;
}
