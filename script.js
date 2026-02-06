const $ = (id) => document.getElementById(id);

const $ = (id) => document.getElementById(id);

function clamp(x, min, max){ return Math.min(Math.max(x, min), max); }
function num(v, fallback=0){ const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function fmt(x, d=2){ return Number.isFinite(x) ? x.toFixed(d) : "—"; }

let sets = [];
let activeSetId = null;

// --- Механика 1:1 под твои слова ---
// AP (%): какая часть урона идет в HP, игнорируя броню
// AR (%): сопротивление брони, которое режет эффект AP
// effAP(%) = AP*(100-AR)/100
function calcEffApPercent(AP, AR){
  AP = Math.max(0, AP);        // AP может быть >100 (как "запас")
  AR = clamp(AR, 0, 100);      // AR — процент 0..100

  const raw = (AP * (100 - AR)) / 100;  // может получиться >100
  return Math.min(raw, 100);            // но эффективная бронебойность максимум 100%
}



function simulateKill(p){
  const damage = Math.max(0, p.damage);
  const hpMod = Math.max(0, p.hpMod);
  const armorMod = Math.max(0, p.armorMod);

  const rof = Math.max(0.000001, p.rof);
  const reloadTime = Math.max(0, p.reloadTime);
  const mag = Math.max(1, Math.floor(p.magSize));

  let hp = Math.max(0, p.enemyHp);
  let armor = Math.max(0, p.enemyArmor);

  const effApPercent = calcEffApPercent(p.apPercent,       p.armorResPercent);
  const effAP = effApPercent / 100;

  // Пока броня есть:
  const hpPerShotWithArmor = damage * effAP * hpMod;
  const armorPerShot = Math.max(0, damage * (1 - effAP) * armorMod);


  // Если брони нет — весь урон в HP (как ты описал)
  const hpPerShotNoArmor = damage * hpMod;

  // Защита от нулевого урона (иначе бесконечность)
  const canDamage = (hpPerShotWithArmor > 0) || (armorPerShot > 0) || (hpPerShotNoArmor > 0);
  if (!canDamage && (hp > 0 || armor > 0)){
    return { ok:false, reason:"Урон = 0, цель не убивается.", effApPercent };
  }

  let shots = 0;
  let totalHpDmg = 0;
  let totalArmorDmg = 0;

  const maxShots = 1_000_000;

  while (hp > 0 && shots < maxShots){
    shots++;

    if (armor > 0){
      // броня + параллельно HP через AP
      const aDmg = Math.min(armor, armorPerShot);
      armor -= aDmg;
      totalArmorDmg += aDmg;

      const hDmg = Math.min(hp, hpPerShotWithArmor);
      hp -= hDmg;
      totalHpDmg += hDmg;
    } else {
      // брони нет — весь урон в HP
      const hDmg = Math.min(hp, hpPerShotNoArmor);
      hp -= hDmg;
      totalHpDmg += hDmg;
    }
  }

  if (shots >= maxShots){
    return { ok:false, reason:"Слишком много выстрелов (проверь параметры).", effApPercent };
  }

  // TTK: первый выстрел в t=0
  const interval = 1 / rof;
  const reloads = Math.floor((shots - 1) / mag);
  const ttk = (shots - 1) * interval + reloads * reloadTime;

  return {
    ok:true,
    effApPercent,
    shots,
    reloads,
    ttk,
    totalHpDmg,
    totalArmorDmg,
    totalDmg: totalHpDmg + totalArmorDmg,
    hpPerShotWithArmor,
    armorPerShot,
    hpPerShotNoArmor
  };
}

function getFormParams(){
  return {
    name: ($("setName").value || "").trim() || `Сет ${sets.length + 1}`,

    // weapon
    damage: num($("damage").value),
    hpMod: num($("hpMod").value, 1),
    armorMod: num($("armorMod").value, 1),
    apPercent: num($("ap").value),
    rof: num($("rof").value, 1),
    reloadTime: num($("reload").value, 0),
    magSize: num($("mag").value, 1),

    // enemy
    enemyHp: num($("enemyHp").value),
    enemyArmor: num($("enemyArmor").value),
    armorResPercent: num($("armorRes").value)
  };
}

function setFormParams(p){
  $("setName").value = p.name ?? "";
  $("damage").value = p.damage;
  $("hpMod").value = p.hpMod;
  $("armorMod").value = p.armorMod;
  $("ap").value = p.apPercent;
  $("rof").value = p.rof;
  $("reload").value = p.reloadTime;
  $("mag").value = p.magSize;

  $("enemyHp").value = p.enemyHp;
  $("enemyArmor").value = p.enemyArmor;
  $("armorRes").value = p.armorResPercent;

  calcForForm();
}

function calcForForm(){
  const p = getFormParams();
  const r = simulateKill(p);

  // мини-индикаторы
  $("effApOut").textContent = fmt(r.effApPercent ?? calcEffApPercent(p.apPercent, p.armorResPercent), 2);
  if (r.ok){
    $("hpShotOut").textContent = fmt(r.hpPerShotWithArmor, 2);
    $("armorShotOut").textContent = fmt(r.armorPerShot, 2);
  } else {
    $("hpShotOut").textContent = "—";
    $("armorShotOut").textContent = "—";
  }

  // результаты формы
  if (!r.ok){
    $("shotsNow").textContent = "—";
    $("reloadsNow").textContent = "—";
    $("ttkNow").textContent = r.reason;
    $("hpDmgNow").textContent = "—";
    $("armorDmgNow").textContent = "—";
    return;
  }

  $("shotsNow").textContent = String(r.shots);
  $("reloadsNow").textContent = String(r.reloads);
  $("ttkNow").textContent = fmt(r.ttk, 3);
  $("hpDmgNow").textContent = fmt(r.totalHpDmg, 2);
  $("armorDmgNow").textContent = fmt(r.totalArmorDmg, 2);
}

function renderSets(){
  const list = $("setsList");
  list.innerHTML = "";

  if (sets.length === 0){
    list.innerHTML = `<div class="hint">Пока нет сетов. Заполни форму → “Добавить сет”.</div>`;
    renderCompare();
    return;
  }

  sets.forEach(s => {
    const r = simulateKill(s.params);
    const div = document.createElement("div");
    div.className = "setCard" + (s.id === activeSetId ? " active" : "");
    div.innerHTML = `
      <div class="setTitle">
        <b>${escapeHtml(s.params.name)}</b>
        <span style="color:rgba(234,242,255,.7);font-size:12px">#${s.id}</span>
      </div>
      <div class="setMeta">
        <span>effAP: <b>${fmt(r.effApPercent ?? 0, 2)}%</b></span>
        <span>TTK: <b>${r.ok ? fmt(r.ttk, 3) : "—"}</b></span>
        <span>Выстр.: <b>${r.ok ? r.shots : "—"}</b></span>
      </div>
      <div class="smallBtnRow">
        <button class="smallBtn" data-act="load">Загрузить</button>
        <button class="smallBtn" data-act="del">Удалить</button>
      </div>
    `;

    div.addEventListener("click", (e) => {
      const act = e.target?.dataset?.act;
      if (act === "del"){
        e.stopPropagation();
        sets = sets.filter(x => x.id !== s.id);
        if (activeSetId === s.id) activeSetId = null;
        syncActiveButtons();
        renderSets();
        return;
      }
      if (act === "load" || !act){
        activeSetId = s.id;
        setFormParams(s.params);
        syncActiveButtons();
        renderSets();
      }
    });

    list.appendChild(div);
  });

  renderCompare();
}

function renderCompare(){
  const body = $("compareBody");
  body.innerHTML = "";

  const rows = sets.map(s => {
    const r = simulateKill(s.params);
    return { s, r };
  });

  const okRows = rows.filter(x => x.r.ok);
  const bestTtk = okRows.length ? Math.min(...okRows.map(x => x.r.ttk)) : null;

  rows.forEach(({s, r}) => {
    const tr = document.createElement("tr");
    if (r.ok && bestTtk !== null && Math.abs(r.ttk - bestTtk) < 1e-9) tr.classList.add("best");

    tr.innerHTML = `
      <td><b>${escapeHtml(s.params.name)}</b></td>
      <td>${fmt(r.effApPercent ?? 0, 2)}</td>
      <td>${r.ok ? r.shots : "—"}</td>
      <td>${r.ok ? r.reloads : "—"}</td>
      <td>${r.ok ? fmt(r.ttk, 3) : escapeHtml(r.reason || "—")}</td>
      <td>${r.ok ? fmt(r.totalHpDmg, 2) : "—"}</td>
      <td>${r.ok ? fmt(r.totalArmorDmg, 2) : "—"}</td>
      <td>${r.ok ? fmt(r.totalDmg, 2) : "—"}</td>
    `;
    body.appendChild(tr);
  });
}

function syncActiveButtons(){
  const hasActive = activeSetId !== null && sets.some(s => s.id === activeSetId);

  $("updateSetBtn").disabled = !hasActive;
  if ($("updateSetBtnMobile")) {
    $("updateSetBtnMobile").disabled = !hasActive;
  }
}


function addSet(){
  const params = getFormParams();
  const id = (sets.length ? Math.max(...sets.map(s => s.id)) : 0) + 1;
  sets.push({ id, params });
  activeSetId = id;
  syncActiveButtons();
  renderSets();
}

function updateActiveSet(){
  if (activeSetId === null) return;
  const idx = sets.findIndex(s => s.id === activeSetId);
  if (idx < 0) return;
  sets[idx].params = getFormParams();
  renderSets();
}

function clearSets(){
  sets = [];
  activeSetId = null;
  syncActiveButtons();
  renderSets();
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// --- events ---
$("calcBtn").addEventListener("click", calcForForm);
$("addSetBtn").addEventListener("click", addSet);
$("updateSetBtn").addEventListener("click", updateActiveSet);
$("clearSetsBtn").addEventListener("click", clearSets);

// авто-пересчёт формы
[
  "damage","hpMod","armorMod","ap","rof","reload","mag",
  "enemyHp","enemyArmor","armorRes","setName"
].forEach(id => {
  $(id).addEventListener("input", () => calcForForm());
});
$("addSetBtnMobile")?.addEventListener("click", addSet);
$("updateSetBtnMobile")?.addEventListener("click", updateActiveSet);
$("clearSetsBtnMobile")?.addEventListener("click", clearSets);


// старт
calcForForm();
renderSets();
syncActiveButtons();

