// Mi Panel — sin dependencias de compilación. Datos en Supabase o en localStorage.
(() => {
  const MODULES = {
    emprendimiento: { label: "Emprendimiento", kinds: ["tarea", "hito", "idea", "contacto"] },
    tfm:            { label: "TFM",            kinds: ["capítulo", "tarea", "referencia", "reunión"] },
    finanzas:       { label: "Finanzas",       kinds: ["gasto", "ingreso", "objetivo", "deuda"] },
  };
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);
  const today = () => new Date().toISOString().slice(0, 10);

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
        const r = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        local.save([r, ...local.all()]);
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
  const filter = { emprendimiento: "todo", tfm: "todo", finanzas: "todo" };

  async function refresh() {
    try { rows = await store.list(); } catch (e) { alert("Error leyendo datos: " + e.message); rows = []; }
    render();
  }
  const run = (p) => p.then(refresh).catch((e) => alert("Error: " + e.message));

  // ---------- Autenticación (enlace mágico por email) ----------
  function renderAuth() {
    const box = $("#auth");
    if (!sb) { box.innerHTML = ""; return; }
    if (user) {
      box.innerHTML = `<span>${esc(user.email)}</span><button class="ghost" id="logout">Salir</button>`;
      $("#logout").onclick = () => sb.auth.signOut();
    } else {
      box.innerHTML = "";
    }
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
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("#mode").textContent = sb ? "Datos guardados en Supabase (nube)" : "Modo local: los datos se guardan solo en este navegador. Configura Supabase en config.js para sincronizar.";
    renderAuth();
    if (sb && !user) return renderLogin();
    if (tab === "resumen") return renderSummary();
    renderModule(tab);
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
    const tfmCh = rows.filter((r) => r.module === "tfm" && r.kind === "capítulo");
    const tfmDone = tfmCh.filter((r) => r.status === "hecho").length;
    const pct = tfmCh.length ? Math.round((tfmDone / tfmCh.length) * 100) : 0;
    const pendEmp = rows.filter((r) => r.module === "emprendimiento" && ["tarea", "hito"].includes(r.kind) && r.status !== "hecho").length;
    const upcoming = rows
      .filter((r) => r.due_date && r.status !== "hecho" && r.due_date >= today() && r.module !== "finanzas")
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 8);

    $("#view").innerHTML = `
      <div class="grid">
        <div class="card"><h3>Balance del mes</h3><div class="big ${bal >= 0 ? "pos" : "neg"}">${eur(bal)}</div>
          <div class="n">Ingresos ${eur(inc)} · Gastos ${eur(exp)}</div></div>
        <div class="card"><h3>TFM · capítulos terminados</h3><div class="big">${tfmDone}/${tfmCh.length}</div>
          <div class="progress"><div style="width:${pct}%"></div></div></div>
        <div class="card"><h3>Emprendimiento · pendientes</h3><div class="big">${pendEmp}</div>
          <div class="n">tareas e hitos abiertos</div></div>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Próximas fechas</h3>
        ${upcoming.length ? `<ul class="list">${upcoming.map((r) => `
          <li><span></span><div><span class="tag">${esc(MODULES[r.module].label)} · ${esc(r.kind)}</span><span class="t">${esc(r.title)}</span></div>
          <span class="meta">${esc(r.due_date)}</span><span></span></li>`).join("")}</ul>`
          : `<p class="n">Nada con fecha próxima. Añade fechas a tus tareas para verlas aquí.</p>`}
      </div>`;
  }

  function renderModule(mod) {
    const M = MODULES[mod];
    const isFin = mod === "finanzas";
    const list = rows.filter((r) => r.module === mod && (filter[mod] === "todo" || r.kind === filter[mod]));
    const chips = ["todo", ...M.kinds].map((k) => `<button class="chip ${filter[mod] === k ? "on" : ""}" data-k="${k}">${k}</button>`).join("");

    $("#view").innerHTML = `
      <form class="add" id="add">
        <select name="kind">${M.kinds.map((k) => `<option>${k}</option>`).join("")}</select>
        <input name="title" required placeholder="${isFin ? "Concepto" : "Título"}">
        <input name="amount" type="number" step="0.01" placeholder="${isFin ? "Importe €" : "—"}" ${isFin ? "" : "disabled"}>
        <input name="due_date" type="date" title="Fecha">
        <button class="primary">Añadir</button>
        <textarea name="notes" placeholder="Notas (opcional)"></textarea>
      </form>
      <div class="filters">${chips}</div>
      <ul class="list">${list.map((r) => `
        <li class="${r.status === "hecho" ? "done" : ""}" data-id="${esc(r.id)}">
          <input type="checkbox" class="chk" ${r.status === "hecho" ? "checked" : ""}>
          <div><span class="tag">${esc(r.kind)}</span><span class="t">${esc(r.title)}</span>${r.notes ? `<div class="n">${esc(r.notes)}</div>` : ""}</div>
          <span class="meta">${r.amount != null && r.amount !== "" ? eur(r.amount) + " · " : ""}${esc(r.due_date || "")}</span>
          <button class="del" title="Borrar">✕</button>
        </li>`).join("") || `<li><span></span><span class="n">Aún no hay nada aquí.</span></li>`}
      </ul>`;

    $("#add").onsubmit = (ev) => {
      ev.preventDefault();
      const f = ev.target;
      run(store.add({
        module: mod,
        kind: f.kind.value,
        title: f.title.value.trim(),
        notes: f.notes.value.trim() || null,
        amount: isFin && f.amount.value !== "" ? Number(f.amount.value) : null,
        due_date: f.due_date.value || (isFin ? today() : null),
        status: "pendiente",
      }));
    };
    document.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { filter[mod] = c.dataset.k; render(); }));
    document.querySelectorAll("ul.list li[data-id]").forEach((li) => {
      const id = li.dataset.id;
      li.querySelector(".chk").onchange = (e) => run(store.update(id, { status: e.target.checked ? "hecho" : "pendiente" }));
      li.querySelector(".del").onclick = () => confirm("¿Borrar este elemento?") && run(store.remove(id));
    });
  }

  // ---------- Arranque ----------
  document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));

  if (sb) {
    sb.auth.getSession().then(({ data }) => { user = data.session?.user || null; user ? refresh() : render(); });
    sb.auth.onAuthStateChange((_e, session) => { user = session?.user || null; user ? refresh() : render(); });
  } else {
    refresh();
  }
})();
