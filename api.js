// api.js — Gestionnaire
// Enveloppe unique pour parler au backend Apps Script.
// Utilise text/plain pour eviter le preflight CORS (limitation connue d'Apps Script Web App).

const ELIMU_Api = {
  async call(action, payload) {
    const configuredUrl = window.ELIMU_getAppsScriptUrl();
    const defaultUrl = window.ELIMU_CONFIG && window.ELIMU_CONFIG.appsScriptUrl;
    const urls = [...new Set([configuredUrl, defaultUrl].filter((u) => u && u.indexOf("A_REMPLACER") === -1))];
    if (!urls.length) {
      throw new Error("Connexion non configuree. Ouvrez Configuration.");
    }
    const body = JSON.stringify({
      action,
      schoolId: window.ELIMU_CONFIG.schoolId,
      role: window.ELIMU_CONFIG.role,
      accessCode: window.ELIMU_getManagerAccessCode ? window.ELIMU_getManagerAccessCode() : "",
      payload: payload || {}
    });
    let lastError;
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body
        });
        if (!res.ok) {
          lastError = new Error("Erreur reseau (" + res.status + ")");
          if (res.status === 404) continue;
          throw lastError;
        }
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Erreur serveur");
        if (url !== configuredUrl && window.ELIMU_setAppsScriptUrl) window.ELIMU_setAppsScriptUrl(url);
        return data.result;
      } catch (e) {
        lastError = e;
        if (url !== urls[urls.length - 1] && e.message && e.message.indexOf("Erreur reseau (404)") !== -1) continue;
        throw e;
      }
    }
    throw lastError || new Error("Erreur serveur");
  },

  isOnline() {
    return navigator.onLine;
  }
};

window.ELIMU_Api = ELIMU_Api;
