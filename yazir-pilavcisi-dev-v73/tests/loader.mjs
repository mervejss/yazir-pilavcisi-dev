// Test yükleyicisi: '@/' takma adını src/ klasörüne bağlar; supabase ve react'ı hafif taklitlerle değiştirir (paket kurmadan test).
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stubs = {
  '@/lib/supabase': path.join(root, 'tests/stubs/supabase.mjs'),
  react: path.join(root, 'tests/stubs/react.mjs'),
};
export async function resolve(spec, ctx, next) {
  if (stubs[spec]) return { url: pathToFileURL(stubs[spec]).href, shortCircuit: true };
  if (spec.startsWith('@/')) {
    const base = path.join(root, 'src', spec.slice(2));
    for (const ext of ['', '.ts', '.tsx', '.mjs']) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
  }
  return next(spec, ctx);
}
