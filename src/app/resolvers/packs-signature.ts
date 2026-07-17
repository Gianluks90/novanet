export function computePacksSignature(packs: Array<{ code: string }>): string {
  return packs.map(p => p.code).sort().join(',');
}
