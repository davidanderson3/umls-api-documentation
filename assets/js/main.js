import * as mrrank from './mrrank.js';
import * as urlUtils from './url-utils.js';
import * as api from './api.js';
import * as dom from './dom.js';
import './init.js';

const modules = [mrrank, urlUtils, api, dom];
for (const mod of modules) {
  for (const [key, value] of Object.entries(mod)) {
    window[key] = value;
  }
}
