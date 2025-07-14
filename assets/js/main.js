import * as umls from './script.js';

// expose all exported functions to the global scope
for (const [key, value] of Object.entries(umls)) {
  window[key] = value;
}
