import { loadMRRank, DEFAULT_SEMANTIC_NETWORK_RELEASE } from './mrrank.js';
import { parseHash, updateDocLink } from './url-utils.js';
import { searchUMLS, fetchConceptDetails, fetchAuiDetails, fetchRelatedDetail, fetchCuisForCode, fetchSemanticType, modalCurrentData, setSearchRelease } from './api.js';

window.addEventListener('DOMContentLoaded', function () {
  loadMRRank();
  updateDocLink(new URL('https://uts-ws.nlm.nih.gov/rest/home.html'));

  const returnSelector = document.getElementById('return-id-type');
  const vocabContainer = document.getElementById('vocab-container');
  const rootSourceHeader = document.getElementById('root-source-header');
  const queryInput = document.getElementById('query');
  const definitionsOption = document.getElementById('definitions-option');
  const attributesOption = document.getElementById('attributes-option');
  const parentsOption = document.getElementById('parents-option');
  const childrenOption = document.getElementById('children-option');
  const cuisOption = document.getElementById('cuis-option');

  if (!returnSelector || !vocabContainer || !rootSourceHeader || !queryInput) return;

  function applyUrlParams(fromPopState = false) {
    const params = new URLSearchParams(window.location.search);
    const hashParams = parseHash();
    const storedKey = localStorage.getItem('apiKey');
    const apiKey = params.get('apiKey') || storedKey;
    const searchString = params.get('string');
    let returnIdType = params.get('returnIdType') || hashParams.returnIdType;
    const sabs = params.get('sabs') || hashParams.sabs;
    const inputType = params.get('inputType') || hashParams.inputType;
    const searchType = params.get('searchType') || hashParams.searchType;
    if (inputType === 'sourceUi' && searchType === 'exact') {
      returnIdType = 'concept';
    }
    if (!returnIdType) {
      returnIdType = 'concept';
    }
    let detail = params.get('detail') || hashParams.detail;
    if (detail === 'concept') detail = '';
    let cui = params.get('cui') || hashParams.cui;
    let code = params.get('code') || hashParams.code;
    let aui = params.get('aui') || hashParams.aui;
    if (!aui && /^A\d{7}$/i.test(cui || '')) {
      aui = cui;
      cui = null;
    }
    let related = params.get('related') || hashParams.related;
    let relatedId = params.get('relatedId') || hashParams.relatedId;
    let sab = params.get('sab') || hashParams.sab;
    let tui = params.get('tui') || hashParams.tui;
    let semanticRelease = params.get('semanticRelease') || hashParams.semanticRelease;

    if (apiKey) {
      document.getElementById('api-key').value = apiKey;
      localStorage.setItem('apiKey', apiKey);
    }
    if (searchString) {
      document.getElementById('query').value = searchString;
    } else {
      document.getElementById('query').value = '';
    }
    if (returnIdType) {
      returnSelector.value = returnIdType;
    }

    document.querySelectorAll('#vocab-container input').forEach(cb => { cb.checked = false; });
    if (sabs) {
      sabs.split(',').forEach(v => {
        const cb = document.querySelector(`#vocab-container input[value="${v}"]`);
        if (cb) cb.checked = true;
      });
    } else {
      document.querySelectorAll('#vocab-container input').forEach(cb => { cb.checked = true; });
    }
    updateVocabVisibility();

    if (related && relatedId) {
      modalCurrentData.ui = relatedId;
      modalCurrentData.name = null;
      const isAui = /^A\d{7}$/i.test(relatedId);
      if (sab && !isAui) {
        modalCurrentData.sab = sab;
        modalCurrentData.uri = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${sab}/${relatedId}`;
        modalCurrentData.returnIdType = 'code';
      } else {
        modalCurrentData.sab = null;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = isAui ? 'aui' : 'concept';
      }
      const rootSourceForFetch = sab && !isAui ? sab : undefined;
      fetchRelatedDetail(relatedId, related, rootSourceForFetch, { skipPushState: fromPopState });
    } else if (detail) {
      if (aui) {
        modalCurrentData.sab = null;
        modalCurrentData.ui = aui;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = 'aui';
        fetchAuiDetails(aui, detail, { skipPushState: fromPopState });
      } else if (returnSelector.value === 'code' && code && sab) {
        modalCurrentData.sab = sab;
        modalCurrentData.ui = code;
        modalCurrentData.uri = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${sab}/${code}`;
        modalCurrentData.returnIdType = 'code';
      } else {
        modalCurrentData.sab = null;
        modalCurrentData.ui = cui;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = 'concept';
      }
      if (!aui) {
        fetchConceptDetails(code || cui, detail, { skipPushState: fromPopState });
      }
    } else if ((returnSelector.value === 'code' && code && sab) || (returnSelector.value !== 'code' && cui)) {
      if (returnSelector.value === 'code') {
        modalCurrentData.sab = sab;
        modalCurrentData.ui = code;
        modalCurrentData.uri = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${sab}/${code}`;
        modalCurrentData.returnIdType = 'code';
      } else {
        modalCurrentData.sab = null;
        modalCurrentData.ui = cui;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = 'concept';
      }
      fetchConceptDetails(code || cui, '', { skipPushState: fromPopState });
    } else if (aui) {
      modalCurrentData.sab = null;
      modalCurrentData.ui = aui;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = 'aui';
      fetchAuiDetails(aui, '', { skipPushState: fromPopState });
    } else if (tui) {
      modalCurrentData.sab = null;
      modalCurrentData.ui = tui;
      modalCurrentData.name = null;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = 'semanticType';
      fetchSemanticType(tui, { skipPushState: fromPopState, release: semanticRelease || DEFAULT_SEMANTIC_NETWORK_RELEASE });
    } else if (inputType === 'sourceUi' && searchType === 'exact' && searchString) {
      if (hashParams.searchRelease) {
        setSearchRelease(hashParams.searchRelease);
      }
      fetchCuisForCode(searchString, sab);
    } else if (searchString) {
      searchUMLS({ skipPushState: fromPopState, useCache: fromPopState, release: hashParams.searchRelease });
    }
  }

  function updateVocabVisibility() {
    if (returnSelector.value === 'code') {
      vocabContainer.classList.remove('hidden');
      rootSourceHeader.style.display = '';
      if (definitionsOption) definitionsOption.classList.add('hidden');
      if (parentsOption) parentsOption.classList.remove('hidden');
      if (childrenOption) childrenOption.classList.remove('hidden');
      if (cuisOption) cuisOption.classList.remove('hidden');
    } else {
      vocabContainer.classList.add('hidden');
      rootSourceHeader.style.display = 'none';
      if (definitionsOption) definitionsOption.classList.remove('hidden');
      if (parentsOption) parentsOption.classList.add('hidden');
      if (childrenOption) childrenOption.classList.add('hidden');
      if (cuisOption) cuisOption.classList.add('hidden');
    }
  }
  window.updateVocabVisibility = updateVocabVisibility;

  returnSelector.addEventListener('change', updateVocabVisibility);
  updateVocabVisibility();

  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchUMLS();
    }
  });

  applyUrlParams();
  window.addEventListener('popstate', () => applyUrlParams(true));
});
