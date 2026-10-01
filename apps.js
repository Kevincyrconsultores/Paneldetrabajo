'use strict';
/* ===== C&R Consultores · Control de clientes ===== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const COBF = [['impuesto','Impuesto a pagar'],['imposiciones','Imposiciones a pagar'],['postergados','Impuestos postergados'],['otros','Otros honorarios'],['pendientes','Honorarios pendientes'],['mes','Honorarios del mes']];

const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ym = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const perLabel = p => { const [y, m] = p.split('-'); return MES[m - 1] + ' ' + y; };
const prevPer = p => { const [y, m] = p.split('-').map(Number); return ym(new Date(y, m - 2, 1)); };
const get = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
const set = (o, p, v) => { const k = p.split('.'); let a = o; k.slice(0, -1).forEach(x => a = a[x] = a[x] || {}); a[k.pop()] = v; };

let data = [], cur = null, tab = 'gen', per = ym(), cb = null, cbId = null, view = 'clientes';

/* ---------- almacenamiento ---------- */
let sb; // cliente de Supabase
async function load() {
  const { data: rows, error } = await sb.from('clientes').select('id,data');
  if (error) { alert('No se pudieron cargar los clientes: ' + error.message); data = []; return; }
  data = rows.map(r => normalize({ ...r.data, id: r.id }));
}
async function saveRow(c) {
  const { error } = await sb.from('clientes').upsert({ id: c.id, data: c, updated_at: new Date().toISOString() });
  if (error) { alert('No se pudo guardar: ' + error.message); return false; }
  return true;
}
async function deleteRow(id) {
  const { error } = await sb.from('clientes').delete().eq('id', id);
  if (error) { alert('No se pudo eliminar: ' + error.message); return false; }
  return true;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }

/* ---------- modelo ---------- */
const blank = () => ({ id: Date.now().toString(36), razon:'', rut:'', giro:'', inicio:'', direccion:'', contacto:'', repNombre:'', repRut:'', repSii:'', honorario:0, antecedentes:'',
  sii:{}, previred:{}, dt:{}, boleta:{}, cert:{}, cobs:{} });
const emptyCob = c => ({ impuesto:0, imposiciones:0, postergados:0, otros:0, pendientes:0, mes:+c.honorario || 0, pagado:false, nota:'' });
const cobOf = (c, p) => (c.cobs && c.cobs[p]) || emptyCob(c);
const total = r => COBF.reduce((s, [k]) => s + (+r[k] || 0), 0);
function normalize(c) { // acepta respaldos de la versión anterior
  if (c.cob && !c.cobs) { c.cobs = { [c.cob.periodo || ym()]: { impuesto:c.cob.impuesto, imposiciones:c.cob.imposiciones, postergados:c.cob.postergados, otros:c.cob.otros, pendientes:c.cob.pendientes, mes:c.cob.mes, pagado:!!c.cob.pagado, nota:'' } }; delete c.cob; }
  c.cobs = c.cobs || {}; ['sii','previred','dt','boleta','cert'].forEach(k => c[k] = c[k] || {});
  return c;
}
function fmtRut(v) {
  v = String(v).replace(/[^0-9kK]/g, '').toUpperCase(); if (v.length < 2) return v;
  return v.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + v.slice(-1);
}
function certDias(c) { const v = c.cert && c.cert.venc; if (!v) return null; return Math.ceil((new Date(v + 'T00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5); }
function certTag(c) {
  const d = certDias(c);
  if (d === null) return '<span class="tag">Sin registro</span>';
  if (d < 0) return '<span class="tag bad">Vencido</span>';
  if (d <= 30) return `<span class="tag warn">Vence en ${d} días</span>`;
  return '<span class="tag ok">Vigente</span>';
}

/* ---------- vistas ---------- */
function stats() {
  let por = 0, imp = 0;
  data.forEach(c => { const r = cobOf(c, per); if (!r.pagado) { por += total(r); imp += (+r.impuesto || 0) + (+r.imposiciones || 0) + (+r.postergados || 0); } });
  const venc = data.filter(c => { const d = certDias(c); return d !== null && d <= 30; }).length;
  const items = view === 'cobranza'
    ? [[clp(por), 'Total por cobrar · ' + perLabel(per)], [clp(imp), 'Impuestos e imposiciones'], [data.filter(c => !cobOf(c, per).pagado && total(cobOf(c, per)) > 0).length, 'Clientes con saldo pendiente'], [data.filter(c => cobOf(c, per).pagado).length, 'Clientes pagados']]
    : [[data.length, 'Clientes registrados'], [clp(data.reduce((s, c) => s + (+c.honorario || 0), 0)), 'Honorarios mensuales'], [venc, 'Certificados por vencer (30 días)']];
  $('#stats').innerHTML = items.map(([a, b]) => `<div class="stat"><b>${a}</b><span>${b}</span></div>`).join('');
}
function renderClientes() {
  const q = $('#q').value.toLowerCase();
  const l = data.filter(c => (c.razon + c.rut).toLowerCase().includes(q)).sort((a, b) => a.razon.localeCompare(b.razon));
  $('#tc').innerHTML = l.length ? l.map(c => `<tr><td><b>${esc(c.razon)}</b><br><span class="note" style="margin:0">${esc(c.giro)}</span></td><td>${esc(c.rut)}</td><td>${esc(c.repNombre)}</td><td>${esc(c.inicio)}</td><td class="n">${clp(c.honorario)}</td><td>${certTag(c)}</td><td><div class="acts"><button class="btn sec sm" data-e="${c.id}">Abrir ficha</button></div></td></tr>`).join('')
    : `<tr><td colspan="7" class="empty">${data.length ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes. Usa «Nuevo cliente» para registrar el primero.'}</td></tr>`;
}
function renderCob() {
  const q = $('#qc').value.toLowerCase(), f = $('#fc').value;
  const l = data.filter(c => c.razon.toLowerCase().includes(q)).filter(c => { const r = cobOf(c, per), deuda = total(r) > 0 && !r.pagado; return !f || (f === 'pend' ? deuda : !deuda); }).sort((a, b) => a.razon.localeCompare(b.razon));
  let sum = 0;
  const rows = l.map(c => {
    const r = cobOf(c, per), t = total(r); if (!r.pagado) sum += t;
    const st = r.pagado ? '<span class="tag ok">Pagado</span>' : t > 0 ? '<span class="tag bad">Pendiente</span>' : '<span class="tag">Sin movimiento</span>';
    return `<tr><td><b>${esc(c.razon)}</b></td>${['impuesto','imposiciones','postergados','otros','pendientes','mes'].map(k => `<td class="n">${clp(r[k])}</td>`).join('')}<td class="n"><b>${clp(t)}</b><br>${st}</td><td><div class="acts"><button class="btn sec sm" data-c="${c.id}">Editar</button></div></td></tr>`;
  }).join('');
  $('#tcob').innerHTML = l.length ? rows + `<tr class="sum"><td colspan="7" class="n">Total pendiente de cobro · ${perLabel(per)}</td><td class="n">${clp(sum)}</td><td></td></tr>` : '<tr><td colspan="9" class="empty">No hay clientes que coincidan.</td></tr>';
}
function render() { stats(); renderClientes(); renderCob(); }
function go(v) {
  view = v;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ['clientes', 'cobranza', 'respaldo'].forEach(x => $('#v-' + x).classList.toggle('hid', x !== v));
  $('#title').textContent = { clientes: 'Listado de clientes', cobranza: 'Cobranza', respaldo: 'Respaldo y seguridad' }[v];
  $('#perBox').classList.toggle('hid', v !== 'cobranza');
  $('#stats').classList.toggle('hid', v === 'respaldo');
  stats();
}

/* ---------- ficha del cliente ---------- */
const fld = (p, l, t = 'text', cls = '', extra = '') =>
  `<div class="${cls}"><label>${l}</label>${t === 'area' ? `<textarea rows="3" data-p="${p}"></textarea>`
  : t === 'pass' ? `<div class="pw"><input type="password" data-p="${p}" autocomplete="off"><button type="button" data-show>Ver</button></div>`
  : `<input type="${t}" data-p="${p}" ${extra}>`}</div>`;
const sys = (k, n) => `<fieldset><legend>${n}</legend><div class="grid">${fld(k + '.u', 'Usuario / RUT')}${fld(k + '.p', 'Clave', 'pass')}${fld(k + '.n', 'Observaciones', 'text', 'full')}</div></fieldset>`;
const TABS = {
  gen: () => `<div class="grid">${fld('razon','Razón social')}${fld('rut','RUT empresa','text','','data-rut')}${fld('giro','Giro')}${fld('inicio','Inicio de actividades','date')}${fld('direccion','Dirección')}${fld('contacto','Teléfono / correo')}${fld('repNombre','Representante legal')}${fld('repRut','RUT representante legal','text','','data-rut')}${fld('repSii','Clave SII del representante','pass')}${fld('honorario','Honorario mensual (CLP)','number','','min="0" step="1"')}${fld('antecedentes','Antecedentes','area','full')}</div>`,
  acc: () => sys('sii','SII (empresa)') + sys('previred','Previred') + sys('dt','Dirección del Trabajo') + sys('boleta','Sistema de boleta electrónica')
    + `<fieldset><legend>Certificado digital</legend><div class="grid">${fld('cert.venc','Fecha de vencimiento','date')}${fld('cert.p','Clave del certificado','pass')}${fld('cert.n','Observaciones / ubicación del archivo','text','full')}</div></fieldset>`
};
function sync() {
  $$('#mb [data-p]').forEach(el => { let v = el.value; if (el.type === 'number') v = +v || 0; set(cur, el.dataset.p, v); });
}
function paint() {
  sync();
  $('#mb').innerHTML = TABS[tab]();
  $$('#mb [data-p]').forEach(el => { const v = get(cur, el.dataset.p); el.value = v ?? ''; });
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
}
function openFicha(id) {
  const f = data.find(c => c.id === id);
  cur = f ? JSON.parse(JSON.stringify(f)) : blank(); cur._new = !f; tab = 'gen';
  $('#mt').textContent = f ? f.razon : 'Nuevo cliente';
  $('#del').classList.toggle('hid', !f);
  $('#mb').innerHTML = ''; paint(); $('#dlg').showModal();
}
async function saveFicha() {
  sync();
  if (!cur.razon.trim()) { tab = 'gen'; paint(); alert('Ingresa la razón social del cliente.'); return; }
  const isNew = cur._new; delete cur._new;
  if (!(await saveRow(cur))) { cur._new = isNew; return; }
  if (isNew) data.push(cur); else data[data.findIndex(c => c.id === cur.id)] = cur;
  $('#dlg').close(); render(); toast('Cliente guardado');
}

/* ---------- cobranza ---------- */
function openCob(id) {
  const c = data.find(x => x.id === id); cbId = id; cb = { ...cobOf(c, per) };
  $('#mct').textContent = c.razon + ' · ' + perLabel(per);
  $('#mbc').innerHTML = `<div class="grid">${COBF.map(([k, l]) => fld(k, l, 'number', '', 'min="0" step="1"')).join('')}
    <div><label>Estado</label><select data-p="pagado"><option value="">Pendiente</option><option value="1">Pagado</option></select></div>${fld('nota','Nota','text','full')}</div>`;
  $$('#mbc [data-p]').forEach(el => { const v = cb[el.dataset.p]; el.value = el.dataset.p === 'pagado' ? (v ? '1' : '') : (v ?? ''); });
  ctot(); $('#dlgc').showModal();
}
function readCob() { $$('#mbc [data-p]').forEach(el => { const p = el.dataset.p; cb[p] = p === 'pagado' ? el.value === '1' : el.type === 'number' ? (+el.value || 0) : el.value; }); }
function ctot() { readCob(); $('#ctot').textContent = 'Total: ' + clp(total(cb)); }
async function saveCob() {
  readCob(); const c = data.find(x => x.id === cbId);
  const upd = { ...c, cobs: { ...c.cobs, [per]: { ...cb } } };
  if (!(await saveRow(upd))) return;
  Object.assign(c, upd); $('#dlgc').close(); render(); toast('Cobranza guardada');
}
function traerSaldo() {
  const c = data.find(x => x.id === cbId), pr = c.cobs[prevPer(per)];
  if (!pr || pr.pagado || total(pr) === 0) { toast('No hay saldo pendiente en ' + perLabel(prevPer(per))); return; }
  $('#mbc [data-p="pendientes"]').value = total(pr); ctot(); toast('Saldo anterior cargado');
}

/* ---------- respaldo ---------- */
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function exportCsv() {
  const h = ['Cliente','RUT','Período',...COBF.map(x => x[1]),'Total','Estado'];
  const r = data.map(c => { const o = cobOf(c, per); return [c.razon, c.rut, per, ...COBF.map(([k]) => o[k] || 0), total(o), o.pagado ? 'Pagado' : 'Pendiente'].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';'); });
  dl('cobranza-' + per + '.csv', '\ufeff' + [h.join(';'), ...r].join('\n'), 'text/csv');
}

/* ---------- sesión (Supabase Auth) ---------- */
function showLogin(msg = '') { $('#lock').classList.remove('hid'); $('#lockErr').textContent = msg; $('#pass').value = ''; $('#email').focus(); }
async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showLogin(); return; }
  $('#who').textContent = session.user.email;
  $('#lock').classList.add('hid');
  await load(); render();
}
$('#lockForm').onsubmit = async e => {
  e.preventDefault(); const err = $('#lockErr'); err.textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#pass').value });
  if (error) { err.textContent = 'Correo o contraseña incorrectos.'; $('#pass').value = ''; return; }
  await start();
};

/* ---------- eventos ---------- */
$('#nav').onclick = e => { if (e.target.dataset.v) go(e.target.dataset.v); };
$('#new').onclick = () => openFicha();
$('#tc').onclick = e => { const id = e.target.dataset.e; if (id) openFicha(id); };
$('#tcob').onclick = e => { const id = e.target.dataset.c; if (id) openCob(id); };
$('#tabs').onclick = e => { if (e.target.dataset.t) { sync(); tab = e.target.dataset.t; paint(); } };
$('#mb').onclick = e => { if (e.target.hasAttribute('data-show')) { const i = e.target.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; e.target.textContent = i.type === 'password' ? 'Ver' : 'Ocultar'; } };
$('#mb').addEventListener('focusout', e => { if (e.target.hasAttribute('data-rut')) e.target.value = fmtRut(e.target.value); });
$('#x').onclick = () => $('#dlg').close();
$('#save').onclick = saveFicha;
$('#del').onclick = async () => { if (confirm('¿Eliminar a ' + cur.razon + '? Esta acción no se puede deshacer.')) { if (!(await deleteRow(cur.id))) return; data = data.filter(c => c.id !== cur.id); $('#dlg').close(); render(); toast('Cliente eliminado'); } };
$('#mbc').oninput = ctot;
$('#xc').onclick = () => $('#dlgc').close();
$('#savec').onclick = saveCob;
$('#prev').onclick = traerSaldo;
$('#per').value = per;
$('#per').onchange = e => { if (e.target.value) { per = e.target.value; render(); } };
$('#q').oninput = renderClientes; $('#qc').oninput = renderCob; $('#fc').onchange = renderCob;
$('#exp').onclick = () => dl('respaldo-cr-consultores-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 1), 'application/json');
$('#csv').onclick = exportCsv;
$('#imp').onclick = () => $('#file').click();
$('#file').onchange = e => {
  const f = e.target.files[0]; if (!f) return; const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result); if (!Array.isArray(d)) throw 0;
      if (!confirm('Se agregarán o actualizarán ' + d.length + ' clientes en la base de datos. ¿Continuar?')) return;
      const rows = d.map(normalize).map(c => ({ id: c.id, data: c }));
      const { error } = await sb.from('clientes').upsert(rows);
      if (error) { alert('No se pudo restaurar: ' + error.message); return; }
      await load(); render(); toast('Respaldo restaurado');
    } catch (x) { alert('El archivo no es un respaldo válido.'); }
  };
  r.readAsText(f); e.target.value = '';
};
$('#chpin').onclick = async () => {
  const p = prompt('Nueva contraseña (mínimo 8 caracteres):'); if (!p) return;
  if (p.length < 8) { alert('La contraseña debe tener al menos 8 caracteres.'); return; }
  const { error } = await sb.auth.updateUser({ password: p });
  toast(error ? 'No se pudo cambiar: ' + error.message : 'Contraseña actualizada');
};
$('#lockBtn').onclick = async () => { await sb.auth.signOut(); data = []; render(); showLogin(); };
window.addEventListener('focus', () => { if (sb && $('#lock').classList.contains('hid') && !document.querySelector('dialog[open]')) load().then(render); });

/* ---------- inicio ---------- */
if (!window.supabase || typeof CFG === 'undefined' || !CFG.url || CFG.url.includes('TU-PROYECTO')) {
  $('#lock').classList.remove('hid'); $('#lockMsg').textContent = '';
  $('#lockErr').textContent = 'Falta configurar config.js con la URL y la clave de Supabase.';
} else {
  sb = supabase.createClient(CFG.url, CFG.key);
  go('clientes'); render(); start();
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') showLogin(); });
}
