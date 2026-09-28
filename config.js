// config.js — Gestionnaire
// L'URL Apps Script est stockee localement (localStorage) et modifiable depuis l'ecran
// "Configuration" sans jamais editer ce fichier ni le dupliquer ailleurs.
window.ELIMU_CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbyhDhOfoU3maJ8NyDbi5cctmzf2yvf7P1e2fKFzoiW9g9fwH--nT7ahAML9HvE0_jx7ig/exec",
  schoolId: "ELIMU_SCH_001",
  role: "GESTIONNAIRE",
  cacheVersion: "v2"
};

const ELIMU_URL_STORAGE_KEY = "elimu_apps_script_url_v10";
const ELIMU_MANAGER_AUTH_KEY = "elimu_manager_access_v1";

window.ELIMU_normalizeAccessCode = function (value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
};

window.ELIMU_getManagerAccessCode = function () {
  try { return localStorage.getItem(ELIMU_MANAGER_AUTH_KEY) || ""; } catch (e) { return ""; }
};

window.ELIMU_setManagerAccessCode = function (value) {
  const normalized = window.ELIMU_normalizeAccessCode(value);
  try { localStorage.setItem(ELIMU_MANAGER_AUTH_KEY, normalized); } catch (e) {}
  return normalized;
};

window.ELIMU_getAppsScriptUrl = function () {
  try {
    const saved = localStorage.getItem(ELIMU_URL_STORAGE_KEY);
    if (saved && saved !== "https://script.google.com/macros/s/AKfycbyhDhOfoU3maJ8NyDbi5cctmzf2yvf7P1e2fKFzoiW9g9fwH--nT7ahAML9HvE0_jx7ig/exec") return saved;
  } catch (e) {}
  return window.ELIMU_CONFIG.appsScriptUrl;
};

window.ELIMU_setAppsScriptUrl = function (url) {
  localStorage.setItem(ELIMU_URL_STORAGE_KEY, url.trim());
};


