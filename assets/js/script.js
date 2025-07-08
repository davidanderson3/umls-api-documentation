const DEFAULT_PAGE_SIZE = 200;
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

const searchCache = {};

async function renderSearchResults(data, returnIdType) {
  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const tableHead = document.querySelector("#info-table thead");
  const infoTable = document.getElementById("info-table");
  const noResultsMessage = document.getElementById("no-results-message");

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
        modalCurrentData.uri = item.uri || null;
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
  const { skipPushState = false, useCache = false } = options;
  const apiKey = document.getElementById("api-key").value.trim();
  const searchString = document.getElementById("query").value.trim();
  const returnIdType = document.getElementById("return-id-type").value;
  const selectedVocabularies =
    returnIdType === "code" ? getSelectedVocabularies() : [];

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
  const infoTable = document.getElementById("info-table");
  const noResultsMessage = document.getElementById("no-results-message");

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

  const url = new URL("https://uts-ws.nlm.nih.gov/rest/search/current");
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

  const section = pathParts[1];
  const docSection = section === "content" ? "concept" : section;
  let docUrl = `https://documentation.uts.nlm.nih.gov/rest/${docSection}/index.html`;

  const anchorTargets = [
    "atoms",
    "definitions",
    "relations",
    "parents",
    "children",
    "cuis"
  ];
  const last = pathParts[pathParts.length - 1];
  if (anchorTargets.includes(last)) {
    docUrl += `#${last}`;
  }

  docLink.href = docUrl;
}


function stripBaseUrl(fullUrl) {
  if (!fullUrl) return "";
  const parts = fullUrl.split("/");
  return parts.length ? parts[parts.length - 1] : fullUrl;
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
        result.detail = parts[4];
        result.returnIdType = "concept";
      } else if (parts.length === 4) {
        result.cui = parts[3];
        result.returnIdType = "concept";
      }
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

function getSelectedVocabularies() {
  return Array.from(document.querySelectorAll("#vocab-container input:checked")).map(
    checkbox => checkbox.value
  );
}

async function fetchConceptDetails(cui, detailType = "", options = {}) {
  const { skipPushState = false } = options;
  const apiKey = document.getElementById("api-key").value.trim();
  const returnIdType = modalCurrentData.returnIdType ||
    document.getElementById("return-id-type").value;
  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const recentRequestContainer = document.getElementById("recent-request-output");
  const tableHead = document.querySelector("#info-table thead");


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
  const loadingColspan = detailType === "relations" ? 5 : detailType === "definitions" ? 2 : detailType ? 3 : 2;
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

    infoTableBody.innerHTML = "";

    if (!detailType) {
      tableHead.innerHTML = `<tr><th>Key</th><th>Value</th></tr>`;
      const detailObj = data && typeof data.result === "object" && !Array.isArray(data.result)
        ? data.result
        : data;
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
        if (typeof value === "string" && value.startsWith("http")) {
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = value;
          link.addEventListener("click", function (e) {
            e.preventDefault();
            const atomsMatch = value.match(/\/rest\/content\/[^/]+\/source\/([^/]+)\/([^/]+)\/atoms$/);
            const codeMatch = value.match(/\/rest\/content\/[^/]+\/source\/([^/]+)\/([^/]+)$/);
            if (atomsMatch) {
              modalCurrentData.sab = atomsMatch[1];
              modalCurrentData.ui = atomsMatch[2];
              modalCurrentData.uri = value.replace(/\/atoms$/, "");
              modalCurrentData.returnIdType = "code";
              fetchConceptDetails(atomsMatch[2], "");
            } else if (codeMatch) {
              modalCurrentData.sab = codeMatch[1];
              modalCurrentData.ui = codeMatch[2];
              modalCurrentData.uri = value;
              modalCurrentData.returnIdType = "code";
              fetchConceptDetails(codeMatch[2], "");
            } else {
              fetchRelatedDetail(value, key.toLowerCase());
            }
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

    } else if (detailType === "atoms") {
      tableHead.innerHTML = `<tr><th>Atom</th><th>Term Type</th><th>Root Source</th></tr>`;
    } else if (detailType === "definitions") {
      tableHead.innerHTML = `<tr><th>Definition</th><th>Root Source</th></tr>`;
    } else if (detailType === "attributes") {
      tableHead.innerHTML = `<tr><th>Name</th><th>Value</th><th>Root Source</th></tr>`;
    } else if (detailType === "relations") {
      tableHead.innerHTML = `<tr>
          <th>From Name</th>
          <th>Relation Label</th>
          <th>Additional Relation Label</th>
          <th>To Name</th>
          <th>Root Source</th>
        </tr>`;
    }

    const detailArray = Array.isArray(data.result) ? data.result : [];
    await loadMRRank();
    let sortedDetails = sortByMRRank(detailArray);
    if (detailType === "relations") {
      sortedDetails = sortByAdditionalRelationLabel(sortedDetails);
    }
    if (!Array.isArray(sortedDetails) || sortedDetails.length === 0) {
      const emptyColspan =
        detailType === "relations" ? 5 : detailType === "definitions" ? 2 : 3;
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
    } else if (detailType === "relations") {
      sortedDetails.forEach((relation) => {
        const tr = document.createElement("tr");

        const col1 = document.createElement("td");
        col1.style.color = "blue";
        col1.style.textDecoration = "underline";
        col1.style.cursor = "pointer";
        col1.textContent = relation.relatedFromIdName || modalCurrentData.name || "(no relatedFromIdName)";
        col1.addEventListener("click", function () {
          if (returnIdType === "code") {
            fetchRelatedDetail(relation.relatedFromId, "from", relation.rootSource);
          } else {
            fetchRelatedDetail(relation.relatedFromId, "from");
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
    }
  } catch (error) {
    resultsContainer.textContent = `Error fetching ${detailType}: ${error}`;
    const errorColspan =
      detailType === "relations" ? 5 : detailType === "definitions" ? 2 : 3;
    infoTableBody.innerHTML = `<tr><td colspan="${errorColspan}">Error loading ${detailType}.</td></tr>`;
  }
}

async function fetchRelatedDetail(apiUrl, relatedType, rootSource, options = {}) {
  const { skipPushState = false } = options;
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
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
    infoTableBody.innerHTML = "";

    const detailObj = data && typeof data.result === "object" && !Array.isArray(data.result)
      ? data.result
      : data;

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
          const atomsMatch = value.match(/\/rest\/content\/[^/]+\/source\/([^/]+)\/([^/]+)\/atoms$/);
          const codeMatch = value.match(/\/rest\/content\/[^/]+\/source\/([^/]+)\/([^/]+)$/);
          if (atomsMatch) {
            modalCurrentData.sab = atomsMatch[1];
            modalCurrentData.ui = atomsMatch[2];
            modalCurrentData.uri = value.replace(/\/atoms$/, "");
            modalCurrentData.returnIdType = "code";
            fetchConceptDetails(atomsMatch[2], "");
          } else if (codeMatch) {
            modalCurrentData.sab = codeMatch[1];
            modalCurrentData.ui = codeMatch[2];
            modalCurrentData.uri = value;
            modalCurrentData.returnIdType = "code";
            fetchConceptDetails(codeMatch[2], "");
          } else {
            fetchRelatedDetail(value, key.toLowerCase());
          }
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
  }
};

async function fetchCuisForCode(code, sab) {
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

  const url = new URL("https://uts-ws.nlm.nih.gov/rest/search/current");
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
    let detail = params.get("detail") || hashParams.detail;
    let cui = params.get("cui") || hashParams.cui;
    let code = params.get("code") || hashParams.code;
    let related = params.get("related") || hashParams.related;
    let relatedId = params.get("relatedId") || hashParams.relatedId;
    let sab = params.get("sab") || hashParams.sab;

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
    }
    updateVocabVisibility();

    if (detail) {
      if (returnSelector.value === "code" && code && sab) {
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
      fetchConceptDetails(code || cui, detail, { skipPushState: fromPopState });
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
    } else if (related && relatedId) {
      let fullUrl;
      if (sab) {
        fullUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/source/${sab}/${relatedId}`;
      } else {
        fullUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/CUI/${relatedId}`;
      }
      fetchRelatedDetail(fullUrl, related, sab, { skipPushState: fromPopState });
    } else if (searchString) {
      searchUMLS({ skipPushState: fromPopState, useCache: fromPopState });
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
