import { fetchConceptDetails, fetchAuiDetails, fetchRelatedDetail, fetchCuisForCode, searchUMLS, fetchSemanticType, modalCurrentData } from './api.js';
import { DEFAULT_SEMANTIC_NETWORK_RELEASE } from './mrrank.js';

export function colorizeUrl(urlObject) {
  const base = urlObject.origin + urlObject.pathname;
  let colorized = `<span style="color:blue">${base}</span>`;
  const params = [];
  for (let [key, value] of urlObject.searchParams.entries()) {
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(value).replace(/%2C/g, ',');
    params.push(`<span style="color:green">${encodedKey}</span>=<span style="color:red">${encodedValue}</span>`);
  }
  if (params.length > 0) {
    colorized += `?${params.join('&')}`;
  }
  return colorized;
}

export function updateLocationHash(urlObject) {
  if (!urlObject || !urlObject.pathname) return;
  const cleanPath = urlObject.pathname.replace(/^\/rest\/?/, '');
  const newUrl = new URL(window.location.href);
  newUrl.hash = cleanPath ? cleanPath : '';
  history.replaceState(history.state, '', newUrl);
}

export function updateDocLink(urlObject) {
  const docLink = document.getElementById('recent-doc-link');
  if (!docLink || !urlObject) return;
  const pathParts = urlObject.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2 || pathParts[0] !== 'rest') {
    docLink.href = 'https://documentation.uts.nlm.nih.gov/rest/home.html';
    return;
  }
  const anchorDocMap = {
    atoms: 'concept',
    definitions: 'concept',
    relations: 'concept',
    parents: 'concept',
    children: 'concept',
    ancestors: 'concept',
    descendants: 'concept',
    cuis: 'search'
  };
  const last = pathParts[pathParts.length - 1];
  let docSection = anchorDocMap[last];
  if (!docSection) {
    const section = pathParts[1];
    docSection = section === 'content' ? 'concept' : section;
    if (section === 'content' && pathParts.includes('AUI')) {
      docSection = 'atom';
    }
  }
  const lowerParts = pathParts.map(p => p.toLowerCase());
  if (lowerParts.includes('search')) {
    docSection = 'search';
  } else if (pathParts.includes('CUI')) {
    docSection = 'concept';
  } else if (pathParts.includes('AUI')) {
    docSection = 'atoms';
  } else if (pathParts.includes('source')) {
    docSection = 'source-asserted-identifiers';
  } else if (pathParts.includes('TUI') || pathParts.some(p => /^T\d{3}$/i.test(p))) {
    docSection = 'semantic-network';
  }
  let docUrl = `https://documentation.uts.nlm.nih.gov/rest/${docSection}/index.html`;
  if (anchorDocMap[last] && anchorDocMap[last] === docSection) {
    docUrl += `#${last}`;
  }
  docLink.href = docUrl;
}

export function stripBaseUrl(fullUrl) {
  if (!fullUrl) return '';
  const withoutQuery = fullUrl.replace(/[?#].*$/, '');
  const trimmed = withoutQuery.replace(/\/+$/, '');
  const parts = trimmed.split('/');
  let last = parts.length ? parts[parts.length - 1] : trimmed;
  if (last === 'code' && parts.length > 1) {
    last = parts[parts.length - 2];
  }
  return last;
}

export function parseHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return {};
  const [pathPart, queryPart] = hash.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const result = {};
  if (parts[0] === 'content') {
    if (parts[2] === 'source') {
      if (parts.length >= 6) {
        result.sab = parts[3];
        result.code = parts[4];
        result.detail = parts[5];
        result.returnIdType = 'code';
      } else if (parts.length === 5) {
        result.sab = parts[3];
        result.code = parts[4];
        result.returnIdType = 'code';
      }
    } else if (parts[2] === 'AUI') {
      if (parts.length >= 4) {
        result.aui = parts[3];
        result.detail = parts[4];
      }
    } else if (parts.length >= 4) {
      result.cui = parts[3];
      result.detail = parts[4];
    } else if (parts.length === 3) {
      result.cui = parts[2];
    }
  } else if (parts[0] === 'semantic-network') {
    if (parts[1] === 'semantic-types' && parts.length >= 3) {
      result.tui = parts[2];
    } else if (parts.length >= 3) {
      result.searchRelease = parts[1];
      result.tui = parts[3];
    }
  } else if (parts[0] === 'search') {
    if (parts.length >= 2) {
      result.searchRelease = parts[1];
    }
  }
  if (queryPart) {
    result.params = new URLSearchParams(queryPart);
    for (const [key, val] of result.params) {
      result[key] = val;
    }
  }
  return result;
}

export function parseUmlsUrl(url) {
  try {
    const u = new URL(url, window.location.href);
    let m = u.pathname.match(/\/content\/[^/]+\/CUI\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      const detail = m[2] || '';
      return { type: 'concept', cui: m[1], detail: detail === 'concept' ? '' : detail };
    }
    m = u.pathname.match(/\/content\/[^/]+\/source\/([^/]+)\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      return { type: 'code', sab: m[1], code: m[2], detail: m[3] || '' };
    }
    m = u.pathname.match(/\/content\/[^/]+\/AUI\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      return { type: 'aui', aui: m[1], detail: m[2] || '' };
    }
    m = u.pathname.match(/\/semantic-network\/([^/]+)\/TUI\/([^/]+)\/?$/);
    if (m) {
      return { type: 'semanticType', release: m[1], tui: m[2] };
    }
    m = u.pathname.match(/\/semantic-network\/semantic-types\/([^/]+)\/?$/);
    if (m) {
      return { type: 'semanticType', tui: m[1] };
    }
    m = u.pathname.match(/\/search\/([^/]+)\/?$/);
    if (m) {
      return { type: 'search', release: m[1], params: u.searchParams };
    }
  } catch (e) {}
  return null;
}

export function extractCui(concept) {
  if (!concept) return '';
  if (typeof concept === 'string') {
    const m = concept.match(/\/CUI\/([^/]+)/);
    return m ? m[1] : concept;
  }
  if (typeof concept === 'object' && concept.ui) {
    return concept.ui;
  }
  return '';
}

export function isNoCode(id) {
  if (typeof id !== 'string') return false;
  const cleaned = stripBaseUrl(id.trim());
  return cleaned.toUpperCase() === 'NOCODE';
}

export function navigateToUmlsUrl(url, key) {
  if (isNoCode(url)) return;
  const parsed = parseUmlsUrl(url);
  if (parsed) {
    const detail = parsed.detail === 'concept' ? '' : parsed.detail;
    if (parsed.type === 'code') {
      modalCurrentData.sab = parsed.sab;
      modalCurrentData.ui = parsed.code;
      const baseParts = url.split('/');
      if (detail) {
        baseParts.splice(-detail.split('/').length, detail.split('/').length);
      }
      modalCurrentData.uri = baseParts.join('/');
      modalCurrentData.returnIdType = 'code';
      fetchConceptDetails(parsed.code, detail !== undefined ? detail : key.toLowerCase());
    } else if (parsed.type === 'search') {
      const queryInput = document.getElementById('query');
      const returnSelector = document.getElementById('return-id-type');
      if (queryInput) queryInput.value = parsed.params.get('string') || '';
      const inputType = parsed.params.get('inputType');
      const searchType = parsed.params.get('searchType');
      if (returnSelector) {
        const ret = parsed.params.get('returnIdType');
        if (ret) {
          returnSelector.value = ret;
        } else if (inputType === 'sourceUi' && searchType === 'exact') {
          returnSelector.value = 'concept';
        }
      }
      document.querySelectorAll('#vocab-container input').forEach(cb => { cb.checked = false; });
      const sabs = parsed.params.get('sabs');
      if (sabs) {
        sabs.split(',').forEach(v => {
          const cb = document.querySelector(`#vocab-container input[value="${v}"]`);
          if (cb) cb.checked = true;
        });
      } else {
        document.querySelectorAll('#vocab-container input').forEach(cb => { cb.checked = true; });
      }
      if (typeof window.updateVocabVisibility === 'function') {
        window.updateVocabVisibility();
      }
      if (inputType === 'sourceUi' && searchType === 'exact') {
        fetchCuisForCode(parsed.params.get('string'), sabs);
      } else {
        searchUMLS({ release: parsed.release });
      }
    } else if (parsed.type === 'aui') {
      modalCurrentData.sab = null;
      modalCurrentData.ui = parsed.aui;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = 'aui';
      fetchAuiDetails(parsed.aui, detail !== undefined ? detail : key.toLowerCase());
    } else if (parsed.type === 'concept') {
      modalCurrentData.sab = null;
      modalCurrentData.ui = parsed.cui;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = 'concept';
      fetchConceptDetails(parsed.cui, detail !== undefined ? detail : key.toLowerCase());
    } else if (parsed.type === 'semanticType') {
      modalCurrentData.sab = null;
      modalCurrentData.ui = parsed.tui;
      modalCurrentData.name = null;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = 'semanticType';
      fetchSemanticType(parsed.tui, { release: parsed.release || DEFAULT_SEMANTIC_NETWORK_RELEASE });
    }
  } else {
    fetchRelatedDetail(url, key.toLowerCase());
  }
}
