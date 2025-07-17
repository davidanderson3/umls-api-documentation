import { colorizeUrl, updateLocationHash, updateDocLink, stripBaseUrl, parseUmlsUrl, navigateToUmlsUrl, isNoCode, extractCui } from './url-utils.js';
import { DEFAULT_PAGE_SIZE, DEFAULT_SEMANTIC_NETWORK_RELEASE, loadMRRank, sortByMRRank, sortByAdditionalRelationLabel } from './mrrank.js';
import { renderSearchResults, renderConceptSummary, getSelectedVocabularies } from './dom.js';

export const modalCurrentData = { ui: null, sab: null, name: null, uri: null, returnIdType: 'concept' };
let searchRelease = 'current';
export function setSearchRelease(rel) { searchRelease = rel; }
export function getSearchRelease() { return searchRelease; }

let activeController = null;
function startRequest() {
  if (activeController) {
    activeController.abort();
  }
  activeController = new AbortController();
  return activeController.signal;
}

function scrollRecentRequestIntoView() {
  const recent = document.getElementById('recent-request');
  if (recent) {
    recent.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function collapseRawDataDetails() {
  const raw = document.getElementById('raw-data-details');
  if (raw && raw.hasAttribute('open')) {
    raw.removeAttribute('open');
  }
}

const searchCache = {};
export async function searchUMLS(options = {}) {
  // Intentionally avoid scrolling for search actions
  collapseRawDataDetails();
  const { skipPushState = false, useCache = false, release } = options;
  searchRelease = release || "current";
  const apiKey = document.getElementById("api-key").value.trim();
  const searchString = document.getElementById("query").value.trim();
  const returnIdType = document.getElementById("return-id-type").value;
  const selectedVocabularies =
    returnIdType === "code" ? getSelectedVocabularies() : [];
  const resultsHeading = document.getElementById("results-heading");
  const searchSummary = document.getElementById("search-summary");

  if (resultsHeading) {
    if (searchString) {
      resultsHeading.textContent = `Results: "${searchString}"`;
      resultsHeading.classList.remove("hidden");
    } else {
      resultsHeading.textContent = "";
      resultsHeading.classList.add("hidden");
    }
  }
  if (searchSummary) {
    searchSummary.textContent = "";
    searchSummary.classList.add("hidden");
  }

  if (!apiKey || !searchString) {
    alert("Please enter both an API key and a search term.");
    return;
  }

  const cacheKey = JSON.stringify({
    q: searchString,
    idType: returnIdType,
    sabs: selectedVocabularies.join(",")
  });

  const newUrl = new URL(window.location.pathname, window.location.origin);
  newUrl.searchParams.set("string", searchString);
  if (returnIdType !== "concept") {
    newUrl.searchParams.set("returnIdType", returnIdType);
  }
  if (selectedVocabularies.length > 0) {
    newUrl.searchParams.set("sabs", selectedVocabularies.join(","));
  }
  if (!skipPushState) {
    window.history.pushState({}, "", newUrl.toString());
  }

  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const recentRequestContainer = document.getElementById("recent-request-output");
  const tableHead = document.querySelector("#info-table thead");
  if (resultsHeading) {
    resultsHeading.classList.remove("hidden");
  }
  const infoTable = document.getElementById("info-table");
  const noResultsMessage = document.getElementById("no-results-message");
  renderConceptSummary(null);

  resultsContainer.textContent = "Loading...";
  tableHead.innerHTML = `<tr>
        <th>UI</th>
        <th>Name</th>
        <th id="root-source-header"${returnIdType === "code" ? "" : " style=\"display: none;\""
    }>Root Source</th>
    </tr>`;
  infoTableBody.innerHTML = '<tr><td colspan="3">No information yet...</td></tr>';
  if (infoTable) infoTable.style.display = "";
  if (noResultsMessage) noResultsMessage.classList.add("hidden");

  const url = new URL(`https://uts-ws.nlm.nih.gov/rest/search/${searchRelease}`);
  url.searchParams.append("string", searchString);
  url.searchParams.append("returnIdType", returnIdType);
  url.searchParams.append("apiKey", apiKey);
  url.searchParams.append("pageSize", DEFAULT_PAGE_SIZE);
  if (selectedVocabularies.length > 0) {
    url.searchParams.append("sabs", selectedVocabularies.join(","));
  }

  const displayUrl = new URL(url);
  displayUrl.searchParams.set("apiKey", "***");
  recentRequestContainer.innerHTML = colorizeUrl(displayUrl);
  updateDocLink(url);
  updateLocationHash(url);

  if (useCache && searchCache[cacheKey]) {
    await renderSearchResults(searchCache[cacheKey], returnIdType);
    return;
  }

  try {
    const signal = startRequest();
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal
    });
    const data = await response.json();
    searchCache[cacheKey] = data;
    await renderSearchResults(data, returnIdType);
  } catch (error) {
    if (error.name === 'AbortError') return;
    resultsContainer.textContent = "Error fetching data: " + error;
    infoTableBody.innerHTML = '<tr><td colspan="3">Error loading data.</td></tr>';
  } finally {
    // Do not scroll after search operations to preserve user position
  }
}

export async function fetchConceptDetails(cui, detailType = "", options = {}) {
  if (/^A\d{7}$/i.test(cui)) {
    return fetchAuiDetails(cui, detailType, options);
  }
  scrollRecentRequestIntoView();
  const { skipPushState = false } = options;
  const apiKey = document.getElementById("api-key").value.trim();
  const returnIdType = modalCurrentData.returnIdType ||
    document.getElementById("return-id-type").value;
  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const recentRequestContainer = document.getElementById("recent-request-output");
  const tableHead = document.querySelector("#info-table thead");

  const resultsHeading = document.getElementById("results-heading");
  if (resultsHeading) {
    resultsHeading.textContent = "";
    resultsHeading.classList.add("hidden");
  }
  const searchSummary = document.getElementById("search-summary");
  if (searchSummary) {
    searchSummary.textContent = "";
    searchSummary.classList.add("hidden");
  }

  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
  }

  let baseUrl;
  if (returnIdType === "code") {
    if (modalCurrentData.uri) {
      baseUrl = modalCurrentData.uri + (detailType ? "/" + detailType : "");
    } else if (modalCurrentData.sab) {
      baseUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${modalCurrentData.sab}/${cui}` + (detailType ? `/${detailType}` : "");
    } else {
      baseUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${cui}` + (detailType ? `/${detailType}` : "");
    }
  } else {
    baseUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/CUI/${cui}` + (detailType ? `/${detailType}` : "");
  }
  const apiUrlObj = new URL(baseUrl);
  apiUrlObj.searchParams.append("apiKey", apiKey);
  apiUrlObj.searchParams.append("pageSize", DEFAULT_PAGE_SIZE);

  const displayApiUrl = new URL(apiUrlObj);
  displayApiUrl.searchParams.set("apiKey", "***");
  recentRequestContainer.innerHTML = colorizeUrl(displayApiUrl);
  updateDocLink(apiUrlObj);

  const addressUrl = new URL(window.location.pathname, window.location.origin);
  addressUrl.searchParams.set("detail", detailType);
  addressUrl.searchParams.set("returnIdType", returnIdType);
  if (returnIdType === "code") {
    addressUrl.searchParams.set("code", stripBaseUrl(modalCurrentData.uri));
    if (modalCurrentData.sab) {
      addressUrl.searchParams.set("sab", modalCurrentData.sab);
    }
  } else {
    addressUrl.searchParams.set("cui", cui);
  }
  if (!skipPushState) {
    window.history.pushState({}, "", addressUrl.toString());
  }
  updateLocationHash(apiUrlObj);

  resultsContainer.textContent = detailType
    ? `Loading ${detailType} for ${cui}...`
    : `Loading details for ${cui}...`;
  if (detailType) {
    renderConceptSummary({ name: modalCurrentData.name, ui: cui, rootSource: modalCurrentData.sab }, detailType);
  }
    const loadingColspan =
      detailType === "relations" ? 5 :
        detailType === "definitions" ? 2 :
          detailType === "atoms" ? 5 :
            detailType === "atoms/preferred" ? 3 :
              detailType ? 3 : 2;
  infoTableBody.innerHTML = `<tr><td colspan="${loadingColspan}">Loading...</td></tr>`;

  try {
    const signal = startRequest();
    const response = await fetch(apiUrlObj, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${message}`);
    }
    const data = await response.json();

    resultsContainer.textContent = JSON.stringify(data, null, 2);

    const detailObj =
      data && typeof data.result === "object" && !Array.isArray(data.result)
        ? data.result
        : typeof data === "object"
          ? data
          : null;

    if (detailObj && detailObj.name) {
      modalCurrentData.name = detailObj.name;
    }
    if (detailType) {
      renderConceptSummary({
        name: (detailObj && detailObj.name) || modalCurrentData.name,
        ui: cui,
        rootSource: modalCurrentData.sab || (detailObj && detailObj.rootSource)
      }, detailType);
    } else {
      renderConceptSummary(detailObj && typeof detailObj === "object" ? detailObj : null);
    }

    infoTableBody.innerHTML = "";

    if (!detailType) {
      tableHead.innerHTML = `<tr><th>Key</th><th>Value</th></tr>`;
      if (!detailObj || typeof detailObj !== "object") {
        infoTableBody.innerHTML = `<tr><td colspan="2">No details found for this ${cui}.</td></tr>`;
        return;
      }

      Object.keys(detailObj).forEach(key => {
        const value = detailObj[key];
        // Previously we skipped fields with a value of "NONE". Now we include them
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        const tdValue = document.createElement("td");
        if (key === "semanticTypes" && Array.isArray(value)) {
          tdValue.innerHTML = "";
          value.forEach((st, idx) => {
            if (!st) return;
            const anchor = document.createElement("a");
            anchor.href = "#";
            const tuiMatch = (st.tui || (st.uri && st.uri.match(/TUI\/([^/]+)$/)));
            const tui = tuiMatch ? (Array.isArray(tuiMatch) ? tuiMatch[1] : tuiMatch) : "";
            anchor.textContent = `${st.name || st.tui || ""}${tui ? ` (${tui})` : ""}`.trim();
            anchor.addEventListener("click", function (e) {
              e.preventDefault();
              if (tui) fetchSemanticType(tui, { release: DEFAULT_SEMANTIC_NETWORK_RELEASE });
            });
            tdValue.appendChild(anchor);
            if (idx < value.length - 1) {
              tdValue.appendChild(document.createTextNode(", "));
            }
          });
        } else if (typeof value === "string" && value.startsWith("http")) {
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = value;
          link.addEventListener("click", function (e) {
            e.preventDefault();
            navigateToUmlsUrl(value, key);
          });
          tdValue.appendChild(link);
        } else if (typeof value === "string") {
          tdValue.textContent = value;
        } else {
          const pre = document.createElement("pre");
          pre.textContent = JSON.stringify(value, null, 2);
          tdValue.appendChild(pre);
        }
        tr.appendChild(tdKey);
        tr.appendChild(tdValue);
        infoTableBody.appendChild(tr);
      });

      // For overview details we don't render the list-style rows below,
      // so stop processing after the key/value pairs have been added.
      return;

    } else if (detailType === "sourceAtomClusters") {
      tableHead.innerHTML = `<tr><th>Key</th><th>Value</th></tr>`;
      if (!detailObj || typeof detailObj !== "object") {
        infoTableBody.innerHTML = `<tr><td colspan="2">No sourceAtomClusters found for this ${cui}.</td></tr>`;
        return;
      }

      Object.keys(detailObj).forEach(key => {
        if (/atomcount/i.test(key)) return;
        const value = detailObj[key];
        // Previously we skipped fields with a value of "NONE". Now we include them
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        const tdValue = document.createElement("td");
        if (typeof value === "string" && value.startsWith("http")) {
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = value;
          link.addEventListener("click", function (e) {
            e.preventDefault();
            navigateToUmlsUrl(value, key);
          });
          tdValue.appendChild(link);
        } else if (typeof value === "string") {
          tdValue.textContent = value;
        } else {
          const pre = document.createElement("pre");
          pre.textContent = JSON.stringify(value, null, 2);
          tdValue.appendChild(pre);
        }
        tr.appendChild(tdKey);
        tr.appendChild(tdValue);
        infoTableBody.appendChild(tr);
      });

      // Skip additional list-style rows for sourceAtomClusters
      return;

    } else if (detailType === "atoms/preferred") {
      tableHead.innerHTML = `<tr><th>UI</th><th>Name</th><th>CUI</th></tr>`;
      } else if (detailType === "atoms") {
        tableHead.innerHTML = `<tr><th>AUI</th><th>Atom</th><th>Term Type</th><th>Root Source</th><th>Code</th></tr>`;
    } else if (detailType === "definitions") {
      tableHead.innerHTML = `<tr><th>Definition</th><th>Root Source</th></tr>`;
    } else if (detailType === "attributes") {
      tableHead.innerHTML = `<tr><th>Name</th><th>Value</th><th>Root Source</th></tr>`;
    } else if (detailType === "parents") {
      tableHead.innerHTML = `<tr><th>UI</th><th>Name</th><th>Root Source</th></tr>`;
    } else if (detailType === "relations") {
      tableHead.innerHTML = `<tr>
          <th>Source Name</th>
          <th>Relation Label</th>
          <th>Additional Relation Label</th>
          <th>Target Name</th>
          <th>Root Source</th>
        </tr>`;
    }

    let detailArray = [];
    if (Array.isArray(data.result)) {
      detailArray = data.result;
    } else if (data.result && Array.isArray(data.result.results)) {
      detailArray = data.result.results;
    } else if (detailType && data.result && Array.isArray(data.result[detailType])) {
      detailArray = data.result[detailType];
    } else if (data.result && typeof data.result === "object") {
      // Some endpoints (e.g., atoms/preferred) return a single object
      // instead of an array; normalize to an array for processing
      detailArray = [data.result];
    }
    await loadMRRank();
    let sortedDetails = sortByMRRank(detailArray);
    if (detailType === "relations") {
      sortedDetails = sortByAdditionalRelationLabel(sortedDetails);
    }
    if (!Array.isArray(sortedDetails) || sortedDetails.length === 0) {
        const emptyColspan =
          detailType === "relations" ? 5 :
            detailType === "definitions" ? 2 :
              detailType === "atoms" ? 5 :
                detailType === "atoms/preferred" ? 3 : 3;
      infoTableBody.innerHTML = `<tr><td colspan="${emptyColspan}">No ${detailType} found for this ${cui}.</td></tr>`;
      return;
    }

      if (detailType === "atoms") {
        sortedDetails.forEach((atom, index) => {
          const tr = document.createElement("tr");

          const colAui = document.createElement("td");
          if (atom.ui) {
            const link = document.createElement("a");
            link.href = "#";
            link.textContent = atom.ui;
            link.addEventListener("click", function (e) {
              e.preventDefault();
              navigateToUmlsUrl(`https://uts-ws.nlm.nih.gov/rest/content/current/AUI/${atom.ui}`, "aui");
            });
            colAui.appendChild(link);
          } else {
            colAui.textContent = "";
          }
          tr.appendChild(colAui);

          const col1 = document.createElement("td");
          col1.textContent = atom.name || `(Atom #${index + 1})`;
          tr.appendChild(col1);
          const col2 = document.createElement("td");
          col2.textContent = atom.termType || "";
          tr.appendChild(col2);
          const col3 = document.createElement("td");
          col3.textContent = atom.rootSource || "(no rootSource)";
          tr.appendChild(col3);
          const col4 = document.createElement("td");
        if (atom.code) {
          const codeText = stripBaseUrl(atom.code);
          if (!isNoCode(codeText)) {
            const link = document.createElement("a");
            link.href = "#";
            link.textContent = codeText;
            link.addEventListener("click", function (e) {
              e.preventDefault();
              navigateToUmlsUrl(atom.code, "code");
            });
            col4.appendChild(link);
          } else {
            col4.textContent = codeText;
          }
        } else {
          col4.textContent = "";
        }
        tr.appendChild(col4);
        infoTableBody.appendChild(tr);
      });
    } else if (detailType === "atoms/preferred") {
      sortedDetails.forEach((atom) => {
        const tr = document.createElement("tr");
        const col1 = document.createElement("td");
        col1.textContent = atom.ui || "";
        tr.appendChild(col1);
        const col2 = document.createElement("td");
        col2.textContent = atom.name || "";
        tr.appendChild(col2);
        const col3 = document.createElement("td");
        const cui = extractCui(atom.concept) || atom.cui || "";
        col3.textContent = cui;
        if (cui) {
          col3.style.color = "blue";
          col3.style.textDecoration = "underline";
          col3.style.cursor = "pointer";
          col3.addEventListener("click", () => {
            modalCurrentData.sab = null;
            modalCurrentData.ui = cui;
            modalCurrentData.uri = null;
            modalCurrentData.returnIdType = "concept";
            fetchConceptDetails(cui, "");
          });
        }
        tr.appendChild(col3);
        infoTableBody.appendChild(tr);
      });
    } else if (detailType === "definitions") {
      sortedDetails.forEach((definition, index) => {
        const tr = document.createElement("tr");
        const col1 = document.createElement("td");
        col1.textContent = definition.value || `(Definition #${index + 1})`;
        tr.appendChild(col1);
        const col2 = document.createElement("td");
        col2.textContent = definition.rootSource || "(no rootSource)";
        tr.appendChild(col2);
        infoTableBody.appendChild(tr);
      });
    } else if (detailType === "attributes") {
      sortedDetails.forEach((attr, index) => {
        const tr = document.createElement("tr");
        const col1 = document.createElement("td");
        col1.textContent = attr.attributeName || attr.name || `(Attribute #${index + 1})`;
        tr.appendChild(col1);
        const col2 = document.createElement("td");
        col2.textContent = attr.value || attr.attributeValue || "";
        tr.appendChild(col2);
        const col3 = document.createElement("td");
        col3.textContent = attr.rootSource || "(no rootSource)";
        tr.appendChild(col3);
        infoTableBody.appendChild(tr);
      });
    } else if (detailType === "parents") {
      sortedDetails.forEach((parent) => {
        const tr = document.createElement("tr");
        const col1 = document.createElement("td");
        col1.style.color = "blue";
        col1.style.textDecoration = "underline";
        col1.style.cursor = "pointer";
        col1.textContent = parent.ui || "";
        col1.addEventListener("click", () => {
          modalCurrentData.ui = parent.ui;
          modalCurrentData.name = parent.name || null;
          if (returnIdType === "code") {
            modalCurrentData.sab = parent.rootSource;
            modalCurrentData.uri = parent.uri || null;
            modalCurrentData.returnIdType = "code";
          } else {
            modalCurrentData.sab = null;
            modalCurrentData.uri = null;
            modalCurrentData.returnIdType = "concept";
          }
          fetchConceptDetails(parent.ui, "");
        });
        tr.appendChild(col1);
        const col2 = document.createElement("td");
        col2.textContent = parent.name || "";
        tr.appendChild(col2);
        const col3 = document.createElement("td");
        col3.textContent = parent.rootSource || "";
        tr.appendChild(col3);
        infoTableBody.appendChild(tr);
      });
    } else if (detailType === "relations") {
      sortedDetails.forEach((relation) => {
        const tr = document.createElement("tr");

        const col1 = document.createElement("td");
        const fromNameFallback = !relation.relatedFromIdName;
        const fromId = relation.relatedFromId || modalCurrentData.ui;
        const fromIsNoCode = isNoCode(fromId);
        col1.textContent = relation.relatedFromIdName || modalCurrentData.name || "(no relatedFromIdName)";
        if (!fromIsNoCode || fromNameFallback) {
          col1.style.color = "blue";
          col1.style.textDecoration = "underline";
          col1.style.cursor = "pointer";
          col1.addEventListener("click", function () {
            if (fromNameFallback) {
              fetchConceptDetails(modalCurrentData.ui, "");
            } else {
              if (returnIdType === "code") {
                fetchRelatedDetail(fromId, "from", relation.rootSource);
              } else {
                fetchRelatedDetail(fromId, "from");
              }
            }
          });
        }
        tr.appendChild(col1);

        const col2 = document.createElement("td");
        col2.textContent = relation.relationLabel || "-";
        tr.appendChild(col2);

        const col3 = document.createElement("td");
        col3.textContent = relation.additionalRelationLabel || "-";
        tr.appendChild(col3);

        const col4 = document.createElement("td");
        const targetIsNoCode = isNoCode(relation.relatedId);
        col4.textContent = relation.relatedIdName || "(no relatedIdName)";
        if (!targetIsNoCode) {
          col4.style.color = "blue";
          col4.style.textDecoration = "underline";
          col4.style.cursor = "pointer";
          col4.addEventListener("click", function () {
            if (returnIdType === "code") {
              fetchRelatedDetail(relation.relatedId, "to", relation.rootSource);
            } else {
              fetchRelatedDetail(relation.relatedId, "to");
            }
          });
        }
        tr.appendChild(col4);

        const col5 = document.createElement("td");
        col5.textContent = relation.rootSource || "(no rootSource)";
        tr.appendChild(col5);

        infoTableBody.appendChild(tr);
      });
    } else if (["parents", "children", "ancestors", "descendants"].includes(detailType)) {
      tableHead.innerHTML = `<tr><th>UI</th><th>Name</th><th>Root Source</th></tr>`;
      sortedDetails.forEach((item) => {
        const tr = document.createElement("tr");
        const col1 = document.createElement("td");
        col1.textContent = item.ui || "N/A";
        if (item.ui && !isNoCode(item.ui)) {
          col1.style.color = "blue";
          col1.style.textDecoration = "underline";
          col1.style.cursor = "pointer";
          col1.addEventListener("click", function () {
            modalCurrentData.ui = item.ui;
            modalCurrentData.name = item.name || null;
            if (item.rootSource) {
              modalCurrentData.sab = item.rootSource;
              modalCurrentData.uri = null;
              modalCurrentData.returnIdType = "code";
            } else {
              modalCurrentData.sab = null;
              modalCurrentData.uri = null;
              modalCurrentData.returnIdType = "concept";
            }
            fetchConceptDetails(item.ui, "");
          });
        }
        tr.appendChild(col1);

        const col2 = document.createElement("td");
        col2.textContent = item.name || "N/A";
        tr.appendChild(col2);

        const col3 = document.createElement("td");
        col3.textContent = item.rootSource || "(no rootSource)";
        tr.appendChild(col3);

        infoTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    resultsContainer.textContent = `Error fetching ${detailType}: ${error}`;
      const errorColspan =
        detailType === "relations" ? 5 :
          detailType === "definitions" ? 2 :
            detailType === "atoms" ? 5 :
              detailType === "atoms/preferred" ? 3 : 3;
    infoTableBody.innerHTML = `<tr><td colspan="${errorColspan}">Error loading ${detailType}.</td></tr>`;
  } finally {
    scrollRecentRequestIntoView();
  }
}

export async function fetchAuiDetails(aui, detailType = "", options = {}) {
  scrollRecentRequestIntoView();
  const { skipPushState = false } = options;
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
  }

  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const recentRequestContainer = document.getElementById("recent-request-output");
  const tableHead = document.querySelector("#info-table thead");

  const resultsHeading = document.getElementById("results-heading");
  if (resultsHeading) {
    resultsHeading.textContent = "";
    resultsHeading.classList.add("hidden");
  }
  const searchSummary = document.getElementById("search-summary");
  if (searchSummary) {
    searchSummary.textContent = "";
    searchSummary.classList.add("hidden");
  }
  const returnIdType = modalCurrentData.returnIdType || "aui";

  const baseUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/AUI/${aui}` + (detailType ? `/${detailType}` : "");
  const apiUrlObj = new URL(baseUrl);
  apiUrlObj.searchParams.append("apiKey", apiKey);
  apiUrlObj.searchParams.append("pageSize", DEFAULT_PAGE_SIZE);

  const displayApiUrl = new URL(apiUrlObj);
  displayApiUrl.searchParams.set("apiKey", "***");
  recentRequestContainer.innerHTML = colorizeUrl(displayApiUrl);
  updateDocLink(apiUrlObj);

  const addressUrl = new URL(window.location.pathname, window.location.origin);
  addressUrl.searchParams.set("aui", aui);
  addressUrl.searchParams.set("detail", detailType);
  if (!skipPushState) {
    window.history.pushState({}, "", addressUrl.toString());
  }
  updateLocationHash(apiUrlObj);

  resultsContainer.textContent = detailType
    ? `Loading ${detailType} for ${aui}...`
    : `Loading details for ${aui}...`;
  const loadingColspan = detailType === "relations" ? 5 : 2;
  infoTableBody.innerHTML = `<tr><td colspan="${loadingColspan}">Loading...</td></tr>`;
  tableHead.innerHTML = `<tr><th>Key</th><th>Value</th></tr>`;

  try {
    const response = await fetch(apiUrlObj, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${message}`);
    }
    const data = await response.json();
    resultsContainer.textContent = JSON.stringify(data, null, 2);

    const detailObj =
      data && typeof data.result === "object" && !Array.isArray(data.result)
        ? data.result
        : typeof data === "object"
          ? data
          : null;

    if (detailObj && detailObj.name) {
      modalCurrentData.name = detailObj.name;
    }
  renderConceptSummary({
      name: (detailObj && detailObj.name) || modalCurrentData.name,
      ui: aui,
      rootSource: modalCurrentData.sab || (detailObj && detailObj.rootSource)
    }, detailType);

    infoTableBody.innerHTML = "";
    if (detailType === "relations") {
      tableHead.innerHTML = `<tr>
          <th>Source Name</th>
          <th>Relation Label</th>
          <th>Additional Relation Label</th>
          <th>Target Name</th>
          <th>Root Source</th>
        </tr>`;

      let detailArray = [];
      if (Array.isArray(data.result)) {
        detailArray = data.result;
      } else if (data.result && Array.isArray(data.result.results)) {
        detailArray = data.result.results;
      } else if (data.result && Array.isArray(data.result[detailType])) {
        detailArray = data.result[detailType];
      }

      await loadMRRank();
      let sortedDetails = sortByMRRank(detailArray);
      sortedDetails = sortByAdditionalRelationLabel(sortedDetails);

      if (!Array.isArray(sortedDetails) || sortedDetails.length === 0) {
        infoTableBody.innerHTML = `<tr><td colspan="5">No relations found for this ${aui}.</td></tr>`;
        return;
      }

      sortedDetails.forEach((relation) => {
        const tr = document.createElement("tr");

        const col1 = document.createElement("td");
        const fromNameFallback = !relation.relatedFromIdName;
        const fromId = relation.relatedFromId || aui;
        const fromIsNoCode = isNoCode(fromId);
        col1.textContent = relation.relatedFromIdName || modalCurrentData.name || "(no relatedFromIdName)";
        if (!fromIsNoCode || fromNameFallback) {
          col1.style.color = "blue";
          col1.style.textDecoration = "underline";
          col1.style.cursor = "pointer";
          col1.addEventListener("click", function () {
            if (fromNameFallback) {
              fetchAuiDetails(aui, "", { skipPushState: false });
            } else {
              fetchRelatedDetail(fromId, "from");
            }
          });
        }
        tr.appendChild(col1);

        const col2 = document.createElement("td");
        col2.textContent = relation.relationLabel || "-";
        tr.appendChild(col2);

        const col3 = document.createElement("td");
        col3.textContent = relation.additionalRelationLabel || "-";
        tr.appendChild(col3);

        const col4 = document.createElement("td");
        const targetIsNoCode = isNoCode(relation.relatedId);
        col4.textContent = relation.relatedIdName || "(no relatedIdName)";
        if (!targetIsNoCode) {
          col4.style.color = "blue";
          col4.style.textDecoration = "underline";
          col4.style.cursor = "pointer";
          col4.addEventListener("click", function () {
            fetchRelatedDetail(relation.relatedId, "to");
          });
        }
        tr.appendChild(col4);

        const col5 = document.createElement("td");
        col5.textContent = relation.rootSource || "(no rootSource)";
        tr.appendChild(col5);

      infoTableBody.appendChild(tr);
    });
      return;
    } else if (detailType === "attributes") {
      tableHead.innerHTML = `<tr><th>Name</th><th>Value</th><th>Root Source</th></tr>`;
      let detailArray = [];
      if (Array.isArray(data.result)) {
        detailArray = data.result;
      } else if (data.result && Array.isArray(data.result.results)) {
        detailArray = data.result.results;
      } else if (data.result && Array.isArray(data.result[detailType])) {
        detailArray = data.result[detailType];
      }

      await loadMRRank();
      let sortedDetails = sortByMRRank(detailArray);
      if (!Array.isArray(sortedDetails) || sortedDetails.length === 0) {
        infoTableBody.innerHTML = `<tr><td colspan="3">No attributes found for this ${aui}.</td></tr>`;
        return;
      }

      sortedDetails.forEach((attr, index) => {
        const tr = document.createElement("tr");
        const col1 = document.createElement("td");
        col1.textContent = attr.attributeName || attr.name || `(Attribute #${index + 1})`;
        tr.appendChild(col1);
        const col2 = document.createElement("td");
        col2.textContent = attr.value || attr.attributeValue || "";
        tr.appendChild(col2);
        const col3 = document.createElement("td");
        col3.textContent = attr.rootSource || "(no rootSource)";
        tr.appendChild(col3);
        infoTableBody.appendChild(tr);
      });
      return;
    }

    if (detailObj && typeof detailObj === "object") {
      Object.keys(detailObj).forEach(key => {
        const value = detailObj[key];
        // Previously we skipped fields with a value of "NONE". Now we include them
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        const tdValue = document.createElement("td");
        if (typeof value === "string" && value.startsWith("http")) {
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = value;
          link.addEventListener("click", function (e) {
            e.preventDefault();
            navigateToUmlsUrl(value, key);
          });
          tdValue.appendChild(link);
        } else if (typeof value === "string") {
          tdValue.textContent = value;
        } else {
          const pre = document.createElement("pre");
          pre.textContent = JSON.stringify(value, null, 2);
          tdValue.appendChild(pre);
        }
        tr.appendChild(tdKey);
        tr.appendChild(tdValue);
        infoTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    resultsContainer.textContent = `Error fetching ${detailType || "details"}: ${error}`;
    const errorColspan = detailType === "relations" ? 5 : 2;
    infoTableBody.innerHTML = `<tr><td colspan="${errorColspan}">Error loading ${detailType || "details"}.</td></tr>`;
  } finally {
    scrollRecentRequestIntoView();
  }
}

export async function fetchRelatedDetail(apiUrl, relatedType, rootSource, options = {}) {
  scrollRecentRequestIntoView();
  const { skipPushState = false } = options;
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
  }

  // If a bare UI/code is passed in, construct the full URL
  let isAui = /^A\d{7}$/i.test(stripBaseUrl(apiUrl));
  if (!/^https?:\/\//i.test(apiUrl)) {
    if (rootSource && !isAui) {
      apiUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${rootSource}/${apiUrl}`;
    } else if (isAui) {
      apiUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/AUI/${apiUrl}`;
    } else {
      apiUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/CUI/${apiUrl}`;
    }
  } else {
    const parsed = parseUmlsUrl(apiUrl);
    if (parsed && parsed.type === "aui") {
      isAui = true;
    }
  }

  if (isAui) {
    rootSource = undefined;
  }

  let urlObj = new URL(apiUrl);
  urlObj.searchParams.append("apiKey", apiKey);
  urlObj.searchParams.append("pageSize", DEFAULT_PAGE_SIZE);

  // Update modalCurrentData based on the resolved URL so that headers
  // reflect the correct UI/code when viewing related details
  const parsedForModal = parseUmlsUrl(urlObj.href);
  if (parsedForModal) {
    let baseParts = urlObj.pathname.split("/");
    if (parsedForModal.detail) {
      baseParts.splice(-parsedForModal.detail.split("/").length, parsedForModal.detail.split("/").length);
    }
    const basePath = urlObj.origin + baseParts.join("/");

    if (parsedForModal.type === "code") {
      modalCurrentData.ui = parsedForModal.code;
      modalCurrentData.sab = parsedForModal.sab;
      modalCurrentData.uri = basePath;
      modalCurrentData.returnIdType = "code";
    } else if (parsedForModal.type === "concept") {
      modalCurrentData.ui = parsedForModal.cui;
      modalCurrentData.sab = null;
      modalCurrentData.uri = basePath;
      modalCurrentData.returnIdType = "concept";
    } else if (parsedForModal.type === "aui") {
      modalCurrentData.ui = parsedForModal.aui;
      modalCurrentData.sab = null;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = "aui";
    }
  }

  let displayUrlObj = new URL(urlObj);
  displayUrlObj.searchParams.set("apiKey", "***");
  document.getElementById("recent-request-output").innerHTML = colorizeUrl(displayUrlObj);
  updateDocLink(urlObj);

  const currentUrl = new URL(window.location.pathname, window.location.origin);
  currentUrl.searchParams.set("related", relatedType);
  currentUrl.searchParams.set("relatedId", stripBaseUrl(apiUrl));
  if (rootSource) {
    currentUrl.searchParams.set("sab", rootSource);
  }
  if (!skipPushState) {
    window.history.pushState({}, "", currentUrl.toString());
  }
  updateLocationHash(urlObj);

  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const tableHead = document.querySelector("#info-table thead");

  const resultsHeading = document.getElementById("results-heading");
  if (resultsHeading) {
    resultsHeading.textContent = "";
    resultsHeading.classList.add("hidden");
  }
  const searchSummary = document.getElementById("search-summary");
  if (searchSummary) {
    searchSummary.textContent = "";
    searchSummary.classList.add("hidden");
  }

  resultsContainer.textContent = `Loading related ${relatedType} information...`;
  infoTableBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
  tableHead.innerHTML = `<tr><th>Key</th><th>Value</th></tr>`;

  try {
    const signal = startRequest();
    const response = await fetch(urlObj, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${message}`);
    }
    const data = await response.json();
    resultsContainer.textContent = JSON.stringify(data, null, 2);

    const detailObj =
      data && typeof data.result === "object" && !Array.isArray(data.result)
        ? data.result
        : typeof data === "object"
          ? data
          : null;

    if (detailObj && detailObj.name) {
      modalCurrentData.name = detailObj.name;
    }
    renderConceptSummary({
      name: (detailObj && detailObj.name) || modalCurrentData.name,
      ui: modalCurrentData.ui,
      rootSource: modalCurrentData.sab || (detailObj && detailObj.rootSource)
    }, relatedType);

    infoTableBody.innerHTML = "";

    if (detailObj && typeof detailObj === "object") {
      Object.keys(detailObj).forEach((key) => {
        const value = detailObj[key];

        // Fields with a value of "NONE" are now displayed

        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        const tdValue = document.createElement("td");

        // Link URL values back into the app
        if (typeof value === "string" && value.startsWith("http")) {
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = value;
          link.addEventListener("click", function (e) {
            e.preventDefault();
            navigateToUmlsUrl(value, key);
          });
          tdValue.appendChild(link);
        } else if (typeof value === "string") {
          tdValue.textContent = value;
        } else {
          const pre = document.createElement("pre");
          pre.textContent = JSON.stringify(value, null, 2);
          tdValue.appendChild(pre);
        }

        tr.appendChild(tdKey);
        tr.appendChild(tdValue);
        infoTableBody.appendChild(tr);
      });
    }

  } catch (error) {
    if (error.name === 'AbortError') return;
    resultsContainer.textContent = `Error fetching related ${relatedType}: ${error}`;
    infoTableBody.innerHTML = `<tr><td colspan="2">Error loading related ${relatedType}.</td></tr>`;
  } finally {
    scrollRecentRequestIntoView();
  }
};

export async function fetchCuisForCode(code, sab) {
  scrollRecentRequestIntoView();
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
  }

  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const recentRequestContainer = document.getElementById("recent-request-output");
  const tableHead = document.querySelector("#info-table thead");
  const infoTable = document.getElementById("info-table");
  const noResultsMessage = document.getElementById("no-results-message");

  const resultsHeading = document.getElementById("results-heading");
  if (resultsHeading) {
    resultsHeading.textContent = `Results: "${code}"`;
    resultsHeading.classList.remove("hidden");
  }
  const searchSummary = document.getElementById("search-summary");
  if (searchSummary) {
    searchSummary.textContent = "";
    searchSummary.classList.add("hidden");
  }

  const url = new URL(`https://uts-ws.nlm.nih.gov/rest/search/${searchRelease}`);
  url.searchParams.append("string", code);
  url.searchParams.append("inputType", "sourceUi");
  url.searchParams.append("searchType", "exact");
  url.searchParams.append("returnIdType", "concept");
  url.searchParams.append("apiKey", apiKey);
  url.searchParams.append("pageSize", DEFAULT_PAGE_SIZE);
  if (sab) {
    url.searchParams.append("sabs", sab);
  }

  const displayUrl = new URL(url);
  displayUrl.searchParams.set("apiKey", "***");
  recentRequestContainer.innerHTML = colorizeUrl(displayUrl);

  const addressUrl = new URL(window.location.pathname, window.location.origin);
  addressUrl.searchParams.set("string", code);
  addressUrl.searchParams.set("inputType", "sourceUi");
  addressUrl.searchParams.set("searchType", "exact");
  addressUrl.searchParams.set("returnIdType", "concept");
  if (sab) {
    addressUrl.searchParams.set("sabs", sab);
  }
  window.history.pushState({}, "", addressUrl.toString());

  resultsContainer.textContent = `Loading CUIs for ${code}...`;
  tableHead.innerHTML = `<tr><th>UI</th><th>Name</th></tr>`;
  infoTableBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
  if (infoTable) infoTable.style.display = "";
  if (noResultsMessage) noResultsMessage.classList.add("hidden");

  try {
    const signal = startRequest();
    const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal });
    const data = await response.json();
    resultsContainer.textContent = JSON.stringify(data, null, 2);

    infoTableBody.innerHTML = "";
    const results = data.result && data.result.results ? data.result.results : [];
    await loadMRRank();
    const sortedResults = sortByMRRank(results);
    if (sortedResults.length === 0) {
      if (infoTable) infoTable.style.display = "none";
      if (noResultsMessage) noResultsMessage.classList.remove("hidden");
      return;
    }
    sortedResults.forEach(item => {
      const tr = document.createElement("tr");
      const uiTd = document.createElement("td");
      uiTd.textContent = item.ui || "N/A";
      if (item.ui && !isNoCode(item.ui)) {
        uiTd.style.color = "blue";
        uiTd.style.textDecoration = "underline";
        uiTd.style.cursor = "pointer";
        uiTd.addEventListener("click", () => {
          modalCurrentData.ui = item.ui;
          modalCurrentData.name = item.name || null;
          modalCurrentData.sab = null;
          modalCurrentData.uri = null;
          modalCurrentData.returnIdType = "concept";
          fetchConceptDetails(item.ui, "");
        });
      }
      tr.appendChild(uiTd);

      const nameTd = document.createElement("td");
      nameTd.textContent = item.name || "N/A";
      tr.appendChild(nameTd);

      infoTableBody.appendChild(tr);
    });
  } catch (error) {
    if (error.name === 'AbortError') return;
    resultsContainer.textContent = `Error fetching CUIs: ${error}`;
    infoTableBody.innerHTML = '<tr><td colspan="2">Error loading CUIs.</td></tr>';
  } finally {
    scrollRecentRequestIntoView();
  }
}

export async function fetchSemanticType(tui, options = {}) {
  scrollRecentRequestIntoView();
  renderConceptSummary(null);
  const { skipPushState = false, release = DEFAULT_SEMANTIC_NETWORK_RELEASE } = options;
  modalCurrentData.returnIdType = "semanticType";
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
  }

  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const recentRequestContainer = document.getElementById("recent-request-output");
  const tableHead = document.querySelector("#info-table thead");

  const resultsHeading = document.getElementById("results-heading");
  if (resultsHeading) {
    resultsHeading.textContent = "";
    resultsHeading.classList.add("hidden");
  }
  const searchSummary = document.getElementById("search-summary");
  if (searchSummary) {
    searchSummary.textContent = "";
    searchSummary.classList.add("hidden");
  }
  const baseUrl = `https://uts-ws.nlm.nih.gov/rest/semantic-network/${release}/TUI/${tui}`;
  const apiUrlObj = new URL(baseUrl);
  apiUrlObj.searchParams.append("apiKey", apiKey);
  apiUrlObj.searchParams.append("pageSize", DEFAULT_PAGE_SIZE);

  const displayApiUrl = new URL(apiUrlObj);
  displayApiUrl.searchParams.set("apiKey", "***");
  recentRequestContainer.innerHTML = colorizeUrl(displayApiUrl);
  updateDocLink(apiUrlObj);

  const addressUrl = new URL(window.location.pathname, window.location.origin);
  addressUrl.searchParams.set("tui", tui);
  addressUrl.searchParams.set("semanticRelease", release);
  if (!skipPushState) {
    window.history.pushState({}, "", addressUrl.toString());
  }
  updateLocationHash(apiUrlObj);

  resultsContainer.textContent = `Loading semantic type ${tui}...`;
  infoTableBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
  tableHead.innerHTML = `<tr><th>Key</th><th>Value</th></tr>`;

  try {
    const signal = startRequest();
    const response = await fetch(apiUrlObj, { method: "GET", headers: { Accept: "application/json" }, signal });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${message}`);
    }
    const data = await response.json();
    resultsContainer.textContent = JSON.stringify(data, null, 2);

    const detailObj = data && typeof data.result === "object" && !Array.isArray(data.result)
      ? data.result
      : typeof data === "object"
        ? data
        : null;

    if (detailObj && typeof detailObj === "object") {
      modalCurrentData.name = detailObj.name || null;
      renderConceptSummary({ name: modalCurrentData.name, ui: tui });
    }

    infoTableBody.innerHTML = "";

    if (detailObj && typeof detailObj === "object") {
      Object.keys(detailObj).forEach(key => {
        const value = detailObj[key];
        // Previously we skipped fields with a value of "NONE". Now we include them
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        const tdValue = document.createElement("td");
        if (typeof value === "string" && value.startsWith("http")) {
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = value;
          link.addEventListener("click", function (e) {
            e.preventDefault();
            navigateToUmlsUrl(value, key);
          });
          tdValue.appendChild(link);
        } else if (typeof value === "string") {
          tdValue.textContent = value;
        } else {
          const pre = document.createElement("pre");
          pre.textContent = JSON.stringify(value, null, 2);
          tdValue.appendChild(pre);
        }
        tr.appendChild(tdKey);
        tr.appendChild(tdValue);
        infoTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    resultsContainer.textContent = `Error fetching semantic type: ${error}`;
    infoTableBody.innerHTML = '<tr><td colspan="2">Error loading semantic type.</td></tr>';
  } finally {
    scrollRecentRequestIntoView();
  }
}
