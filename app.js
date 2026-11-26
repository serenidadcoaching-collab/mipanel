// Mi Panel — sin dependencias de compilación. Datos en Supabase o en localStorage.
(() => {
  const MODULES = {
    emprendimiento: { label: "Emprendimiento", kinds: ["tarea", "hito", "idea", "contacto"] },
    tfm:            { label: "TFM",            kinds: ["capítulo", "entrega", "reunión", "tarea", "referencia"] },
    finanzas:       { label: "Finanzas",       kinds: ["gasto", "ingreso", "objetivo", "deuda"] },
  };
  const CHAPTER_STATUS = ["pendiente", "borrador", "revisión", "hecho"];

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);
  const num = (n) => new Intl.NumberFormat("es-ES").format(Math.round(n || 0));
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "";
  const daysUntil = (d) => Math.round((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000);
  const countdownText = (d) => {
    const n = daysUntil(d);
    if (n === 0) return "¡Es hoy!";
    if (n === 1) return "Mañana";
    if (n > 0) return `Faltan ${n} días`;
    return `Pasó hace ${-n} día${n === -1 ? "" : "s"}`;
  };

  // ---------- Almacenamiento ----------
  const cfg = window.PANEL_CONFIG || {};
  const sb = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;
  let user = null;

  const local = {
    key: "mipanel.entries",
    all() { return JSON.parse(localStorage.getItem(this.key) || "[]"); },
    save(rows) { localStorage.setItem(this.key, JSON.stringify(rows)); },
  };

  const store = {
    async list() {
      if (!sb) return local.all();
      const { data, error } = await sb.from("entries").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async add(row) {
      if (!sb) {
        local.save([{ ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...local.all()]);
        return;
      }
      const { error } = await sb.from("entries").insert(row);
      if (error) throw error;
    },
    async update(id, patch) {
      if (!sb) return local.save(local.all().map((r) => (r.id === id ? { ...r, ...patch } : r)));
      const { error } = await sb.from("entries").update(patch).eq("id", id);
      if (error) throw error;
    },
    async remove(id) {
      if (!sb) return local.save(local.all().filter((r) => r.id !== id));
      const { error } = await sb.from("entries").delete().eq("id", id);
      if (error) throw error;
    },
  };

  // ---------- Estado ----------
  let rows = [];
  let tab = "resumen";
  let editing = null; // id del elemento en edición
  const filter = { emprendimiento: "todo", tfm: "todo", finanzas: "todo" };

  async function refresh() {
    try { rows = await store.list(); } catch (e) { alert("Error leyendo datos: " + e.message); rows = []; }
    render();
  }
  const friendly = (e) => /target/.test(e.message || "")
    ? "Falta actualizar la base de datos: ejecuta en Supabase → SQL Editor la línea de supabase/update-tfm.sql"
    : e.message;
  const run = (p) => p.then(() => { editing = null; return refresh(); }).catch((e) => alert("Error: " + friendly(e)));

  // ---------- Autenticación (enlace mágico por email) ----------
  function renderAuth() {
    const box = $("#auth");
    if (!sb || !user) { box.innerHTML = ""; return; }
    box.innerHTML = `<span>${esc(user.email)}</span><button class="ghost" id="logout">Salir</button>`;
    $("#logout").onclick = () => sb.auth.signOut();
  }
  function renderLogin() {
    $("#view").innerHTML = `
      <div class="card" style="max-width:420px;margin:40px auto">
        <h3>Entrar</h3>
        <p>Te enviaremos un enlace de acceso a tu email (sin contraseña).</p>
        <form id="login" style="display:flex;gap:8px">
          <input type="email" name="email" required placeholder="tu@email.com" style="flex:1">
          <button class="primary">Enviar enlace</button>
        </form>
        <p class="n" id="loginMsg"></p>
      </div>`;
    $("#login").onsubmit = async (ev) => {
      ev.preventDefault();
      const email = ev.target.email.value.trim();
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      $("#loginMsg").textContent = error ? "Error: " + error.message : "Revisa tu correo y pulsa el enlace.";
    };
  }

  // ---------- Vistas ----------
  function render() {
    $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("#mode").textContent = sb ? "Datos guardados en Supabase (nube)" : "Modo local: los datos se guardan solo en este navegador. Configura Supabase en config.js para sincronizar.";
    renderAuth();
    if (sb && !user) return renderLogin();
    if (tab === "resumen") return renderSummary();
    renderModule(tab);
  }

  // --- Cálculos TFM ---
  const chapters = () => rows.filter((r) => r.module === "tfm" && r.kind === "capítulo")
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  const deliveries = () => rows.filter((r) => r.module === "tfm" && r.kind === "entrega" && r.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const nextDelivery = () => deliveries().find((r) => r.status !== "hecho" && daysUntil(r.due_date) >= 0);
  function wordTotals() {
    const ch = chapters();
    const written = ch.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const target = ch.reduce((s, r) => s + (Number(r.target) || 0), 0);
    return { written, target, pct: target ? Math.min(100, Math.round((written / target) * 100)) : 0, done: ch.filter((r) => r.status === "hecho").length, count: ch.length };
  }

  function monthTotals() {
    const m = today().slice(0, 7);
    let inc = 0, exp = 0;
    rows.filter((r) => r.module === "finanzas" && (r.due_date || r.created_at || "").slice(0, 7) === m).forEach((r) => {
      if (r.kind === "ingreso") inc += Number(r.amount) || 0;
      if (r.kind === "gasto") exp += Number(r.amount) || 0;
    });
    return { inc, exp, bal: inc - exp };
  }

  function renderSummary() {
    const { inc, exp, bal } = monthTotals();
    const w = wordTotals();
    const nd = nextDelivery();
    const pendEmp = rows.filter((r) => r.module === "emprendimiento" && ["tarea", "hito"].includes(r.kind) && r.status !== "hecho").length;
    const upcoming = rows
      .filter((r) => r.due_date && r.status !== "hecho" && r.due_date >= today() && r.module !== "finanzas")
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 8);

    $("#view").innerHTML = `
      <div class="grid">
        <div class="card"><h3>Balance del mes</h3><div class="big ${bal >= 0 ? "pos" : "neg"}">${eur(bal)}</div>
          <div class="n">Ingresos ${eur(inc)} · Gastos ${eur(exp)}</div></div>
        <div class="card"><h3>TFM · próxima entrega</h3>
          ${nd ? `<div class="big">${esc(countdownText(nd.due_date))}</div><div class="n">${esc(nd.title)} · ${fmtDate(nd.due_date)}</div>`
               : `<div class="big">—</div><div class="n">Añade tus entregas en la pestaña TFM</div>`}</div>
        <div class="card"><h3>TFM · palabras</h3><div class="big">${num(w.written)}${w.target ? `<span class="n"> / ${num(w.target)}</span>` : ""}</div>
          <div class="progress"><div style="width:${w.pct}%"></div></div>
          <div class="n">${w.done}/${w.count} capítulos terminados</div></div>
        <div class="card"><h3>Emprendimiento · pendientes</h3><div class="big">${pendEmp}</div>
          <div class="n">tareas e hitos abiertos</div></div>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Próximas fechas</h3>
        ${upcoming.length ? `<ul class="list">${upcoming.map((r) => `
          <li><span></span><div><span class="tag">${esc(MODULES[r.module].label)} · ${esc(r.kind)}</span><span class="t">${esc(r.title)}</span></div>
          <span class="meta">${fmtDate(r.due_date)}</span><span></span></li>`).join("")}</ul>`
          : `<p class="n">Nada con fecha próxima. Añade fechas a tus tareas para verlas aquí.</p>`}
      </div>`;
  }

  // --- Formulario de alta (campos según el tipo) ---
  const FIELD_HINTS = {
    "capítulo": { amount: "Palabras escritas", target: "Palabras objetivo", date: "Fecha límite (opcional)", notes: "Notas del capítulo" },
    "entrega":  { date: "Fecha de entrega", notes: "Qué hay que entregar, requisitos…", dateRequired: true },
    "reunión":  { date: "Fecha de la reunión", notes: "Qué se habló, acuerdos y próximos pasos" },
  };
  function addForm(mod) {
    const M = MODULES[mod];
    return `
      <form class="add" id="add">
        <select name="kind">${M.kinds.map((k) => `<option ${filter[mod] === k ? "selected" : ""}>${k}</option>`).join("")}</select>
        <input name="title" required placeholder="Título">
        <input name="amount" type="number" step="${mod === "finanzas" ? "0.01" : "1"}" min="0">
        <input name="target" type="number" step="1" min="0" placeholder="Objetivo">
        <input name="due_date" type="date" title="Fecha">
        <button class="primary">Añadir</button>
        <textarea name="notes" placeholder="Notas (opcional)"></textarea>
      </form>`;
  }
  function wireAddForm(mod) {
    const f = $("#add");
    const isFin = mod === "finanzas";
    const sync = () => {
      const h = FIELD_HINTS[f.kind.value] || {};
      const showAmount = isFin || f.kind.value === "capítulo";
      f.amount.hidden = !showAmount;
      f.amount.placeholder = isFin ? "Importe €" : h.amount || "";
      f.target.hidden = f.kind.value !== "capítulo";
      f.target.placeholder = h.target || "Objetivo";
      f.due_date.title = h.date || "Fecha";
      f.due_date.required = !!h.dateRequired;
      f.notes.placeholder = h.notes || "Notas (opcional)";
      f.title.placeholder = isFin ? "Concepto" : f.kind.value === "capítulo" ? "Nombre del capítulo" : f.kind.value === "entrega" ? "Ej.: Anteproyecto, Depósito, Defensa" : "Título";
    };
    f.kind.onchange = sync;
    sync();
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const kind = f.kind.value;
      const row = {
        module: mod, kind,
        title: f.title.value.trim(),
        notes: f.notes.value.trim() || null,
        amount: !f.amount.hidden && f.amount.value !== "" ? Number(f.amount.value) : null,
        due_date: f.due_date.value || (isFin ? today() : null),
        status: "pendiente",
      };
      if (!f.target.hidden && f.target.value !== "") row.target = Number(f.target.value);
      run(store.add(row));
    };
  }

  // --- Elemento genérico de lista (con edición) ---
  function itemHtml(r) {
    if (editing === r.id) return editHtml(r);
    const isFin = r.module === "finanzas";
    const meta = [
      isFin && r.amount != null ? eur(r.amount) : "",
      r.kind === "entrega" && r.due_date && r.status !== "hecho" ? countdownText(r.due_date) : "",
      fmtDate(r.due_date),
    ].filter(Boolean).join(" · ");
    return `
      <li class="${r.status === "hecho" ? "done" : ""}" data-id="${esc(r.id)}">
        <input type="checkbox" class="chk" ${r.status === "hecho" ? "checked" : ""}>
        <div><span class="tag">${esc(r.kind)}</span><span class="t">${esc(r.title)}</span>${r.notes ? `<div class="n">${esc(r.notes)}</div>` : ""}</div>
        <span class="meta">${esc(meta)}</span>
        <span class="acts"><button class="del edit" title="Editar">✎</button><button class="del rm" title="Borrar">✕</button></span>
      </li>`;
  }
  function editHtml(r) {
    const isFin = r.module === "finanzas";
    const isCh = r.kind === "capítulo";
    return `
      <li class="editing" data-id="${esc(r.id)}">
        <form class="edit-form">
          <input name="title" required value="${esc(r.title)}">
          ${isFin || isCh ? `<input name="amount" type="number" step="${isFin ? "0.01" : "1"}" min="0" value="${esc(r.amount ?? "")}" placeholder="${isFin ? "Importe €" : "Palabras escritas"}">` : ""}
          ${isCh ? `<input name="target" type="number" step="1" min="0" value="${esc(r.target ?? "")}" placeholder="Palabras objetivo">` : ""}
          <input name="due_date" type="date" value="${esc(r.due_date || "")}">
          <textarea name="notes" placeholder="Notas">${esc(r.notes || "")}</textarea>
          <div class="row"><button class="primary">Guardar</button><button type="button" class="ghost cancel">Cancelar</button></div>
        </form>
      </li>`;
  }
  function wireItems() {
    $$("ul.list li[data-id]").forEach((li) => {
      const id = li.dataset.id;
      const r = rows.find((x) => x.id === id);
      const form = li.querySelector("form.edit-form");
      if (form) {
        form.onsubmit = (ev) => {
          ev.preventDefault();
          const patch = { title: form.title.value.trim(), notes: form.notes.value.trim() || null, due_date: form.due_date.value || null };
          if (form.amount) patch.amount = form.amount.value === "" ? null : Number(form.amount.value);
          if (form.target) patch.target = form.target.value === "" ? null : Number(form.target.value);
          run(store.update(id, patch));
        };
        form.querySelector(".cancel").onclick = () => { editing = null; render(); };
        return;
      }
      const chk = li.querySelector(".chk");
      if (chk) chk.onchange = (e) => run(store.update(id, { status: e.target.checked ? "hecho" : "pendiente" }));
      const st = li.querySelector(".status");
      if (st) st.onchange = (e) => run(store.update(id, { status: e.target.value }));
      const words = li.querySelector(".words");
      if (words) words.onchange = (e) => run(store.update(id, { amount: e.target.value === "" ? null : Number(e.target.value) }));
      li.querySelector(".edit").onclick = () => { editing = id; render(); };
      li.querySelector(".rm").onclick = () => confirm(`¿Borrar «${r.title}»?`) && run(store.remove(id));
    });
  }

  // --- Módulos ---
  function renderModule(mod) {
    if (mod === "tfm") return renderTfm();
    const list = rows.filter((r) => r.module === mod && (filter[mod] === "todo" || r.kind === filter[mod]));
    $("#view").innerHTML = `
      ${addForm(mod)}
      ${chipsHtml(mod)}
      <ul class="list">${list.map(itemHtml).join("") || `<li><span></span><span class="n">Aún no hay nada aquí.</span></li>`}</ul>`;
    wireCommon(mod);
  }
  const chipsHtml = (mod) => `<div class="filters">${["todo", ...MODULES[mod].kinds]
    .map((k) => `<button class="chip ${filter[mod] === k ? "on" : ""}" data-k="${k}">${k}</button>`).join("")}</div>`;
  function wireCommon(mod) {
    wireAddForm(mod);
    $$(".chip").forEach((c) => (c.onclick = () => { filter[mod] = c.dataset.k; editing = null; render(); }));
    wireItems();
  }

  function renderTfm() {
    const w = wordTotals();
    const dels = deliveries();
    const ch = chapters();
    const others = rows.filter((r) => r.module === "tfm" && !["capítulo", "entrega"].includes(r.kind)
      && (filter.tfm === "todo" || r.kind === filter.tfm))
      .sort((a, b) => a.kind === "reunión" && b.kind === "reunión" ? (b.due_date || "").localeCompare(a.due_date || "") : 0);
    const showCh = ["todo", "capítulo"].includes(filter.tfm);
    const showDel = ["todo", "entrega"].includes(filter.tfm);
    const showOthers = filter.tfm !== "capítulo" && filter.tfm !== "entrega";

    const chapterRow = (r) => {
      if (editing === r.id) return editHtml(r);
      const pct = r.target ? Math.min(100, Math.round(((Number(r.amount) || 0) / r.target) * 100)) : null;
      return `
        <li class="chapter ${r.status === "hecho" ? "done" : ""}" data-id="${esc(r.id)}">
          <select class="status st-${esc(r.status)}">${CHAPTER_STATUS.map((s) => `<option ${r.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          <div>
            <span class="t">${esc(r.title)}</span>${r.due_date ? `<span class="meta"> · ${fmtDate(r.due_date)}</span>` : ""}
            ${pct != null ? `<div class="progress sm"><div style="width:${pct}%"></div></div>` : ""}
            ${r.notes ? `<div class="n">${esc(r.notes)}</div>` : ""}
          </div>
          <span class="meta wordbox"><input class="words" type="number" min="0" step="1" value="${esc(r.amount ?? "")}" placeholder="0" title="Palabras escritas"> / ${r.target ? num(r.target) : "—"}</span>
          <span class="acts"><button class="del edit" title="Editar">✎</button><button class="del rm" title="Borrar">✕</button></span>
        </li>`;
    };

    $("#view").innerHTML = `
      <div class="grid">
        ${dels.filter((r) => r.status !== "hecho").slice(0, 3).map((r) => {
          const n = daysUntil(r.due_date);
          return `<div class="card ${n < 0 ? "late" : n <= 14 ? "soon" : ""}"><h3>Entrega · ${esc(r.title)}</h3>
            <div class="big">${esc(countdownText(r.due_date))}</div><div class="n">${fmtDate(r.due_date)}</div></div>`;
        }).join("") || `<div class="card"><h3>Entregas</h3><div class="n">Añade tus fechas clave (anteproyecto, depósito, defensa) eligiendo el tipo <b>entrega</b>.</div></div>`}
        <div class="card"><h3>Palabras escritas</h3>
          <div class="big">${num(w.written)}${w.target ? `<span class="n"> / ${num(w.target)} (${w.pct}%)</span>` : ""}</div>
          <div class="progress"><div style="width:${w.pct}%"></div></div>
          <div class="n">${w.done}/${w.count} capítulos terminados</div></div>
      </div>
      ${addForm("tfm")}
      ${chipsHtml("tfm")}
      ${showDel && dels.length ? `<h2 class="sec">Entregas</h2><ul class="list">${dels.map(itemHtml).join("")}</ul>` : ""}
      ${showCh ? `<h2 class="sec">Capítulos</h2>${ch.length ? `<ul class="list">${ch.map(chapterRow).join("")}</ul>`
        : `<p class="n">Añade los capítulos de tu índice con el tipo <b>capítulo</b> y sus palabras objetivo.</p>`}` : ""}
      ${showOthers && others.length ? `<h2 class="sec">${filter.tfm === "todo" ? "Reuniones, tareas y referencias" : esc(filter.tfm)}</h2>
        <ul class="list">${others.map(itemHtml).join("")}</ul>` : ""}
      ${showOthers && !others.length && filter.tfm !== "todo" ? `<p class="n">Aún no hay nada aquí.</p>` : ""}`;
    wireCommon("tfm");
  }

  // ---------- Arranque ----------
  $$("#tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; editing = null; render(); }));

  if (sb) {
    sb.auth.getSession().then(({ data }) => { user = data.session?.user || null; user ? refresh() : render(); });
    sb.auth.onAuthStateChange((_e, session) => { user = session?.user || null; user ? refresh() : render(); });
  } else {
    refresh();
  }
})();
