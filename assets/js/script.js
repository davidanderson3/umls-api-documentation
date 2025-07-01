let modalCurrentData = { ui: null, sab: null };

async function searchUMLS() {
  const apiKey = document.getElementById("api-key").value.trim();
  const searchString = document.getElementById("query").value.trim();
  const returnIdType = document.getElementById("return-id-type").value;
  const selectedVocabularies =
    returnIdType === "code" ? getSelectedVocabularies() : [];

  if (!apiKey || !searchString) {
    alert("Please enter both an API key and a search term.");
    return;
  }

  const params = new URLSearchParams();
  params.set("string", searchString);
  params.set("returnIdType", returnIdType);
  if (selectedVocabularies.length > 0) {
    params.set("sabs", selectedVocabularies.join(","));
  }
  window.history.pushState({}, "", "?" + params.toString());

  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const recentRequestContainer = document.getElementById("recent-request-output");
  const tableHead = document.querySelector("#info-table thead");

  resultsContainer.textContent = "Loading...";
  tableHead.innerHTML = `<tr>
        <th>UI</th>
        <th>Name</th>
        <th id="root-source-header" style="display: none;">Root Source</th>
    </tr>`;
  infoTableBody.innerHTML = '<tr><td colspan="3">No information yet...</td></tr>';

  const url = new URL("https://uts-ws.nlm.nih.gov/rest/search/current");
  url.searchParams.append("string", searchString);
  url.searchParams.append("returnIdType", returnIdType);
  url.searchParams.append("apiKey", apiKey);
  if (selectedVocabularies.length > 0) {
    url.searchParams.append("sabs", selectedVocabularies.join(","));
  }
  const displayUrl = new URL(url);
  displayUrl.searchParams.set("apiKey", "***");
  recentRequestContainer.innerHTML = colorizeUrl(displayUrl);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const data = await response.json();

    resultsContainer.textContent = JSON.stringify(data, null, 2);

    infoTableBody.innerHTML = "";

    const results = data.result && data.result.results ? data.result.results : [];
    if (results.length === 0) {
      infoTableBody.innerHTML = '<tr><td colspan="3">No results found.</td></tr>';
      return;
    }

    results.forEach(item => {
      const tr = document.createElement("tr");

      const uiTd = document.createElement("td");
      if (returnIdType === "concept") {
        uiTd.style.color = "blue";
        uiTd.style.textDecoration = "underline";
        uiTd.style.cursor = "pointer";
        uiTd.textContent = item.ui || "N/A";
        uiTd.addEventListener("click", () => {
          openCuiOptionsModal(item.ui);
        });
      } else {
        uiTd.textContent = item.ui || "N/A";
      }
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
function openCuiOptionsModal(ui, sab) {
  modalCurrentData.ui = ui;
  if (sab) {
    modalCurrentData.sab = sab;
  } else {
    modalCurrentData.sab = null;
  }
  const returnIdType = document.getElementById("return-id-type").value;
  const modalDiv = document.getElementById("cui-options-modal");
  if (returnIdType === "concept") {
    modalDiv.innerHTML = `
        <h3>Select an action for <span id="selected-cui">${ui}</span></h3>
        <button onclick="fetchConceptDetails(modalCurrentData.ui, 'atoms')">Atoms</button>
        <button onclick="fetchConceptDetails(modalCurrentData.ui, 'relations')">Relations</button>
        <button onclick="fetchConceptDetails(modalCurrentData.ui, 'definitions')">Definitions</button>
        <hr>
        <button onclick="closeCuiOptionsModal()">Close</button>
      `;
  } else if (returnIdType === "code") {
    modalDiv.innerHTML = `
        <h3>Select an action for <span id="selected-cui">${ui}</span></h3>
        <button onclick="fetchConceptDetails(modalCurrentData.ui, 'atoms')">Atoms</button>
        <button onclick="fetchConceptDetails(modalCurrentData.ui, 'relations')">Relations</button>
        <hr>
        <button onclick="closeCuiOptionsModal()">Close</button>
      `;
  }
  document.getElementById("modal-backdrop").style.display = "block";
  modalDiv.style.display = "block";
}

function closeCuiOptionsModal() {
  modalCurrentData = { ui: null, sab: null };
  document.getElementById("selected-cui").textContent = "";
  document.getElementById("modal-backdrop").style.display = "none";
  document.getElementById("cui-options-modal").style.display = "none";
}

function getSelectedVocabularies() {
  return Array.from(document.querySelectorAll("#vocab-container input:checked")).map(
    checkbox => checkbox.value
  );
}

async function fetchConceptDetails(cui, detailType) {
  const apiKey = document.getElementById("api-key").value.trim();
  const returnIdType = document.getElementById("return-id-type").value;
  const resultsContainer = document.getElementById("output");
  const infoTableBody = document.querySelector("#info-table tbody");
  const recentRequestContainer = document.getElementById("recent-request-output");
  const tableHead = document.querySelector("#info-table thead");

  closeCuiOptionsModal();

  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
  }

  let baseUrl;
  if (returnIdType === "code") {
    baseUrl = modalCurrentData.uri + "/" + detailType;
  } else {
    baseUrl = `https://uts-ws.nlm.nih.gov/rest/content/current/CUI/${cui}/${detailType}`;
  }
  const apiUrlObj = new URL(baseUrl);
  apiUrlObj.searchParams.append("apiKey", apiKey);

  const displayApiUrl = new URL(apiUrlObj);
  displayApiUrl.searchParams.set("apiKey", "***");

  recentRequestContainer.innerHTML = colorizeUrl(displayApiUrl);

  const addressUrl = new URL(window.location.href);
  addressUrl.searchParams.set("endpoint", detailType);
  window.history.pushState({}, "", addressUrl.toString());

  resultsContainer.textContent = `Loading ${detailType} for ${cui}...`;
  infoTableBody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

  try {
    const response = await fetch(apiUrlObj, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const data = await response.json();

    resultsContainer.textContent = JSON.stringify(data, null, 2);

    infoTableBody.innerHTML = "";

    if (detailType === "atoms") {
      tableHead.innerHTML = `<tr><th>Atom</th><th>Root Source</th></tr>`;
    } else if (detailType === "definitions") {
      tableHead.innerHTML = `<tr><th>Definition</th><th>Root Source</th></tr>`;
    } else if (detailType === "relations") {
      tableHead.innerHTML = `<tr>
          <th>From Name</th>
          <th>Relation Label</th>
          <th>To Name</th>
          <th>Root Source</th>
        </tr>`;
    }

    const detailArray = Array.isArray(data.result) ? data.result : [];
    if (!Array.isArray(detailArray) || detailArray.length === 0) {
      infoTableBody.innerHTML = `<tr><td colspan="3">No ${detailType} found for this ${cui}.</td></tr>`;
      return;
    }

    if (detailType === "atoms") {
      detailArray.forEach((atom, index) => {
        const tr = document.createElement("tr");
        const col1 = document.createElement("td");
        col1.textContent = atom.name || `(Atom #${index + 1})`;
        tr.appendChild(col1);
        const col2 = document.createElement("td");
        col2.textContent = atom.rootSource || "(no rootSource)";
        tr.appendChild(col2);
        infoTableBody.appendChild(tr);
      });
    } else if (detailType === "definitions") {
      detailArray.forEach((definition, index) => {
        const tr = document.createElement("tr");
        const col1 = document.createElement("td");
        col1.textContent = definition.value || `(Definition #${index + 1})`;
        tr.appendChild(col1);
        const col2 = document.createElement("td");
        col2.textContent = definition.rootSource || "(no rootSource)";
        tr.appendChild(col2);
        infoTableBody.appendChild(tr);
      });
    } else if (detailType === "relations") {
      detailArray.forEach((relation) => {
        const tr = document.createElement("tr");

        const col1 = document.createElement("td");
        col1.style.color = "blue";
        col1.style.textDecoration = "underline";
        col1.style.cursor = "pointer";
        col1.textContent = relation.relatedFromIdName || "(no relatedFromIdName)";
        col1.addEventListener("click", function () {
          if (returnIdType === "code") {
            fetchRelatedDetail(relation.relatedFromId, "from", relation.rootSource);
          } else {
            fetchRelatedDetail(relation.relatedFromId, "from");
          }
        });
        tr.appendChild(col1);

        const col2 = document.createElement("td");
        col2.textContent = relation.additionalRelationLabel || "(no relation label)";
        tr.appendChild(col2);

        const col3 = document.createElement("td");
        col3.style.color = "blue";
        col3.style.textDecoration = "underline";
        col3.style.cursor = "pointer";
        col3.textContent = relation.relatedIdName || "(no relatedIdName)";
        col3.addEventListener("click", function () {
          if (returnIdType === "code") {
            fetchRelatedDetail(relation.relatedId, "to", relation.rootSource);
          } else {
            fetchRelatedDetail(relation.relatedId, "to");
          }
        });
        tr.appendChild(col3);

        const col4 = document.createElement("td");
        col4.textContent = relation.rootSource || "(no rootSource)";
        tr.appendChild(col4);

        infoTableBody.appendChild(tr);
      });
    }
  } catch (error) {
    resultsContainer.textContent = `Error fetching ${detailType}: ${error}`;
    infoTableBody.innerHTML = `<tr><td colspan="3">Error loading ${detailType}.</td></tr>`;
  }
}

async function fetchRelatedDetail(apiUrl, relatedType, rootSource) {
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) {
    alert("Please enter an API key first.");
    return;
  }
  let urlObj = new URL(apiUrl);
  urlObj.searchParams.append("apiKey", apiKey);

  let displayUrlObj = new URL(urlObj);
  displayUrlObj.searchParams.set("apiKey", "***");

  document.getElementById("recent-request-output").innerHTML = colorizeUrl(displayUrlObj);

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set("related", relatedType);
  currentUrl.searchParams.set("relatedId", stripBaseUrl(apiUrl));
  window.history.pushState({}, "", currentUrl.toString());

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
    const data = await response.json();
    resultsContainer.textContent = JSON.stringify(data, null, 2);
    infoTableBody.innerHTML = "";
    if (typeof data === "object") {
      for (let key in data) {
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        const tdValue = document.createElement("td");
        tdValue.textContent = JSON.stringify(data[key]);
        tr.appendChild(tdKey);
        tr.appendChild(tdValue);
        infoTableBody.appendChild(tr);
      }
    }
  } catch (error) {
    resultsContainer.textContent = `Error fetching related ${relatedType}: ${error}`;
    infoTableBody.innerHTML = `<tr><td colspan="2">Error loading related ${relatedType}.</td></tr>`;
  }
};

window.addEventListener("DOMContentLoaded", function () {

  // Grab elements once DOM is ready
  const returnSelector = document.getElementById("return-id-type");
  const vocabContainer = document.getElementById("vocab-container");
  const rootSourceHeader = document.getElementById("root-source-header");

  if (!returnSelector || !vocabContainer || !rootSourceHeader) return;

  // Read URL params (existing code)...
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get("apiKey");
  const searchString = params.get("string");
  const returnIdType = params.get("returnIdType");
  const sabs = params.get("sabs");

  if (apiKey) {
    document.getElementById("api-key").value = apiKey;
  }
  if (searchString) {
    document.getElementById("query").value = searchString;
  }
  if (returnIdType) {
    returnSelector.value = returnIdType;
  }
  if (sabs) {
    const vocabArray = sabs.split(",");
    document.querySelectorAll("#vocab-container input").forEach(cb => {
      if (vocabArray.includes(cb.value)) cb.checked = true;
    });
  }

  // Helper to toggle visibility
  function updateVocabVisibility() {
    if (returnSelector.value === "code") {
      vocabContainer.classList.remove("hidden");
      rootSourceHeader.style.display = "";
    } else {
      vocabContainer.classList.add("hidden");
      rootSourceHeader.style.display = "none";
    }
  }

  // Wire up and initialize
  returnSelector.addEventListener("change", updateVocabVisibility);
  updateVocabVisibility();


  function stripBaseUrl(fullUrl) {
    if (!fullUrl) return "";
    const parts = fullUrl.split("/");
    return parts.length ? parts[parts.length - 1] : fullUrl;
  }

});
