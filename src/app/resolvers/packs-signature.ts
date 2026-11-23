/**
 * Cheap fingerprint of the NRDB card-set list: set ids plus the latest `updated_at`,
 * so both a new set release and a data import on the NRDB side change it.
 */
export function computePacksSignature(packs: Array<{ id: string; updated_at?: string }>): string {
  const ids = packs.map(p => p.id).sort().join(',');
  const latest = packs.map(p => p.updated_at ?? '').sort().pop() ?? '';
  return `${ids}|${latest}`;
}
