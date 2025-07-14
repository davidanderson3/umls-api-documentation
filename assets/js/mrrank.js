export const DEFAULT_PAGE_SIZE = 200;
export const DEFAULT_SEMANTIC_NETWORK_RELEASE = "2025AA";

let mrrankData =
  typeof window !== "undefined" && window.preloadedMRRankData
    ? window.preloadedMRRankData
    : { bySab: {}, bySabTty: {} };

export async function loadMRRank() {
  if (loadMRRank.loaded) return;
  if (typeof window !== "undefined" && window.preloadedMRRankData) {
    mrrankData = window.preloadedMRRankData;
    loadMRRank.loaded = true;
    return;
  }
  const response = await fetch("assets/MRRANK.RRF");
  const text = await response.text();
  text.split(/\n/).forEach((line) => {
    if (!line.trim()) return;
    const [rankStr, sab, tty] = line.split("|");
    const rank = parseInt(rankStr, 10);
    if (!mrrankData.bySabTty[sab]) mrrankData.bySabTty[sab] = {};
    mrrankData.bySabTty[sab][tty] = rank;
    if (!mrrankData.bySab[sab] || rank > mrrankData.bySab[sab]) {
      mrrankData.bySab[sab] = rank;
    }
  });
  loadMRRank.loaded = true;
}

export function getMRRank(sab, tty) {
  if (!sab) return -1;
  if (tty && mrrankData.bySabTty[sab] && mrrankData.bySabTty[sab][tty] !== undefined) {
    return mrrankData.bySabTty[sab][tty];
  }
  if (mrrankData.bySab[sab] !== undefined) {
    return mrrankData.bySab[sab];
  }
  return -1;
}

export function sortByMRRank(arr, sabKey = 'rootSource', ttyKey = 'termType') {
  if (!Array.isArray(arr)) return arr;
  return arr
    .slice()
    .sort((a, b) => getMRRank(b[sabKey], b[ttyKey]) - getMRRank(a[sabKey], a[ttyKey]));
}

export function sortByAdditionalRelationLabel(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr
    .slice()
    .sort((a, b) => {
      const aAdd = a.additionalRelationLabel || '';
      const bAdd = b.additionalRelationLabel || '';
      const addComp = aAdd.localeCompare(bAdd, undefined, { sensitivity: 'base' });
      if (addComp !== 0) return addComp;
      const aRel = a.relationLabel || '';
      const bRel = b.relationLabel || '';
      const relComp = aRel.localeCompare(bRel, undefined, { sensitivity: 'base' });
      if (relComp !== 0) return relComp;
      const aName = a.relatedIdName || '';
      const bName = b.relatedIdName || '';
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });
}
