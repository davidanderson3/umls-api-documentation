const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_SEMANTIC_NETWORK_RELEASE = "2025AA";
let searchRelease = "current";
let modalCurrentData = {
  ui: null,
  sab: null,
  name: null,
  uri: null,
  returnIdType: "concept"
};

// Parsed MRRANK data will be stored here
let mrrankData =
  typeof window !== "undefined" && window.preloadedMRRankData
    ? window.preloadedMRRankData
    : { bySab: {}, bySabTty: {} };

// Initialize or fetch MRRANK data if not already loaded
async function loadMRRank() {
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

function scrollRecentRequestIntoView() {
  const recent = document.getElementById("recent-request");
  if (recent) {
    recent.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function collapseRawDataDetails() {
  const raw = document.getElementById("raw-data-details");
  if (raw && raw.hasAttribute("open")) {
    raw.removeAttribute("open");
  }
}

function getMRRank(sab, tty) {
  if (!sab) return -1;
  if (tty && mrrankData.bySabTty[sab] && mrrankData.bySabTty[sab][tty] !== undefined) {
    return mrrankData.bySabTty[sab][tty];
  }
  if (mrrankData.bySab[sab] !== undefined) {
    return mrrankData.bySab[sab];
  }
  return -1;
}

function sortByMRRank(arr, sabKey = 'rootSource', ttyKey = 'termType') {
  if (!Array.isArray(arr)) return arr;
  return arr
    .slice()
    .sort((a, b) => getMRRank(b[sabKey], b[ttyKey]) - getMRRank(a[sabKey], a[ttyKey]));
}

// Sort array alphabetically by additionalRelationLabel
function sortByAdditionalRelationLabel(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr
    .slice()
    .sort((a, b) => {
      const aLabel = a.additionalRelationLabel || '';
      const bLabel = b.additionalRelationLabel || '';
      return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
    });
}

function extractCui(concept) {
  if (!concept) return "";
  if (typeof concept === "string") {
    const m = concept.match(/\/CUI\/([^/]+)/);
    return m ? m[1] : concept;
  }
  if (typeof concept === "object" && concept.ui) {
    return concept.ui;
  }
  return "";
}

function renderConceptSummary(concept, detailType = "") {
  const summary = document.getElementById("concept-summary");
  if (!summary) return;
  if (!concept || typeof concept !== "object") {
    summary.classList.add("hidden");
    summary.innerHTML = "";
    return;
  }

  summary.innerHTML = "";
  const header = document.createElement("h2");
  const name = concept.name || modalCurrentData.name || "";
  const ui = concept.ui || modalCurrentData.ui || "";
  let headerText = name ? `${name} (${ui})` : ui;
  const source = concept.rootSource || modalCurrentData.sab;
  if (source) {
    headerText += ` - ${source} code`;
  }
  if (detailType) {
    headerText += ` ${detailType}`;
  }
  header.textContent = headerText.trim();
  summary.appendChild(header);

  // The detailed table already includes these values so we omit them from the
  // summary to avoid repeating information.

  summary.classList.remove("hidden");
}

const searchCache = {};

async function renderSearchResults(data, returnIdType) {
  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const tableHead = document.querySelector("#info-table thead");
  const resultsHeading = document.getElementById("results-heading");
  const infoTable = document.getElementById("info-table");
  const noResultsMessage = document.getElementById("no-results-message");

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
  infoTableBody.innerHTML = "";

  const results = data.result && data.result.results ? data.result.results : [];
  await loadMRRank();
  const sortedResults = sortByMRRank(results);

  if (sortedResults.length === 0) {
    if (infoTable) infoTable.style.display = "none";
    if (noResultsMessage) noResultsMessage.classList.remove("hidden");
    return;
  }

  if (infoTable) infoTable.style.display = "";
  if (noResultsMessage) noResultsMessage.classList.add("hidden");

  sortedResults.forEach(item => {
    const tr = document.createElement("tr");

    const uiTd = document.createElement("td");
    uiTd.style.color = "blue";
    uiTd.style.textDecoration = "underline";
    uiTd.style.cursor = "pointer";
    uiTd.textContent = item.ui || "N/A";
    uiTd.addEventListener("click", () => {
      modalCurrentData.ui = item.ui;
      modalCurrentData.name = item.name || null;
        if (returnIdType === "code") {
          modalCurrentData.sab = item.rootSource;
          modalCurrentData.uri = item.uri
            ? item.uri.replace(/\/code$/, "")
            : null;
          modalCurrentData.returnIdType = "code";
        } else {
        modalCurrentData.sab = null;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = "concept";
      }
      fetchConceptDetails(item.ui, "");
    });
    tr.appendChild(uiTd);

    const nameTd = document.createElement("td");
    nameTd.textContent = item.name || "N/A";
    tr.appendChild(nameTd);

    const rootSourceHeader = document.getElementById("root-source-header");
    if (rootSourceHeader.style.display !== "none") {
      const rootSourceTd = document.createElement("td");
      rootSourceTd.textContent = item.rootSource || "N/A";
      tr.appendChild(rootSourceTd);
    }
    infoTableBody.appendChild(tr);
  });
}

async function searchUMLS(options = {}) {
  scrollRecentRequestIntoView();
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
      resultsHeading.textContent = `Results for "${searchString}"`;
      resultsHeading.classList.remove("hidden");
    } else {
      resultsHeading.textContent = "";
      resultsHeading.classList.add("hidden");
    }
  }
  if (searchSummary) {
    if (searchString) {
      searchSummary.textContent = `Searched for "${searchString}"`;
      searchSummary.classList.remove("hidden");
    } else {
      searchSummary.textContent = "";
      searchSummary.classList.add("hidden");
    }
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
        <th id="root-source-header"${
          returnIdType === "code" ? "" : " style=\"display: none;\""
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
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const data = await response.json();
    searchCache[cacheKey] = data;
    await renderSearchResults(data, returnIdType);
  } catch (error) {
    resultsContainer.textContent = "Error fetching data: " + error;
    infoTableBody.innerHTML = '<tr><td colspan="3">Error loading data.</td></tr>';
  } finally {
    scrollRecentRequestIntoView();
  }
}

function colorizeUrl(urlObject) {
  const base = urlObject.origin + urlObject.pathname;
  let colorized = `<span style="color:blue">${base}</span>`;
  const params = [];
  for (let [key, value] of urlObject.searchParams.entries()) {
    params.push(
      `<span style="color:green">${encodeURIComponent(key)}</span>=<span style="color:red">${encodeURIComponent(value)}</span>`
    );
  }
  if (params.length > 0) {
    colorized += `?${params.join("&")}`;
  }
  return colorized;
}

function updateLocationHash(urlObject) {
  if (!urlObject || !urlObject.pathname) return;
  const cleanPath = urlObject.pathname.replace(/^\/rest\/?/, "");
  const newUrl = new URL(window.location.href);
  newUrl.hash = cleanPath ? cleanPath : "";
  // replaceState avoids triggering a popstate event, preventing recursion
  history.replaceState(history.state, "", newUrl);
}

function updateDocLink(urlObject) {
  const docLink = document.getElementById("recent-doc-link");
  if (!docLink || !urlObject) return;

  const pathParts = urlObject.pathname.split("/").filter(Boolean);
  if (pathParts.length < 2 || pathParts[0] !== "rest") {
    docLink.href = "https://documentation.uts.nlm.nih.gov/rest/home.html";
    return;
  }

  const anchorDocMap = {
    atoms: "concept",
    definitions: "concept",
    relations: "concept",
    parents: "concept",
    children: "concept",
    ancestors: "concept",
    descendants: "concept",
    cuis: "search"
  };

  const last = pathParts[pathParts.length - 1];
  let docSection = anchorDocMap[last];

  if (!docSection) {
    const section = pathParts[1];
    docSection = section === "content" ? "concept" : section;
    if (section === "content" && pathParts.includes("AUI")) {
      docSection = "atom";
    }
  }

  let docUrl = `https://documentation.uts.nlm.nih.gov/rest/${docSection}/index.html`;
  if (anchorDocMap[last]) {
    docUrl += `#${last}`;
  }

  docLink.href = docUrl;
}


function stripBaseUrl(fullUrl) {
  if (!fullUrl) return "";
  const parts = fullUrl.split("/");
  let last = parts.length ? parts[parts.length - 1] : fullUrl;
  if (last === "code" && parts.length > 1) {
    last = parts[parts.length - 2];
  }
  return last;
}

function parseHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return {};
  const [pathPart, queryPart] = hash.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const result = {};
  if (parts[0] === "content") {
    if (parts[2] === "source") {
      if (parts.length >= 6) {
        result.sab = parts[3];
        result.code = parts[4];
        result.detail = parts[5];
        result.returnIdType = "code";
      } else if (parts.length === 5) {
        result.sab = parts[3];
        result.code = parts[4];
        result.returnIdType = "code";
      }
    } else if (parts[2] === "CUI") {
      if (parts.length >= 5) {
        result.cui = parts[3];
        result.detail = parts[4] === "concept" ? "" : parts[4];
        result.returnIdType = "concept";
      } else if (parts.length === 4) {
        result.cui = parts[3];
        result.returnIdType = "concept";
      }
    }
    else if (parts[2] === "AUI") {
      if (parts.length >= 5) {
        result.aui = parts[3];
        result.detail = parts[4];
      } else if (parts.length === 4) {
        result.aui = parts[3];
      }
    }
  }
  else if (parts[0] === "semantic-network" && parts[1] === "semantic-types") {
    if (parts.length >= 3) {
      result.tui = parts[2];
    }
  }
  else if (parts[0] === "search") {
    if (parts.length >= 2) {
      result.searchRelease = parts[1];
    }
  }
  if (queryPart) {
    const sp = new URLSearchParams(queryPart);
    for (const [k, v] of sp.entries()) {
      result[k] = v;
    }
  }
  return result;
}

function parseUmlsUrl(url) {
  try {
    const u = new URL(url, window.location.href);
    let m = u.pathname.match(/\/content\/[^/]+\/CUI\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      const detail = m[2] || "";
      return { type: "concept", cui: m[1], detail: detail === "concept" ? "" : detail };
    }
    m = u.pathname.match(/\/content\/[^/]+\/source\/([^/]+)\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      return { type: "code", sab: m[1], code: m[2], detail: m[3] || "" };
    }
    m = u.pathname.match(/\/content\/[^/]+\/AUI\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      return { type: "aui", aui: m[1], detail: m[2] || "" };
    }
    m = u.pathname.match(/\/semantic-network\/semantic-types\/([^/]+)\/?$/);
    if (m) {
      return { type: "semanticType", tui: m[1] };
    }
    m = u.pathname.match(/\/search\/([^/]+)\/?$/);
    if (m) {
      return { type: "search", release: m[1], params: u.searchParams };
    }
  } catch (e) {
    // ignore invalid URLs
  }
  return null;
}

function navigateToUmlsUrl(url, key) {
  const parsed = parseUmlsUrl(url);
  if (parsed) {
    const detail = parsed.detail === "concept" ? "" : parsed.detail;
    if (parsed.type === "code") {
      modalCurrentData.sab = parsed.sab;
      modalCurrentData.ui = parsed.code;
      const baseParts = url.split("/");
      if (detail) {
        baseParts.splice(-detail.split("/").length, detail.split("/").length);
      }
      modalCurrentData.uri = baseParts.join("/");
      modalCurrentData.returnIdType = "code";
      fetchConceptDetails(parsed.code, detail !== undefined ? detail : key.toLowerCase());
    } else if (parsed.type === "search") {
      const queryInput = document.getElementById("query");
      const returnSelector = document.getElementById("return-id-type");
      if (queryInput) queryInput.value = parsed.params.get("string") || "";
      if (returnSelector && parsed.params.get("returnIdType")) {
        returnSelector.value = parsed.params.get("returnIdType");
      }
      document.querySelectorAll("#vocab-container input").forEach((cb) => {
        cb.checked = false;
      });
      const sabs = parsed.params.get("sabs");
      if (sabs) {
        sabs.split(",").forEach((v) => {
          const cb = document.querySelector(`#vocab-container input[value="${v}"]`);
          if (cb) cb.checked = true;
        });
      } else {
        document.querySelectorAll("#vocab-container input").forEach((cb) => {
          cb.checked = true;
        });
      }
      if (typeof window.updateVocabVisibility === "function") {
        window.updateVocabVisibility();
      }
      searchUMLS({ release: parsed.release });
    } else if (parsed.type === "aui") {
      modalCurrentData.sab = null;
      modalCurrentData.ui = parsed.aui;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = "aui";
      fetchAuiDetails(parsed.aui, detail !== undefined ? detail : key.toLowerCase());
    } else if (parsed.type === "semanticType") {
      fetchSemanticType(parsed.tui, { release: DEFAULT_SEMANTIC_NETWORK_RELEASE });
      modalCurrentData.sab = null;
      modalCurrentData.ui = parsed.cui;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = "concept";
      fetchConceptDetails(parsed.cui, detail !== undefined ? detail : key.toLowerCase());
    }
  } else {
    fetchRelatedDetail(url, key.toLowerCase());
  }
}

function getSelectedVocabularies() {
  return Array.from(document.querySelectorAll("#vocab-container input:checked")).map(
    checkbox => checkbox.value
  );
}

async function fetchConceptDetails(cui, detailType = "", options = {}) {
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
    detailType === "atoms" ? 4 :
    detailType === "atoms/preferred" ? 3 :
    detailType ? 3 : 2;
  infoTableBody.innerHTML = `<tr><td colspan="${loadingColspan}">Loading...</td></tr>`;

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

    if (detailType) {
      renderConceptSummary({
        name: modalCurrentData.name || (detailObj && detailObj.name),
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
        if (typeof value === "string" && value.toUpperCase() === "NONE") return;
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        const tdValue = document.createElement("td");
        if (key === "semanticTypes" && Array.isArray(value)) {
          const items = value.map(st => {
            if (!st) return "";
            const anchor = document.createElement("a");
            anchor.href = "https://uts-ws.nlm.nih.gov/rest/semantic-network/" + DEFAULT_SEMANTIC_NETWORK_RELEASE + "/TUI/" + (st.tui || "");
            const tuiMatch = (st.tui || (st.uri && st.uri.match(/TUI\/([^/]+)$/)));
            const tui = tuiMatch ? (Array.isArray(tuiMatch) ? tuiMatch[1] : tuiMatch) : "";
            anchor.textContent = `${st.name || st.tui || ""}${tui ? ` (${tui})` : ""}`.trim();
            anchor.addEventListener("click", function(e) {
              e.preventDefault();
              if (tui) fetchSemanticType(tui, { release: DEFAULT_SEMANTIC_NETWORK_RELEASE });
            });
            return anchor.outerHTML;
          });
          tdValue.innerHTML = items.join(", ");
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
          tdValue.textContent = JSON.stringify(value, null, 2);
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
        if (typeof value === "string" && value.toUpperCase() === "NONE") return;
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
          tdValue.textContent = JSON.stringify(value, null, 2);
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
      tableHead.innerHTML = `<tr><th>Atom</th><th>Term Type</th><th>Root Source</th><th>Code</th></tr>`;
    } else if (detailType === "definitions") {
      tableHead.innerHTML = `<tr><th>Definition</th><th>Root Source</th></tr>`;
    } else if (detailType === "attributes") {
      tableHead.innerHTML = `<tr><th>Name</th><th>Value</th><th>Root Source</th></tr>`;
    } else if (detailType === "parents") {
      tableHead.innerHTML = `<tr><th>UI</th><th>Name</th><th>Root Source</th></tr>`;
    } else if (detailType === "relations") {
      tableHead.innerHTML = `<tr>
          <th>From Name</th>
          <th>Relation Label</th>
          <th>Additional Relation Label</th>
          <th>To Name</th>
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
        detailType === "atoms" ? 4 :
        detailType === "atoms/preferred" ? 3 : 3;
      infoTableBody.innerHTML = `<tr><td colspan="${emptyColspan}">No ${detailType} found for this ${cui}.</td></tr>`;
      return;
    }

    if (detailType === "atoms") {
      sortedDetails.forEach((atom, index) => {
        const tr = document.createElement("tr");
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
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = stripBaseUrl(atom.code);
          link.addEventListener("click", function (e) {
            e.preventDefault();
            navigateToUmlsUrl(atom.code, "code");
          });
          col4.appendChild(link);
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
        col3.textContent = extractCui(atom.concept) || atom.cui || "";
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
        col1.style.color = "blue";
        col1.style.textDecoration = "underline";
        col1.style.cursor = "pointer";
        const fromNameFallback = !relation.relatedFromIdName;
        col1.textContent = relation.relatedFromIdName || modalCurrentData.name || "(no relatedFromIdName)";
        col1.addEventListener("click", function () {
          if (fromNameFallback) {
            fetchConceptDetails(modalCurrentData.ui, "");
          } else {
            const fromId = relation.relatedFromId || modalCurrentData.ui;
            if (returnIdType === "code") {
              fetchRelatedDetail(fromId, "from", relation.rootSource);
            } else {
              fetchRelatedDetail(fromId, "from");
            }
          }
        });
        tr.appendChild(col1);

        const col2 = document.createElement("td");
        col2.textContent = relation.relationLabel || "-";
        tr.appendChild(col2);

        const col3 = document.createElement("td");
        col3.textContent = relation.additionalRelationLabel || "-";
        tr.appendChild(col3);

        const col4 = document.createElement("td");
        col4.style.color = "blue";
        col4.style.textDecoration = "underline";
        col4.style.cursor = "pointer";
        col4.textContent = relation.relatedIdName || "(no relatedIdName)";
        col4.addEventListener("click", function () {
          if (returnIdType === "code") {
            fetchRelatedDetail(relation.relatedId, "to", relation.rootSource);
          } else {
            fetchRelatedDetail(relation.relatedId, "to");
          }
        });
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
        col1.style.color = "blue";
        col1.style.textDecoration = "underline";
        col1.style.cursor = "pointer";
        col1.textContent = item.ui || "N/A";
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
    resultsContainer.textContent = `Error fetching ${detailType}: ${error}`;
    const errorColspan =
      detailType === "relations" ? 5 :
      detailType === "definitions" ? 2 :
      detailType === "atoms" ? 4 :
      detailType === "atoms/preferred" ? 3 : 3;
    infoTableBody.innerHTML = `<tr><td colspan="${errorColspan}">Error loading ${detailType}.</td></tr>`;
  } finally {
    scrollRecentRequestIntoView();
  }
}

async function fetchAuiDetails(aui, detailType = "", options = {}) {
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
  infoTableBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
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

    renderConceptSummary({
      name: modalCurrentData.name || (detailObj && detailObj.name),
      ui: aui,
      rootSource: modalCurrentData.sab || (detailObj && detailObj.rootSource)
    }, detailType);

    infoTableBody.innerHTML = "";

    if (detailObj && typeof detailObj === "object") {
      Object.keys(detailObj).forEach(key => {
        const value = detailObj[key];
        if (typeof value === "string" && value.toUpperCase() === "NONE") return;
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
          tdValue.textContent = JSON.stringify(value, null, 2);
        }
        tr.appendChild(tdKey);
        tr.appendChild(tdValue);
        infoTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    resultsContainer.textContent = `Error fetching ${detailType || "details"}: ${error}`;
    infoTableBody.innerHTML = `<tr><td colspan="2">Error loading ${detailType || "details"}.</td></tr>`;
  } finally {
    scrollRecentRequestIntoView();
  }
}

async function fetchRelatedDetail(apiUrl, relatedType, rootSource, options = {}) {
  scrollRecentRequestIntoView();
  const { skipPushState = false } = options;
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
  }

  // If a bare UI/code is passed in, construct the full URL
  if (!/^https?:\/\//i.test(apiUrl)) {
    if (rootSource) {
      apiUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${rootSource}/${apiUrl}`;
    } else {
      apiUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/CUI/${apiUrl}`;
    }
  }

  let urlObj = new URL(apiUrl);
  urlObj.searchParams.append("apiKey", apiKey);
  urlObj.searchParams.append("pageSize", DEFAULT_PAGE_SIZE);

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
    const response = await fetch(urlObj, {
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

    renderConceptSummary({
      name: modalCurrentData.name || (detailObj && detailObj.name),
      ui: modalCurrentData.ui,
      rootSource: modalCurrentData.sab || (detailObj && detailObj.rootSource)
    }, relatedType);

    infoTableBody.innerHTML = "";

  if (detailObj && typeof detailObj === "object") {
    Object.keys(detailObj).forEach((key) => {
      const value = detailObj[key];

      // Exclude NONE values
      if (typeof value === "string" && value.toUpperCase() === "NONE") {
        return;
      }

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
        tdValue.textContent = JSON.stringify(value, null, 2);
      }

      tr.appendChild(tdKey);
      tr.appendChild(tdValue);
      infoTableBody.appendChild(tr);
    });
  }

  } catch (error) {
    resultsContainer.textContent = `Error fetching related ${relatedType}: ${error}`;
    infoTableBody.innerHTML = `<tr><td colspan="2">Error loading related ${relatedType}.</td></tr>`;
  } finally {
    scrollRecentRequestIntoView();
  }
};

async function fetchCuisForCode(code, sab) {
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
    resultsHeading.textContent = `Results for "${code}"`;
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
    const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
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
      uiTd.style.color = "blue";
      uiTd.style.textDecoration = "underline";
      uiTd.style.cursor = "pointer";
      uiTd.textContent = item.ui || "N/A";
      uiTd.addEventListener("click", () => {
        modalCurrentData.ui = item.ui;
        modalCurrentData.name = item.name || null;
        modalCurrentData.sab = null;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = "concept";
        fetchConceptDetails(item.ui, "");
      });
      tr.appendChild(uiTd);

      const nameTd = document.createElement("td");
      nameTd.textContent = item.name || "N/A";
      tr.appendChild(nameTd);

      infoTableBody.appendChild(tr);
    });
  } catch (error) {
    resultsContainer.textContent = `Error fetching CUIs: ${error}`;
    infoTableBody.innerHTML = '<tr><td colspan="2">Error loading CUIs.</td></tr>';
  } finally {
    scrollRecentRequestIntoView();
  }
}

async function fetchSemanticType(tui, options = {}) {
  scrollRecentRequestIntoView();
  const { skipPushState = false, release = DEFAULT_SEMANTIC_NETWORK_RELEASE } = options;
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
    const response = await fetch(apiUrlObj, { method: "GET", headers: { Accept: "application/json" } });
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

    infoTableBody.innerHTML = "";

    if (detailObj && typeof detailObj === "object") {
      Object.keys(detailObj).forEach(key => {
        const value = detailObj[key];
        if (typeof value === "string" && value.toUpperCase() === "NONE") return;
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        const tdValue = document.createElement("td");
        if (typeof value === "string" && value.startsWith("http")) {
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = value;
          link.addEventListener("click", function(e) {
            e.preventDefault();
            navigateToUmlsUrl(value, key);
          });
          tdValue.appendChild(link);
        } else if (typeof value === "string") {
          tdValue.textContent = value;
        } else {
          tdValue.textContent = JSON.stringify(value, null, 2);
        }
        tr.appendChild(tdKey);
        tr.appendChild(tdValue);
        infoTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    resultsContainer.textContent = `Error fetching semantic type: ${error}`;
    infoTableBody.innerHTML = '<tr><td colspan="2">Error loading semantic type.</td></tr>';
  } finally {
    scrollRecentRequestIntoView();
  }
}

window.addEventListener("DOMContentLoaded", function () {

  // Preload MRRANK data for later sorting
  loadMRRank();
  updateDocLink(new URL("https://uts-ws.nlm.nih.gov/rest/home.html"));

  // Grab elements once DOM is ready
  const returnSelector = document.getElementById("return-id-type");
  const vocabContainer = document.getElementById("vocab-container");
  const rootSourceHeader = document.getElementById("root-source-header");
  const queryInput = document.getElementById("query");
  const definitionsOption = document.getElementById("definitions-option");
  const attributesOption = document.getElementById("attributes-option");
  const parentsOption = document.getElementById("parents-option");
  const childrenOption = document.getElementById("children-option");
  const cuisOption = document.getElementById("cuis-option");

  if (!returnSelector || !vocabContainer || !rootSourceHeader || !queryInput) return;

  // Read URL params (existing code)...
  function applyUrlParams(fromPopState = false) {
    const params = new URLSearchParams(window.location.search);
    const hashParams = parseHash();
    const apiKey = params.get("apiKey");
    const searchString = params.get("string");
    let returnIdType = params.get("returnIdType") || hashParams.returnIdType;
    const sabs = params.get("sabs") || hashParams.sabs;
    const inputType = params.get("inputType") || hashParams.inputType;
    const searchType = params.get("searchType") || hashParams.searchType;
    if (inputType === "sourceUi" && searchType === "exact") {
      returnIdType = "concept";
    }
    if (!returnIdType) {
      returnIdType = "concept";
    }
    let detail = params.get("detail") || hashParams.detail;
    if (detail === "concept") detail = "";
    let cui = params.get("cui") || hashParams.cui;
    let code = params.get("code") || hashParams.code;
    let aui = params.get("aui") || hashParams.aui;
    let related = params.get("related") || hashParams.related;
    let relatedId = params.get("relatedId") || hashParams.relatedId;
    let sab = params.get("sab") || hashParams.sab;
    let tui = params.get("tui") || hashParams.tui;

    if (apiKey) {
      document.getElementById("api-key").value = apiKey;
    }
    if (searchString) {
      document.getElementById("query").value = searchString;
    } else {
      document.getElementById("query").value = "";
    }
    if (returnIdType) {
      returnSelector.value = returnIdType;
    }

    document.querySelectorAll("#vocab-container input").forEach(cb => {
      cb.checked = false;
    });
    if (sabs) {
      sabs.split(",").forEach(v => {
        const cb = document.querySelector(`#vocab-container input[value="${v}"]`);
        if (cb) cb.checked = true;
      });
    } else {
      document.querySelectorAll("#vocab-container input").forEach(cb => {
        cb.checked = true;
      });
    }
    updateVocabVisibility();

    if (detail) {
      if (aui) {
        modalCurrentData.sab = null;
        modalCurrentData.ui = aui;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = "aui";
        fetchAuiDetails(aui, detail, { skipPushState: fromPopState });
      } else if (returnSelector.value === "code" && code && sab) {
        modalCurrentData.sab = sab;
        modalCurrentData.ui = code;
        modalCurrentData.uri = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${sab}/${code}`;
        modalCurrentData.returnIdType = "code";
      } else {
        modalCurrentData.sab = null;
        modalCurrentData.ui = cui;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = "concept";
      }
      if (!aui) {
        fetchConceptDetails(code || cui, detail, { skipPushState: fromPopState });
      }
    } else if ((returnSelector.value === "code" && code && sab) || (returnSelector.value !== "code" && cui)) {
      if (returnSelector.value === "code") {
        modalCurrentData.sab = sab;
        modalCurrentData.ui = code;
        modalCurrentData.uri = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${sab}/${code}`;
        modalCurrentData.returnIdType = "code";
      } else {
        modalCurrentData.sab = null;
        modalCurrentData.ui = cui;
        modalCurrentData.uri = null;
        modalCurrentData.returnIdType = "concept";
      }
      fetchConceptDetails(code || cui, "", { skipPushState: fromPopState });
    } else if (aui) {
      modalCurrentData.sab = null;
      modalCurrentData.ui = aui;
      modalCurrentData.uri = null;
      modalCurrentData.returnIdType = "aui";
      fetchAuiDetails(aui, "", { skipPushState: fromPopState });
    } else if (tui) {
      fetchSemanticType(tui, { skipPushState: fromPopState, release: DEFAULT_SEMANTIC_NETWORK_RELEASE });
      let fullUrl;
      if (sab) {
        fullUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${sab}/${relatedId}`;
      } else {
        fullUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/CUI/${relatedId}`;
      }
      fetchRelatedDetail(fullUrl, related, sab, { skipPushState: fromPopState });
    } else if (inputType === "sourceUi" && searchType === "exact" && searchString) {
      if (hashParams.searchRelease) {
        searchRelease = hashParams.searchRelease;
      }
      fetchCuisForCode(searchString, sab);
    } else if (searchString) {
      searchUMLS({ skipPushState: fromPopState, useCache: fromPopState, release: hashParams.searchRelease });
    }
  }

  // Helper to toggle visibility
  function updateVocabVisibility() {
    if (returnSelector.value === "code") {
      vocabContainer.classList.remove("hidden");
      rootSourceHeader.style.display = "";
      if (definitionsOption) definitionsOption.classList.add("hidden");
      if (parentsOption) parentsOption.classList.remove("hidden");
      if (childrenOption) childrenOption.classList.remove("hidden");
      if (cuisOption) cuisOption.classList.remove("hidden");
    } else {
      vocabContainer.classList.add("hidden");
      rootSourceHeader.style.display = "none";
      if (definitionsOption) definitionsOption.classList.remove("hidden");
      if (parentsOption) parentsOption.classList.add("hidden");
      if (childrenOption) childrenOption.classList.add("hidden");
      if (cuisOption) cuisOption.classList.add("hidden");
    }
  }
  window.updateVocabVisibility = updateVocabVisibility;

  // Wire up and initialize
  returnSelector.addEventListener("change", updateVocabVisibility);
  updateVocabVisibility();

  queryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchUMLS();
    }
  });

  applyUrlParams();

  window.addEventListener("popstate", () => applyUrlParams(true));


});
