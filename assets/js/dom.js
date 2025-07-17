import { loadMRRank, sortByMRRank } from './mrrank.js';
import { navigateToUmlsUrl, isNoCode, stripBaseUrl, extractCui } from './url-utils.js';
import { fetchConceptDetails, modalCurrentData } from './api.js';

export function renderConceptSummary(concept, detailType = '') {
  const summary = document.getElementById('concept-summary');
  if (!summary) return;
  if (!concept || typeof concept !== 'object') {
    summary.classList.add('hidden');
    summary.innerHTML = '';
    return;
  }
  summary.innerHTML = '';
  const header = document.createElement('h2');
  const name = concept.name || modalCurrentData.name || '';
  let identifier;
  if (modalCurrentData.returnIdType === 'code') {
    identifier = stripBaseUrl(modalCurrentData.uri) || modalCurrentData.ui || concept.ui || '';
  } else {
    identifier = concept.ui || modalCurrentData.ui || '';
  }
  let headerText = name ? `${name} (${identifier})` : identifier;
  const isAtom = modalCurrentData.returnIdType === 'aui';
  if (isAtom) {
    headerText += ' Atom';
  } else if (modalCurrentData.returnIdType === 'semanticType') {
    headerText += ' - Semantic Type';
  } else if (modalCurrentData.returnIdType === 'concept') {
    headerText += ' - UMLS Concept';
  } else {
    const source = concept.rootSource || modalCurrentData.sab;
    if (source) {
      headerText += ` - ${source} code`;
    }
  }
  if (detailType && detailType !== 'to' && detailType !== 'from') {
    headerText += ` ${detailType}`;
  }
  header.textContent = headerText.trim();
  summary.appendChild(header);
  summary.classList.remove('hidden');
}

export async function renderSearchResults(data, returnIdType) {
  const resultsContainer = document.getElementById('output');
  const infoTableBody = document.querySelector('#info-table tbody');
  const tableHead = document.querySelector('#info-table thead');
  const resultsHeading = document.getElementById('results-heading');
  const infoTable = document.getElementById('info-table');
  const noResultsMessage = document.getElementById('no-results-message');

  let displayData = data;
  if (data && data.result && Array.isArray(data.result.results)) {
    displayData = JSON.parse(JSON.stringify(data));
    displayData.result.results = displayData.result.results.map((item) => {
      const cleaned = { ...item };
      Object.keys(cleaned).forEach((key) => {
        if (/^(atom|relation)count$/i.test(key)) delete cleaned[key];
      });
      return cleaned;
    });
  }
  resultsContainer.textContent = JSON.stringify(displayData, null, 2);
  infoTableBody.innerHTML = '';

  const results = data.result && data.result.results ? data.result.results : [];
  await loadMRRank();
  const sortedResults = sortByMRRank(results);

  if (sortedResults.length === 0) {
    if (infoTable) infoTable.style.display = 'none';
    if (noResultsMessage) noResultsMessage.classList.remove('hidden');
    return;
  }

  if (infoTable) infoTable.style.display = '';
  if (noResultsMessage) noResultsMessage.classList.add('hidden');

  sortedResults.forEach(item => {
    const tr = document.createElement('tr');
    const uiTd = document.createElement('td');
    uiTd.textContent = item.ui || 'N/A';
    if (item.ui && !isNoCode(item.ui)) {
      uiTd.style.color = 'blue';
      uiTd.style.textDecoration = 'underline';
      uiTd.style.cursor = 'pointer';
      uiTd.addEventListener('click', () => {
        modalCurrentData.ui = item.ui;
        modalCurrentData.name = item.name || null;
        if (returnIdType === 'code') {
          modalCurrentData.sab = item.rootSource;
          modalCurrentData.uri = item.uri ? item.uri.replace(/\/code$/, '') : null;
          modalCurrentData.returnIdType = 'code';
        } else {
          modalCurrentData.sab = null;
          modalCurrentData.uri = null;
          modalCurrentData.returnIdType = 'concept';
        }
        fetchConceptDetails(item.ui, '');
      });
    }
    tr.appendChild(uiTd);
    const nameTd = document.createElement('td');
    nameTd.textContent = item.name || 'N/A';
    tr.appendChild(nameTd);
    const rootSourceHeader = document.getElementById('root-source-header');
    if (rootSourceHeader.style.display !== 'none') {
      const rootSourceTd = document.createElement('td');
      rootSourceTd.textContent = item.rootSource || 'N/A';
      tr.appendChild(rootSourceTd);
    }
    infoTableBody.appendChild(tr);
  });
}

export function getSelectedVocabularies() {
  return Array.from(document.querySelectorAll('#vocab-container input:checked')).map(cb => cb.value);
}
