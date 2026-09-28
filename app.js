// app.js — Gestionnaire
// SPA vanilla JS, routage par hash, rendu par templates, IndexedDB comme source locale,
// file d'attente + sync.js pour la synchronisation avec Apps Script / Google Sheets.

const App = {
  state: { profRecherche: "",
    classes: [], eleves: [], inscriptions: [], tarifs: [], paiements: [],
    fraisConnexes: [], communiques: [], professeurs: [], salaires: [], schoolConfig: {}, route: "dashboard",
    recouvrementSeuil: 0, recouvrementFiltre: "insolvables", recouvrementRecherche: "", recouvrementClasse: "", filtreCategorie: "", filtreNiveau: "", filtreClasse: ""
  },

  async init() {
    this.wireGlobalEvents();
    await this.loadLocal();
    if (!(await this.ensureManagerAccess())) return;
    this.render();
    if (navigator.onLine) this.syncNow(true);
    setInterval(() => { this.refreshStatusPill(); if (navigator.onLine) this.syncNow(true); }, 30000);
    window.addEventListener("online", () => this.syncNow(true));
    document.addEventListener("visibilitychange", () => { if (!document.hidden && navigator.onLine) this.syncNow(true); });
  },

  async ensureManagerAccess() {
    const expected = window.ELIMU_normalizeAccessCode(this.state.schoolConfig.identification_number);
    const saved = window.ELIMU_normalizeAccessCode(window.ELIMU_getManagerAccessCode());
    if (expected && saved === expected) return true;
    this.renderAccessGate();
    return false;
  },

  renderAccessGate(message) {
    const name = this.state.schoolConfig.school_name || "Etablissement scolaire";
    const app = document.getElementById("app");
    app.innerHTML = '<div class="access-gate"><div class="access-panel">' +
      '<img src="./assets/school-logo.png" alt="Logo">' +
      '<h2>Accès gestionnaire</h2><p>' + name + '</p>' +
      '<div id="access-error" class="err-box ' + (message ? "" : "hidden") + '">' + (message || "") + '</div>' +
      '<label for="manager-access-code">Code d’accès</label>' +
      '<input id="manager-access-code" type="password" autocomplete="off" placeholder="Entrez votre code">' +
      '<button class="access-submit" onclick="App.submitManagerAccess()">Accéder</button>' +
      '</div></div>';
    const tabbar = document.getElementById("tabbar");
    if (tabbar) tabbar.innerHTML = "";
    setTimeout(() => document.getElementById("manager-access-code")?.focus(), 0);
  },

  async submitManagerAccess() {
    const input = document.getElementById("manager-access-code");
    const code = window.ELIMU_normalizeAccessCode(input ? input.value : "");
    const error = document.getElementById("access-error");
    if (!code) {
      if (error) { error.textContent = "Veuillez saisir le code d’accès."; error.classList.remove("hidden"); }
      return;
    }
    let config = this.state.schoolConfig || {};
    let expected = window.ELIMU_normalizeAccessCode(config.identification_number);
    if (!expected && navigator.onLine) {
      try {
        config = await ELIMU_Api.call("getConfig", {});
        if (config) { this.state.schoolConfig = config; await ELIMU_Storage.setMeta("school_config", config); }
        expected = window.ELIMU_normalizeAccessCode(config && config.identification_number);
      } catch (e) {}
    }
    if (!expected) {
      if (error) {
        error.textContent = navigator.onLine ? "Configuration de l’établissement indisponible." : "Connectez-vous une première fois pour activer l’accès.";
        error.classList.remove("hidden");
      }
      return;
    }
    if (code !== expected) {
      if (error) { error.textContent = "Code d’accès incorrect."; error.classList.remove("hidden"); }
      return;
    }
    window.ELIMU_setManagerAccessCode(code);
    this.render();
    if (navigator.onLine) this.syncNow(true);
  },

  async loadLocal() {
    const s = this.state;
    [s.classes, s.eleves, s.inscriptions, s.tarifs, s.paiements, s.fraisConnexes, s.communiques, s.professeurs, s.salaires] = await Promise.all([
      ELIMU_Storage.getAll("classes"), ELIMU_Storage.getAll("eleves"), ELIMU_Storage.getAll("inscriptions"),
      ELIMU_Storage.getAll("tarifs"), ELIMU_Storage.getAll("paiements"), ELIMU_Storage.getAll("frais_connexes"),
      ELIMU_Storage.getAll("communiques"), ELIMU_Storage.getAll("professeurs"), ELIMU_Storage.getAll("salaires")
    ]);
    s.schoolConfig = (await ELIMU_Storage.getMeta("school_config")) || {};
  },

  applyBranding() {
    const cfg = this.state.schoolConfig || {};
    const name = cfg.school_name || "Etablissement scolaire";
    document.title = name + " - Gestion";
    const title = document.getElementById("school-name");
    if (title) title.textContent = name;
    const primary = cfg.primary_color || "#1a3d7c";
    const secondary = cfg.secondary_color || "#c99a2e";
    document.documentElement.style.setProperty("--primary", primary);
    document.documentElement.style.setProperty("--secondary", secondary);
  },

  async syncNow(silent) {
    const btns = document.querySelectorAll(".btn-sync");
    btns.forEach((b) => (b.disabled = true));
    try {
      const r = await ELIMU_Sync.fullSync();
      await this.loadLocal();
      if (!silent) {
        this.render();
        this.toast(r.pulled ? "Synchronisation reussie" : "Hors connexion");
      }
    } catch (e) {
      if (!silent) this.toast("Erreur de synchronisation: " + e.message);
    } finally {
      btns.forEach((b) => (b.disabled = false));
      this.refreshStatusPill();
    }
  },

  async refreshStatusPill() {
    const st = await ELIMU_Sync.getStatus();
    const pill = document.getElementById("status-pill");
    if (!pill) return;
    pill.className = "status-pill " + (st.online ? "online" : "offline");
    const last = st.lastSync ? new Date(st.lastSync).toLocaleString("fr-FR") : "jamais";
    pill.textContent = (st.online ? "En ligne" : "Hors ligne") + " · " + st.pending + " en attente";
    pill.title = "Derniere sync: " + last;
  },

  toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  },

  wireGlobalEvents() {
    window.addEventListener("hashchange", () => { this.render(); if (this.state.route === "eleve" && navigator.onLine) this.syncNow(true); });
    window.addEventListener("online", () => this.refreshStatusPill());
    window.addEventListener("offline", () => this.refreshStatusPill());
    document.addEventListener("click", (e) => {
      const syncBtn = e.target.closest(".btn-sync");
      if (syncBtn) this.syncNow(false);
    });
  },

  // ---------- Helpers metier ----------
  activeClasses() { return this.state.classes.filter((c) => c.active === true || c.active === 1 || c.active === "1" || c.active === "TRUE" || c.active === "VRAI"); },

  classById(id) { return this.state.classes.find((c) => c.id === id); },

  eleveInscriptionActive(eleveId) {
    return this.state.inscriptions.find((i) => i.eleve_id === eleveId && i.statut === "ACTIF");
  },

  soldeEleve(eleveId) {
    const insc = this.eleveInscriptionActive(eleveId);
    if (!insc) return { du: 0, paye: 0, solde: 0, classe: null };
    const tarif = this.state.tarifs.find((t) => t.classe_id === insc.classe_id && (t.actif === true || t.actif === 1 || t.actif === "1" || t.actif === "TRUE" || t.actif === "VRAI"));
    const du = tarif ? Number(tarif.montant_annuel || 0) : 0;
    const paye = this.state.paiements
      .filter((p) => p.eleve_id === eleveId && p.statut !== "ANNULE")
      .reduce((sum, p) => {
        if (p.operation === "CANCELLATION") return sum;
        if (p.operation === "CORRECTION") return sum + Number(p.montant || 0);
        return sum + Number(p.montant || 0);
      }, 0);
    return { du, paye, solde: du - paye, classe: this.classById(insc.classe_id) };
  },

  isInsolvable(eleveId, seuil) {
    const { paye } = this.soldeEleve(eleveId);
    return paye < (seuil || 0);
  },

  isEnOrdre(eleveId) {
    return this.soldeEleve(eleveId).paye >= this.state.recouvrementSeuil;
  },

  fmt(n) { return Number(n || 0).toLocaleString("fr-FR") + " " + (this.state.schoolConfig.currency || "USD"); },

  // ---------- Routage ----------
  render() {
    const hash = location.hash.replace("#", "") || "dashboard";
    this.state.route = hash.split("/")[0];
    document.getElementById("app").innerHTML = this.renderRoute();
    this.renderTabbar();
    this.refreshStatusPill();
    this.wireRouteEvents();
    this.applyBranding();
  },

  renderRoute() {
    switch (this.state.route) {
      case "dashboard": return this.viewDashboard();
      case "classes": return this.viewClasses();
      case "professeurs": return this.viewProfesseurs();
      case "eleve": return this.viewEleveDetail(location.hash.split("/")[1]);
      case "paiements": return this.viewPaiements();
      case "recouvrement": return this.viewRecouvrement();
      case "communiques": return this.viewCommuniques();
      case "config": return this.viewConfig();
      default: return this.viewDashboard();
    }
  },

  renderTabbar() {
    const tabs = [
      ["dashboard", "📊", "Accueil"], ["classes", "🏫", "Classes"], ["professeurs", "👩‍🏫", "Professeurs"], ["paiements", "💳", "Paiements"],
      ["recouvrement", "📋", "Recouvr."], ["communiques", "📣", "Annonces"], ["config", "⚙️", "Config"]
    ];
    const nav = document.getElementById("tabbar");
    nav.innerHTML = tabs.map(([id, icon, label]) =>
      `<button class="${this.state.route === id ? "active" : ""}" onclick="location.hash='${id}'">
         <span class="tab-icon">${icon}</span>${label}
       </button>`).join("");
  },

  wireRouteEvents() { /* les evenements sont attaches inline via onclick pour simplicite hors-ligne */ },

  // ---------- Vue: Dashboard ----------
  viewDashboard() {
    const s = this.state;
    const totalEleves = s.eleves.filter((e) => e.statut === "ACTIF").length;
    const totalClasses = this.activeClasses().length;
    const totalEncaisse = s.paiements
      .filter((p) => p.operation !== "CANCELLATION" && p.statut !== "ANNULE")
      .reduce((sum, p) => sum + Number(p.montant || 0), 0);
    const insolvables = s.eleves.filter((e) => e.statut === "ACTIF" && this.isInsolvable(e.id, s.recouvrementSeuil)).length;
    const derniersPaiements = this.dashboardPayments();

    return `
      <div class="card">
        <h2>${s.schoolConfig.school_name || "Ecole"}</h2>
        <div class="grid">
          <div class="stat"><div class="n">${totalEleves}</div><div class="l">Eleves actifs</div></div>
          <div class="stat"><div class="n">${totalClasses}</div><div class="l">Classes actives</div></div>
          <div class="stat"><div class="n">${this.fmt(totalEncaisse)}</div><div class="l">Total encaisse</div></div>
          <div class="stat"><div class="n">${insolvables}</div><div class="l">Insolvables</div></div>
        </div>
      </div>
      <div class="card">
        <label>Filtrer par dates</label>
        <div class="row">
          <input type="date" id="db-from" value="${this.state.dashboardFrom || ""}"><input type="date" id="db-to" value="${this.state.dashboardTo || ""}">
          <button class="secondary" onclick="App.filterDashboard()">Filtrer</button>
        </div>
        <div class="row" style="margin-top:8px">
          <select id="db-cat" onchange="App.filterDashboard()"><option value="">Toutes categories</option>${this.optionsCategories(this.state.filtreCategorie)}</select>
          <select id="db-niv" onchange="App.filterDashboard()"><option value="">Tous niveaux</option>${this.optionsNiveaux(this.state.filtreNiveau)}</select>
          <select id="db-classe" onchange="App.filterDashboard()"><option value="">Toutes classes</option>${this.optionsClasses(this.state.filtreClasse)}</select>
        </div>
      </div>
      <div class="card">
        <h2>10 derniers paiements</h2>
        ${derniersPaiements.length ? derniersPaiements.map((p) => this.paiementRow(p)).join("") : `<div class="empty">Aucun paiement</div>`}
      </div>
      <div class="card">
        <h2>10 derniers recus</h2>
        ${derniersPaiements.length ? derniersPaiements.map((p) => `
          <div class="list-item">
            <div>${this.eleveNom(p.eleve_id)}<div class="meta">${p.reference || p.id}</div></div>
            <button class="secondary icon" onclick="App.showReceipt('${p.id}')">Voir</button>
          </div>`).join("") : `<div class="empty">Aucun recu</div>`}
      </div>`;
  },

  dashboardPayments() {
    const s = this.state;
    const from = s.dashboardFrom ? new Date(s.dashboardFrom + "T00:00:00") : null;
    const to = s.dashboardTo ? new Date(s.dashboardTo + "T23:59:59.999") : null;
    return [...s.paiements]
      .filter((p) => p.operation === "PAYMENT")
      .filter((p) => {
        const date = new Date(p.date_paiement || p.created_at);
        return (!from || date >= from) && (!to || date <= to);
      })
      .filter((p) => {
        const insc = this.eleveInscriptionActive(p.eleve_id);
        const classe = insc ? this.classById(insc.classe_id) : null;
        return (!s.filtreCategorie || (classe && classe.categorie === s.filtreCategorie))
          && (!s.filtreNiveau || (classe && classe.niveau === s.filtreNiveau))
          && (!s.filtreClasse || (classe && classe.id === s.filtreClasse));
      })
      .sort((a, b) => new Date(b.date_paiement || b.created_at) - new Date(a.date_paiement || a.created_at))
      .slice(0, 10);
  },

  filterDashboard() {
    this.state.dashboardFrom = document.getElementById("db-from")?.value || "";
    this.state.dashboardTo = document.getElementById("db-to")?.value || "";
    this.state.filtreCategorie = document.getElementById("db-cat")?.value || "";
    this.state.filtreNiveau = document.getElementById("db-niv")?.value || "";
    this.state.filtreClasse = document.getElementById("db-classe")?.value || "";
    this.render();
    this.toast("Filtre applique");
  },

  optionsCategories(selected) { return [...new Set(this.activeClasses().map((c) => c.categorie))].map((c) => `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`).join(""); },
  optionsNiveaux(selected) { return [...new Set(this.activeClasses().map((c) => c.niveau))].map((c) => `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`).join(""); },
  optionsClasses(selected) { return this.activeClasses().map((c) => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${c.nom}</option>`).join(""); },

  eleveNom(id) { const e = this.state.eleves.find((x) => x.id === id); return e ? `${e.nom} ${e.postnom || ""} ${e.prenom || ""}`.trim() : id; },

  paiementRow(p) {
    return `<div class="list-item">
      <div>${this.eleveNom(p.eleve_id)}<div class="meta">${p.type_frais} · ${new Date(p.date_paiement || p.created_at).toLocaleDateString("fr-FR")}</div></div>
      <div class="badge">${this.fmt(p.montant)}</div>
    </div>`;
  },

  // ---------- Vue: Professeurs / Salaires ----------
  viewProfesseurs() {
    const query = (this.state.profRecherche || "").toLowerCase();
    const professeurs = this.state.professeurs.filter((p) => !query || `${p.id} ${p.nom} ${p.telephone}`.toLowerCase().includes(query));
    return `<div class="card searchbar"><input type="search" placeholder="Rechercher un professeur..." value="${this.state.profRecherche || ""}" oninput="App.searchProfesseurs(this.value)"></div><div class="card"><h2>Professeurs</h2>${professeurs.length ? professeurs.map((p) => { const salaires = this.state.salaires.filter((s) => s.professeur_id === p.id); const total = salaires.reduce((sum, s) => sum + Number(s.montant_paye || 0), 0); return `<div class="list-item" style="cursor:pointer" onclick="App.openProfesseurDetail('${p.id}')"><div><strong>${p.nom}</strong><div class="meta">${p.id} · ${p.telephone || "-"}</div><div class="meta">Total verse: ${this.fmt(total)} · ${salaires.length} versement(s)</div></div><button class="ok" onclick="event.stopPropagation();App.openSalaryForm('${p.id}')">Verser salaire</button></div>`; }).join("") : `<div class="empty">Aucun professeur</div>`}</div>`;
  },
  searchProfesseurs(q) { this.state.profRecherche = q || ""; this.render(); },
  openProfesseurDetail(professeurId) {
    const p = this.state.professeurs.find((x) => x.id === professeurId);
    if (!p) return;
    const salaires = this.state.salaires.filter((s) => s.professeur_id === professeurId).sort((a, b) => new Date(b.date_paiement || b.created_at) - new Date(a.date_paiement || a.created_at));
    const total = salaires.reduce((sum, s) => sum + Number(s.montant_paye || 0), 0);
    this.openModal(`<button class="close-x" onclick="App.closeModal()">✕</button>
      <h3>${p.nom}</h3>
      <div class="meta">Identifiant : ${p.id}</div>
      <div class="meta">Téléphone : ${p.telephone || "-"}</div>
      <div class="stat" style="margin-top:12px"><div class="n">${this.fmt(total)}</div><div class="l">Total versé · ${salaires.length} versement(s)</div></div>
      <div class="form-actions"><button class="ok" onclick="App.openSalaryForm('${p.id}')">Verser salaire</button></div>
      <h3 style="margin-top:18px">Historique des paies</h3>
      ${salaires.length ? salaires.map((s) => `<div class="list-item"><div><strong>${s.periode || "Versement"}</strong><div class="meta">${s.date_paiement || s.created_at || ""} · ${s.mode || ""}${s.reference ? " · " + s.reference : ""}</div></div><span class="badge ok">${this.fmt(s.montant_paye)}</span></div>`).join("") : `<div class="empty">Aucun versement</div>`}`);
  },
  openSalaryForm(professeurId) { const p = this.state.professeurs.find((x) => x.id === professeurId); this.openModal(`<button class="close-x" onclick="App.closeModal()">✕</button><h3>Versement de salaire</h3><p class="meta">${p ? p.nom : professeurId}</p><div id="form-err"></div><label>Période</label><input id="sal-periode" placeholder="Septembre 2026"><label>Montant payé</label><input id="sal-montant" type="number" min="0" step="0.01"><label>Mode</label><select id="sal-mode"><option>ESPECES</option><option>BANQUE</option><option>MOBILE_MONEY</option><option>VIREMENT</option></select><label>Référence</label><input id="sal-ref"><div class="form-actions"><button class="secondary" onclick="App.closeModal()">Annuler</button><button id="sal-save" class="ok" onclick="App.saveSalary('${professeurId}')">Enregistrer</button></div>`); },
  async saveSalary(professeurId) {
    const btn = document.getElementById("sal-save");
    btn.disabled = true;
    try {
      const montant = Number(val("sal-montant"));
      if (!montant || montant <= 0) throw new Error("Montant invalide");
      const payload = {
        professeur_id: professeurId,
        periode: val("sal-periode"),
        montant_paye: montant,
        mode: val("sal-mode"),
        reference: val("sal-ref")
      };
      if (ELIMU_Api.isOnline()) {
        const saved = await ELIMU_Api.call("enregistrerSalaire", payload);
        if (saved && saved.id) await ELIMU_Storage.put("salaires", saved);
        await this.loadLocal();
        this.closeModal();
        this.render();
        this.toast("Versement enregistre");
      } else {
        await ELIMU_Storage.enqueue("enregistrerSalaire", payload);
        this.closeModal();
        this.render();
        this.toast("Versement mis en attente; synchronisation automatique au retour du reseau");
      }
    } catch (e) {
      document.getElementById("form-err").innerHTML = `<div class="err-box">${e.message}</div>`;
    } finally {
      btn.disabled = false;
    }
  },
  // ---------- Vue: Classes / Eleves ----------
  viewClasses() {
    const classes = this.activeClasses();
    return `
      <div class="card searchbar">
        <input type="search" placeholder="Rechercher un eleve (nom, matricule)..." oninput="App.searchEleves(this.value)">
        <div id="search-results"></div>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Classes actives</h2>
          <button onclick="App.openStudentForm()">+ Eleve</button>
        </div>
        ${classes.length ? classes.map((c) => this.classeRow(c)).join("") : `<div class="empty">Aucune classe active.</div>`}
      </div>`;
  },

  classeRow(c) {
    const count = this.state.inscriptions.filter((i) => i.classe_id === c.id && i.statut === "ACTIF").length;
    return `<div class="list-item" style="cursor:pointer" onclick="App.openClasseEleves('${c.id}')">
      <div>${c.nom}<div class="meta">${c.categorie} · ${c.niveau}${c.section ? " · " + c.section : ""}</div></div>
      <div class="badge">${count} eleve(s)</div>
    </div>`;
  },

  openClasseEleves(classeId) {
    const c = this.classById(classeId);
    const eleves = this.state.inscriptions.filter((i) => i.classe_id === classeId && i.statut === "ACTIF")
      .map((i) => this.state.eleves.find((e) => e.id === i.eleve_id)).filter(Boolean);
    this.openModal(`
      <h3>${c ? c.nom : ""}</h3>
      ${eleves.length ? eleves.map((e) => `
        <div class="list-item" style="cursor:pointer" onclick="App.closeModal();location.hash='eleve/${e.id}'">
          <div>${e.nom} ${e.postnom || ""} ${e.prenom || ""}<div class="meta">${e.matricule}</div></div>
          <span>›</span>
        </div>`).join("") : `<div class="empty">Aucun eleve</div>`}
    `);
  },

  searchEleves(q) {
    const box = document.getElementById("search-results");
    if (!q || q.length < 2) { box.innerHTML = `<div class="empty">Recherchez un élève pour afficher ses reçus.</div>`; return; }
    const qq = q.toLowerCase();
    const results = this.state.eleves.filter((e) => {
      const text = [e.nom, e.postnom, e.prenom, e.matricule, e.responsable_nom, e.responsable_telephone].filter(Boolean).join(" ").toLowerCase();
      return text.includes(qq);
    }).slice(0, 20);
    box.innerHTML = results.length ? results.map((e) => `
      <div class="list-item" style="cursor:pointer" onclick="location.hash='eleve/${e.id}'">
        <div>${e.nom} ${e.postnom || ""} ${e.prenom || ""}<div class="meta">${e.matricule} · Parent: ${e.responsable_nom || "-"} · ${e.responsable_telephone || "-"}</div><div class="meta">${this.state.paiements.filter((p) => p.eleve_id === e.id).length} reçu(s)</div></div><span>›</span>
      </div>`).join("") : `<div class="empty">Aucun resultat</div>`;
  },

  // ---------- Vue: Fiche eleve ----------
  viewEleveDetail(id) {
    const e = this.state.eleves.find((x) => x.id === id);
    if (!e) return `<div class="card empty">Eleve introuvable</div>`;
    const { du, paye, solde, classe } = this.soldeEleve(id);
    const historique = this.state.paiements.filter((p) => p.eleve_id === id).sort((a, b) => new Date(b.date_paiement || b.created_at) - new Date(a.date_paiement || a.created_at));
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between"><button class="secondary" onclick="history.back()">‹ Retour</button><button class="secondary btn-sync" onclick="App.refreshStudentDetail()">Synchroniser</button></div>
        <h2>${e.nom} ${e.postnom || ""} ${e.prenom || ""}</h2>
        <div class="meta">Matricule: ${e.matricule} · ${classe ? classe.nom : "Non affecte"}</div>
        <div class="meta">Responsable: ${e.responsable_nom || "-"} · ${e.responsable_telephone || "-"}</div>
        <div class="row" style="margin-top:10px">
          <button class="secondary" onclick="App.openStudentForm('${e.id}')">Modifier</button>
          <button class="secondary" onclick="App.openTransferForm('${e.id}')">Transferer</button>
          <button class="danger" onclick="App.openAbandonForm('${e.id}')">Abandon</button>
        </div>
      </div>
      <div class="card">
        <div class="grid">
          <div class="stat"><div class="n">${this.fmt(du)}</div><div class="l">Du</div></div>
          <div class="stat balance-paid"><div class="n">${this.fmt(paye)}</div><div class="l">Total deja paye</div></div>
          <div class="stat balance-due"><div class="n">${this.fmt(solde)}</div><div class="l">Solde restant</div></div>
        </div>
        <div class="form-actions">
          <button class="ok" onclick="App.openPaymentForm('${e.id}')">Enregistrer un paiement</button>
          <button class="secondary" onclick="App.downloadHistorique('${e.id}')">Telecharger historique</button>
        </div>
      </div>
      <div class="card">
        <h2>Historique des paiements</h2>
        ${historique.length ? historique.map((p) => {
          const operation = p.operation === "PAYMENT" && this.state.paiements.find((x) => x.paiement_original_id === p.id && (x.operation === "CORRECTION" || x.operation === "CANCELLATION"));
          return `<div class="list-item">
            <div>${p.type_frais} <span class="badge ${p.operation === "CANCELLATION" ? "danger" : p.operation === "CORRECTION" ? "warn" : "ok"}">${p.operation}</span>
              <div class="meta">${new Date(p.date_paiement || p.created_at).toLocaleString("fr-FR")} · ${p.mode || ""}${operation ? " · Operation deja enregistree" : ""}</div></div>
            <div class="row">
              <div class="badge">${this.fmt(p.montant)}</div>
              <button class="secondary icon" onclick="App.showReceipt('${p.id}')">Recu</button>
              ${p.operation === "PAYMENT" && !operation ? `<button class="secondary icon" onclick="App.openCorrectionForm('${p.id}')">Corriger</button><button class="danger icon" onclick="App.openCancellationForm('${p.id}')">Annuler</button>` : operation ? `<span class="badge ${operation.operation === "CANCELLATION" ? "danger" : "warn"}">${operation.operation === "CANCELLATION" ? "Annule" : "Corrige"}</span>` : ""}
            </div>
          </div>`;
        }).join("") : `<div class="empty">Aucun paiement</div>`}
      </div>`;
  },

  refreshStudentDetail() { this.syncNow(false); },

  downloadHistorique(eleveId) {
    const e = this.state.eleves.find((x) => x.id === eleveId);
    const rows = this.state.paiements.filter((p) => p.eleve_id === eleveId);
    const csv = ["date,type,operation,montant,mode,reference"].concat(
      rows.map((p) => [p.created_at, p.type_frais, p.operation, p.montant, p.mode, p.reference].join(","))
    ).join("\n");
    this.downloadFile(`historique_${e ? e.matricule : eleveId}.csv`, csv, "text/csv");
  },

  downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  },

  // ---------- Formulaires (modales) ----------
  openModal(html) {
    let bg = document.getElementById("modal-bg");
    if (!bg) {
      bg = document.createElement("div");
      bg.id = "modal-bg";
      bg.className = "modal-bg";
      bg.onclick = (e) => { if (e.target === bg) App.closeModal(); };
      document.body.appendChild(bg);
    }
    bg.innerHTML = `<div class="modal">${html}</div>`;
    bg.classList.remove("hidden");
  },

  closeModal() { const bg = document.getElementById("modal-bg"); if (bg) bg.classList.add("hidden"); },

  openStudentForm(id) {
    const e = id ? this.state.eleves.find((x) => x.id === id) : null;
    this.openModal(`
      <button class="close-x" onclick="App.closeModal()">✕</button>
      <h3>${e ? "Modifier eleve" : "Nouvel eleve"}</h3>
      <div id="form-err"></div>
      <label>Nom</label><input id="f-nom" value="${e ? e.nom : ""}">
      <label>Post-nom</label><input id="f-postnom" value="${e ? e.postnom || "" : ""}">
      <label>Prenom</label><input id="f-prenom" value="${e ? e.prenom || "" : ""}">
      <label>Sexe</label><select id="f-sexe"><option value="M" ${e && e.sexe === "M" ? "selected" : ""}>M</option><option value="F" ${e && e.sexe === "F" ? "selected" : ""}>F</option></select>
      <label>Date de naissance</label><input type="date" id="f-naissance" value="${e ? e.date_naissance || "" : ""}">
      <label>Responsable</label><input id="f-resp-nom" value="${e ? e.responsable_nom || "" : ""}">
      <label>Telephone responsable</label><input id="f-resp-tel" value="${e ? e.responsable_telephone || "" : ""}">
      <label>Classe</label><select id="f-classe">${this.optionsClasses(this.state.filtreClasse)}</select>
      <div class="form-actions">
        <button class="secondary" onclick="App.closeModal()">Annuler</button>
        <button id="f-save" onclick="App.saveStudent('${e ? e.id : ""}')">Enregistrer</button>
      </div>
    `);
  },

  async saveStudent(id) {
    const btn = document.getElementById("f-save");
    btn.disabled = true;
    try {
      const payload = {
        id: id || undefined,
        nom: val("f-nom"), postnom: val("f-postnom"), prenom: val("f-prenom"), sexe: val("f-sexe"),
        date_naissance: val("f-naissance"), responsable_nom: val("f-resp-nom"), responsable_telephone: val("f-resp-tel"),
        classe_id: val("f-classe")
      };
      if (!payload.nom) throw new Error("Le nom est obligatoire");
      const op = id ? "updateStudent" : "createStudent";
      if (ELIMU_Api.isOnline()) {
        await ELIMU_Api.call(op, payload);
        await this.syncNow(true);
      } else {
        await ELIMU_Storage.enqueue(op, payload);
        this.toast("Enregistre localement (hors ligne)");
      }
      this.closeModal();
      this.render();
    } catch (e) {
      document.getElementById("form-err").innerHTML = `<div class="err-box">${e.message}</div>`;
    } finally {
      btn.disabled = false;
    }
  },

  openTransferForm(eleveId) {
    this.openModal(`
      <button class="close-x" onclick="App.closeModal()">✕</button>
      <h3>Transferer l'eleve</h3>
      <div id="form-err"></div>
      <label>Nouvelle classe</label><select id="f-new-classe">${this.optionsClasses(this.state.filtreClasse)}</select>
      <div class="form-actions">
        <button class="secondary" onclick="App.closeModal()">Annuler</button>
        <button id="f-save" onclick="App.doTransfer('${eleveId}')">Confirmer</button>
      </div>`);
  },

  async doTransfer(eleveId) {
    const btn = document.getElementById("f-save"); btn.disabled = true;
    try {
      const payload = { eleve_id: eleveId, nouvelle_classe_id: val("f-new-classe") };
      if (ELIMU_Api.isOnline()) { await ELIMU_Api.call("transferStudent", payload); await this.syncNow(true); }
      else { await ELIMU_Storage.enqueue("transferStudent", payload); this.toast("En attente de synchronisation"); }
      this.closeModal(); this.render();
    } catch (e) { document.getElementById("form-err").innerHTML = `<div class="err-box">${e.message}</div>`; }
    finally { btn.disabled = false; }
  },

  openAbandonForm(eleveId) {
    this.openModal(`
      <button class="close-x" onclick="App.closeModal()">✕</button>
      <h3>Enregistrer un abandon</h3>
      <div id="form-err"></div>
      <label>Motif</label><textarea id="f-motif"></textarea>
      <div class="form-actions">
        <button class="secondary" onclick="App.closeModal()">Annuler</button>
        <button id="f-save" class="danger" onclick="App.doAbandon('${eleveId}')">Confirmer l'abandon</button>
      </div>`);
  },

  async doAbandon(eleveId) {
    const btn = document.getElementById("f-save"); btn.disabled = true;
    try {
      const payload = { eleve_id: eleveId, motif_sortie: val("f-motif") };
      if (ELIMU_Api.isOnline()) { await ELIMU_Api.call("abandonStudent", payload); await this.syncNow(true); }
      else { await ELIMU_Storage.enqueue("abandonStudent", payload); this.toast("En attente de synchronisation"); }
      this.closeModal(); location.hash = "classes";
    } catch (e) { document.getElementById("form-err").innerHTML = `<div class="err-box">${e.message}</div>`; }
    finally { btn.disabled = false; }
  },

  // ---------- Vue: Paiements ----------
  viewPaiements() {
    return `
      <div class="card searchbar">
        <input type="search" placeholder="Nom eleve, nom parent ou telephone..." oninput="App.searchEleves(this.value)">
        <div id="search-results"><div class="empty">Recherchez un élève pour afficher ses reçus.</div></div>
      </div>
      <div class="card">
        <h2>Reçus et historique</h2>
        <div class="meta">Sélectionnez un élève dans les résultats pour consulter ses reçus et gérer ses paiements.</div>
      </div>
      <div class="card">
        <h2>Frais connexes</h2>
        ${this.state.fraisConnexes.filter(f=>f.actif===true||f.actif==="TRUE").map((f) => `<span class="badge">${f.libelle}</span>`).join(" ") || `<div class="empty">Aucun frais connexe actif</div>`}
      </div>`;
  },

  openPaymentForm(eleveId) {
    const insc = this.eleveInscriptionActive(eleveId);
    this.openModal(`
      <button class="close-x" onclick="App.closeModal()">✕</button>
      <h3>Enregistrer un paiement</h3>
      <div id="form-err"></div>
      <label>Type de frais</label>
      <select id="f-type"><option value="SCOLARITE">Scolarite</option>${this.state.fraisConnexes.map((f) => `<option value="${f.libelle}">${f.libelle}</option>`).join("")}</select>
      <label>Montant</label><input type="number" id="f-montant" min="0" step="0.01">
      <label>Mode</label><select id="f-mode"><option>ESPECES</option><option>MOBILE_MONEY</option><option>VIREMENT</option></select>
      <label>Reference</label><input id="f-ref">
      <div class="form-actions">
        <button class="secondary" onclick="App.closeModal()">Annuler</button>
        <button id="f-save" class="ok" onclick="App.savePayment('${eleveId}','${insc ? insc.id : ""}')">Enregistrer</button>
      </div>`);
  },

  async savePayment(eleveId, inscriptionId) {
    const btn = document.getElementById("f-save"); btn.disabled = true;
    try {
      const montant = Number(val("f-montant"));
      if (!montant || montant <= 0) throw new Error("Montant invalide");
      const payload = {
        eleve_id: eleveId, inscription_id: inscriptionId, type_frais: val("f-type"),
        montant, devise: this.state.schoolConfig.currency || "USD", mode: val("f-mode"), reference: val("f-ref")
      };
      if (ELIMU_Api.isOnline()) { const saved = await ELIMU_Api.call("enregistrerPaiement", payload); if (saved && saved.id) await ELIMU_Storage.put("paiements", saved); await this.loadLocal(); this.toast("Paiement enregistre"); }
      else { await ELIMU_Storage.enqueue("enregistrerPaiement", payload); this.toast("En attente de synchronisation"); }
      this.closeModal(); this.render();
    } catch (e) { document.getElementById("form-err").innerHTML = `<div class="err-box">${e.message}</div>`; }
    finally { btn.disabled = false; }
  },

  openCorrectionForm(paiementId) {
    const p = this.state.paiements.find((x) => x.id === paiementId);
    this.openModal(`
      <button class="close-x" onclick="App.closeModal()">✕</button>
      <h3>Correction de paiement</h3>
      <div id="form-err"></div>
      <p class="meta">Paiement original: ${this.fmt(p.montant)} · ${p.type_frais}</p>
      <label>Nouveau montant corrige</label><input type="number" id="f-montant" value="${p.montant}">
      <label>Motif</label><textarea id="f-motif"></textarea>
      <div class="form-actions">
        <button class="secondary" onclick="App.closeModal()">Annuler</button>
        <button id="f-save" onclick="App.saveCorrection('${paiementId}')">Confirmer</button>
      </div>`);
  },

  async saveCorrection(paiementId) {
    const btn = document.getElementById("f-save"); btn.disabled = true;
    try {
      const payload = { paiement_original_id: paiementId, nouveau_montant: Number(val("f-montant")), motif: val("f-motif") };
      if (ELIMU_Api.isOnline()) { const saved = await ELIMU_Api.call("recordPaymentCorrection", payload); if (saved && saved.id) await ELIMU_Storage.put("paiements", saved); await this.loadLocal(); }
      else { await ELIMU_Storage.enqueue("recordPaymentCorrection", payload); this.toast("En attente de synchronisation"); }
      this.closeModal(); this.render();
    } catch (e) { document.getElementById("form-err").innerHTML = `<div class="err-box">${e.message}</div>`; }
    finally { btn.disabled = false; }
  },

  openCancellationForm(paiementId) {
    this.openModal(`
      <button class="close-x" onclick="App.closeModal()">✕</button>
      <h3>Annuler ce paiement</h3>
      <div id="form-err"></div>
      <label>Motif d'annulation</label><textarea id="f-motif"></textarea>
      <div class="form-actions">
        <button class="secondary" onclick="App.closeModal()">Annuler</button>
        <button id="f-save" class="danger" onclick="App.saveCancellation('${paiementId}')">Confirmer l'annulation</button>
      </div>`);
  },

  async saveCancellation(paiementId) {
    const btn = document.getElementById("f-save"); btn.disabled = true;
    try {
      const payload = { paiement_original_id: paiementId, motif: val("f-motif") };
      if (ELIMU_Api.isOnline()) { const saved = await ELIMU_Api.call("recordPaymentCancellation", payload); if (saved && saved.id) await ELIMU_Storage.put("paiements", saved); await this.loadLocal(); }
      else { await ELIMU_Storage.enqueue("recordPaymentCancellation", payload); this.toast("En attente de synchronisation"); }
      this.closeModal(); this.render();
    } catch (e) { document.getElementById("form-err").innerHTML = `<div class="err-box">${e.message}</div>`; }
    finally { btn.disabled = false; }
  },

  showReceipt(paiementId) {
    const p = this.state.paiements.find((x) => x.id === paiementId);
    if (!p) return;
    const e = this.state.eleves.find((x) => x.id === p.eleve_id);
    const { du, paye, solde, classe } = this.soldeEleve(p.eleve_id);
    const cfg = this.state.schoolConfig;
    this.openModal(`
      <button class="close-x" onclick="App.closeModal()">✕</button>
      <div class="receipt" id="receipt-print">
        <img class="receipt-watermark" src="./assets/school-logo.png" alt="">
        <div class="receipt-head">
          <img src="./assets/school-logo.png" onerror="this.style.display='none'">
          <div><h4>${cfg.school_name || "Ecole"}</h4><small>${cfg.school_status || ""} · ${cfg.approval_reference || ""}</small><br>
          <small>${cfg.address || ""} · ${cfg.phone || ""}</small></div>
        </div>
        <table>
          <tr><td class="lbl">N° recu</td><td>${p.id}</td></tr>
          <tr><td class="lbl">Eleve</td><td>${e ? e.nom + " " + (e.postnom||"") : ""}</td></tr>
          <tr><td class="lbl">Matricule</td><td>${e ? e.matricule : ""}</td></tr>
          <tr><td class="lbl">Parent</td><td>${e ? e.responsable_nom : ""} (${e ? e.responsable_telephone : ""})</td></tr>
          <tr><td class="lbl">Classe</td><td>${classe ? classe.nom : ""}</td></tr>
          <tr><td class="lbl">Type de frais</td><td>${p.type_frais}</td></tr>
          <tr class="receipt-paid-day"><td class="lbl">Paiement du jour</td><td>${this.fmt(p.montant)}</td></tr>
          <tr class="receipt-total-paid"><td class="lbl">Total deja paye</td><td>${this.fmt(paye)}</td></tr>
          <tr class="receipt-remaining"><td class="lbl">Solde restant</td><td>${this.fmt(solde)}</td></tr>
          <tr><td class="lbl">Mode</td><td>${p.mode || ""}</td></tr>
          <tr><td class="lbl">Reference</td><td>${p.reference || ""}</td></tr>
          <tr><td class="lbl">Date</td><td>${new Date(p.date_paiement || p.created_at).toLocaleString("fr-FR")}</td></tr>
          <tr><td class="lbl">Agent</td><td>${p.agent || ""}</td></tr>
        </table>
        <div class="sig"><span>Cachet</span><span>Signature</span></div>
      </div>
      <div class="form-actions">
        <button class="secondary" onclick="window.print()">Imprimer</button>
        <button onclick="App.closeModal()">Fermer</button>
      </div>`);
  },

  // ---------- Vue: Recouvrement ----------
  viewRecouvrement() {
    const eleves = this.recouvrementEleves();
    const mode = this.state.recouvrementFiltre || "insolvables";
    const insolvables = eleves.filter((e) => this.isInsolvable(e.id, this.state.recouvrementSeuil));
    return `
      <div class="card">
        <h2>Recouvrement</h2>
        <label>Seuil de recouvrement</label>
        <input type="number" id="rec-seuil" min="0" step="0.01" value="${this.state.recouvrementSeuil}" oninput="App.setSeuil(this.value)">
        <div class="row" style="margin-top:10px">
          <input type="search" id="rec-recherche" placeholder="Nom, matricule, parent ou telephone" value="${this.state.recouvrementRecherche || ""}" oninput="App.setRecouvrementRecherche(this.value)">
          <select id="rec-classe" onchange="App.setRecouvrementClasse(this.value)"><option value="">Toutes les classes</option>${this.optionsClasses(this.state.recouvrementClasse)}</select>
        </div>
        <div class="tag-row">
          <button id="rec-ins-count" class="tag-btn ${mode === "insolvables" ? "active" : ""}" onclick="App.filtreRecouvrement('insolvables')">Insolvables (${insolvables.length})</button>
          <button id="rec-solv-count" class="tag-btn ${mode === "solvables" ? "active" : ""}" onclick="App.filtreRecouvrement('solvables')">Solvables (${eleves.filter((e) => this.isEnOrdre(e.id)).length})</button>
        </div>
      </div>
      <div class="card" id="recouvrement-list">${this.recouvrementRows(mode)}</div>`;
  },

  recouvrementEleves() {
    const q = (this.state.recouvrementRecherche || "").trim().toLowerCase();
    return this.state.eleves.filter((e) => {
      if (e.statut !== "ACTIF") return false;
      const insc = this.eleveInscriptionActive(e.id);
      if (this.state.recouvrementClasse && (!insc || insc.classe_id !== this.state.recouvrementClasse)) return false;
      if (!q) return true;
      const text = [e.nom, e.postnom, e.prenom, e.matricule, e.responsable_nom, e.responsable_telephone].filter(Boolean).join(" ").toLowerCase();
      return text.includes(q);
    });
  },

  recouvrementRows(mode) {
    const eleves = this.recouvrementEleves();
    const list = mode === "insolvables"
      ? eleves.filter((e) => this.isInsolvable(e.id, this.state.recouvrementSeuil))
      : eleves.filter((e) => this.isEnOrdre(e.id));
    return list.length ? list.map((e) => {
      const { paye, solde, classe } = this.soldeEleve(e.id);
      return `<div class="list-item" style="cursor:pointer" onclick="location.hash='eleve/${e.id}'">
        <div>${e.nom} ${e.postnom || ""} ${e.prenom || ""}<div class="meta">${classe ? classe.nom : ""} · ${e.responsable_nom || "-"} · ${e.responsable_telephone || "-"}</div></div>
        <div class="right"><span class="badge ${mode === "insolvables" ? "danger" : "ok"}">${mode === "insolvables" ? "Pas en ordre" : "En ordre"}</span><div class="meta">Payé : ${this.fmt(paye)} · Restant : ${this.fmt(solde)}</div></div>
      </div>`;
    }).join("") : `<div class="empty">Aucun eleve dans ce filtre</div>`;
  },

  setSeuil(v) {
    this.state.recouvrementSeuil = Math.max(0, Number(v) || 0);
    const list = document.getElementById("recouvrement-list");
    if (list) list.innerHTML = this.recouvrementRows(this.state.recouvrementFiltre || "insolvables");
    const eleves = this.recouvrementEleves();
    const insolvables = eleves.filter((e) => this.isInsolvable(e.id, this.state.recouvrementSeuil)).length;
    const solvables = eleves.filter((e) => this.isEnOrdre(e.id)).length;
    const insCount = document.getElementById("rec-ins-count");
    const solCount = document.getElementById("rec-solv-count");
    if (insCount) insCount.textContent = `Insolvables (${insolvables})`;
    if (solCount) solCount.textContent = `Solvables (${solvables})`;
  },

  setRecouvrementRecherche(v) {
    this.state.recouvrementRecherche = v || "";
    const list = document.getElementById("recouvrement-list");
    if (list) list.innerHTML = this.recouvrementRows(this.state.recouvrementFiltre || "insolvables");
  },

  setRecouvrementClasse(v) {
    this.state.recouvrementClasse = v || "";
    this.render();
  },

  filtreRecouvrement(mode) {
    this.state.recouvrementFiltre = mode;
    this.render();
  },
  // ---------- Vue: Communiques ----------
  viewCommuniques() {
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">Communiques</h2>
          <button onclick="App.openCommuniqueForm()">+ Publier</button></div>
        ${this.state.communiques.length ? this.state.communiques
          .sort((a, b) => new Date(b.date_envoi) - new Date(a.date_envoi))
          .map((c) => `
          <div class="list-item">
            <div>${c.titre}<div class="meta">${c.audience}${c.classe_id ? " · " + (this.classById(c.classe_id)||{}).nom : ""} · ${new Date(c.date_envoi).toLocaleDateString("fr-FR")}</div></div>
            <div class="row">
              <button class="secondary icon" onclick="App.openCommuniqueForm('${c.id}')">✎</button>
              <button class="danger icon" onclick="App.deleteCommunique('${c.id}')">🗑</button>
            </div>
          </div>`).join("") : `<div class="empty">Aucun communique</div>`}
      </div>`;
  },

  openCommuniqueForm(id) {
    const c = id ? this.state.communiques.find((x) => x.id === id) : null;
    this.openModal(`
      <button class="close-x" onclick="App.closeModal()">✕</button>
      <h3>${c ? "Modifier" : "Publier"} un communique</h3>
      <div id="form-err"></div>
      <label>Titre</label><input id="f-titre" value="${c ? c.titre : ""}">
      <label>Message</label><textarea id="f-message">${c ? c.message : ""}</textarea>
      <label>Audience</label>
      <select id="f-audience" onchange="document.getElementById('f-classe-wrap').classList.toggle('hidden', this.value!=='CLASSE')">
        <option value="TOUS" ${c && c.audience === "TOUS" ? "selected" : ""}>Tous les parents</option>
        <option value="INSOLVABLES" ${c && c.audience === "INSOLVABLES" ? "selected" : ""}>Parents a recuperer</option>
        <option value="CLASSE" ${c && c.audience === "CLASSE" ? "selected" : ""}>Classe precise</option>
      </select>
      <div id="f-classe-wrap" class="${c && c.audience === "CLASSE" ? "" : "hidden"}">
        <label>Classe</label><select id="f-classe">${this.optionsClasses(this.state.filtreClasse)}</select>
      </div>
      <div class="form-actions">
        <button class="secondary" onclick="App.closeModal()">Annuler</button>
        <button id="f-save" onclick="App.saveCommunique('${c ? c.id : ""}')">Publier</button>
      </div>`);
  },

  async saveCommunique(id) {
    const btn = document.getElementById("f-save"); btn.disabled = true;
    try {
      const payload = { id: id || undefined, titre: val("f-titre"), message: val("f-message"), audience: val("f-audience"), classe_id: val("f-audience") === "CLASSE" ? val("f-classe") : "" };
      if (!payload.titre) throw new Error("Titre requis");
      const op = "upsertAnnouncement";
      if (ELIMU_Api.isOnline()) { await ELIMU_Api.call(op, payload); await this.syncNow(true); }
      else { await ELIMU_Storage.enqueue(op, payload); this.toast("En attente de synchronisation"); }
      this.closeModal(); this.render();
    } catch (e) { document.getElementById("form-err").innerHTML = `<div class="err-box">${e.message}</div>`; }
    finally { btn.disabled = false; }
  },

  async deleteCommunique(id) {
    if (!confirm("Supprimer ce communique ?")) return;
    try {
      if (ELIMU_Api.isOnline()) { await ELIMU_Api.call("deleteAnnouncement", { id }); await this.syncNow(true); }
      else { await ELIMU_Storage.enqueue("deleteAnnouncement", { id }); this.toast("En attente de synchronisation"); }
      this.render();
    } catch (e) { this.toast(e.message); }
  },

  // ---------- Vue: Configuration ----------
  viewConfig() {
    const url = window.ELIMU_getAppsScriptUrl();
    return `
      <div class="card">
        <h2>Configuration</h2>
        <label>Adresse de connexion</label>
        <input id="cfg-url" value="${url && url.indexOf("A_REMPLACER") === -1 ? url : ""}" placeholder="Adresse du service">
        <div class="form-actions"><button onclick="App.saveUrl()">Enregistrer</button></div>
      </div>
      <div class="card">
        <h2>Synchronisation</h2>
        <button class="btn-sync ok">Synchroniser maintenant</button>
      </div>
      <div class="card">
        <h2>A propos</h2>
        <div class="meta">Signature de marque : ELIMU · ecole : ${this.state.schoolConfig.school_name || "-"}</div>
      </div>`;
  },

  saveUrl() {
    const u = val("cfg-url");
    if (!u) return this.toast("URL vide");
    window.ELIMU_setAppsScriptUrl(u);
    this.toast("URL enregistree");
    this.syncNow(false);
  }
};

function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ""; }

window.App = App;
document.addEventListener("DOMContentLoaded", () => App.init());
