// sync.js — Gestionnaire
// 1) Pousse les operations en attente (queue) vers Apps Script
// 2) Tire les donnees a jour depuis Apps Script et les stocke localement
// 3) Expose l'etat (derniere sync, nb en attente) pour l'interface

const ELIMU_Sync = {
  listeners: [],

  onChange(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this.listeners.forEach((fn) => { try { fn(); } catch (e) {} });
  },

  async pushQueue() {
    if (!ELIMU_Api.isOnline()) return { pushed: 0, failed: 0 };
    const queue = await ELIMU_Storage.getQueue();
    const pending = queue.filter((q) => q.status === "PENDING" || q.status === "FAILED");
    let pushed = 0, failed = 0;
    for (const item of pending) {
      try {
        await ELIMU_Api.call(item.operation, {
          ...item.payload,
          idempotencyKey: item.idempotency_key
        });
        await ELIMU_Storage.updateQueueItem(item.local_id, { status: "SYNCED", error_message: null });
        pushed++;
      } catch (e) {
        await ELIMU_Storage.updateQueueItem(item.local_id, { status: "FAILED", error_message: String(e.message || e) });
        failed++;
      }
    }
    await ELIMU_Storage.clearSyncedQueue();
    this.notify();
    return { pushed, failed };
  },

  async pullAll() {
    if (!ELIMU_Api.isOnline()) return false;
    const actions = ["getClasses", "getStudents", "getEnrollments", "getTariffs", "getPayments", "getRelatedFees", "getAnnouncements", "getProfesseurs", "getSalaryPayments", "getConfig"];
    const stores = ["classes", "eleves", "inscriptions", "tarifs", "paiements", "frais_connexes", "communiques", "professeurs", "salaires", null];
    const results = await Promise.allSettled(actions.map((action) => ELIMU_Api.call(action, {})));
    const values = await Promise.all(results.map(async (result, index) => {
      if (result.status === "fulfilled") return result.value;
      if (!stores[index]) return null;
      return ELIMU_Storage.getAll(stores[index]).catch(() => []);
    }));
    const [classes, eleves, inscriptions, tarifs, paiements, frais, communiques, professeurs, salaires, config] = values;
    await ELIMU_Storage.replaceAll("classes", classes || []);
    await ELIMU_Storage.replaceAll("eleves", eleves || []);
    await ELIMU_Storage.replaceAll("inscriptions", inscriptions || []);
    await ELIMU_Storage.replaceAll("tarifs", tarifs || []);
    await ELIMU_Storage.replaceAll("paiements", paiements || []);
    await ELIMU_Storage.replaceAll("frais_connexes", frais || []);
    await ELIMU_Storage.replaceAll("communiques", communiques || []);
    await ELIMU_Storage.replaceAll("professeurs", professeurs || []);
    await ELIMU_Storage.replaceAll("salaires", salaires || []);
    if (config) await ELIMU_Storage.setMeta("school_config", config);
    await ELIMU_Storage.setMeta("last_sync", new Date().toISOString());
    this.notify();
    return true;
  },

  async fullSync() {
    const pushResult = await this.pushQueue();
    const pulled = await this.pullAll();
    return { pulled, ...pushResult };
  },

  async getStatus() {
    const lastSync = await ELIMU_Storage.getMeta("last_sync");
    const pending = await ELIMU_Storage.getPendingCount();
    return { online: ELIMU_Api.isOnline(), lastSync, pending };
  }
};

window.addEventListener("online", () => { ELIMU_Sync.fullSync().catch(() => {}); });

window.ELIMU_Sync = ELIMU_Sync;
