/* ═══════════════════════════════════════════════════
   GL_CUTTZ – app.js
   Vollständige App-Logik (kein Framework, reines JS)
═══════════════════════════════════════════════════ */

'use strict';

// ─── LocalStorage Helpers ───────────────────────────
const DB = {
  get: k => { try { return JSON.parse(localStorage.getItem('glcuttz_' + k)) } catch { return null } },
  set: (k, v) => localStorage.setItem('glcuttz_' + k, JSON.stringify(v)),
  default: (k, v) => { if (DB.get(k) === null) DB.set(k, v); return DB.get(k); }
};

// ─── App State ─────────────────────────────────────
const State = {
  adminPw:      'GL2025',          // Standard-Passwort
  mode:         null,              // 'admin' | 'client'
  clientName:   null,
  clientGroup:  null,
  adminCalDate: new Date(),
  clientCalDate: new Date(),
  selectedDay:  null,
  pendingApptDay: null,
};

// ─── Data helpers ────────────────────────────────────
function getClients()      { return DB.default('clients',      []) }
function getAppointments() { return DB.default('appointments', []) }
function getRequests()     { return DB.default('requests',     []) }
function getGroups()       { return DB.default('groups',       []) }

function saveClients(d)      { DB.set('clients', d) }
function saveAppointments(d) { DB.set('appointments', d) }
function saveRequests(d)     { DB.set('requests', d) }
function saveGroups(d)       { DB.set('groups', d) }

// ─── Util ────────────────────────────────────────────
const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni',
                   'Juli','August','September','Oktober','November','Dezember'];

function fmtDate(y, m, d) {
  return `${String(d).padStart(2,'0')}.${String(m+1).padStart(2,'0')}.${y}`;
}
function dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function genCode() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}
function initials(name) {
  return name.split(' ').map(p => p[0] || '').join('').substring(0,2).toUpperCase();
}

let _toastTimer = null;
function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

function show(id)   { document.getElementById(id).classList.remove('hidden'); }
function hide(id)   { document.getElementById(id).classList.add('hidden'); }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ─── Main App Object ─────────────────────────────────
const App = {

  /* ── SPLASH / AUTH ────────────────────────────── */

  showLogin(mode) {
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('admin-pw').value = '';
    show('modal-login');
    setTimeout(() => document.getElementById('admin-pw').focus(), 150);
  },

  doAdminLogin() {
    const pw = document.getElementById('admin-pw').value;
    if (pw === State.adminPw) {
      hide('modal-login');
      State.mode = 'admin';
      showScreen('screen-admin');
      App.refreshAdmin();
    } else {
      show('login-error');
    }
  },

  showGroupJoin() {
    document.getElementById('join-name').value = '';
    document.getElementById('join-code').value = '';
    document.getElementById('join-error').classList.add('hidden');
    show('modal-join');
    setTimeout(() => document.getElementById('join-name').focus(), 150);
  },

  doJoinGroup() {
    const name = document.getElementById('join-name').value.trim();
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!name) { toast('Bitte Name eingeben'); return; }
    const groups = getGroups();
    const group = groups.find(g => g.code === code);
    if (!group) {
      show('join-error');
      return;
    }
    // Add member if not already there
    if (!group.members.includes(name)) {
      group.members.push(name);
      saveGroups(groups);
    }
    hide('modal-join');
    State.mode = 'client';
    State.clientName = name;
    State.clientGroup = group.code;
    document.getElementById('client-name-label').textContent = name;
    showScreen('screen-client');
    App.renderClientCal();
  },

  logout() {
    State.mode = null;
    showScreen('screen-splash');
  },

  logoutClient() {
    State.mode = null;
    State.clientName = null;
    State.clientGroup = null;
    showScreen('screen-splash');
  },

  /* ── MODAL HELPERS ────────────────────────────── */

  closeModal(id) { hide(id); },

  openAddClient(clientId = null) {
    document.getElementById('client-modal-title').textContent =
      clientId ? 'Kunde bearbeiten' : 'Kunde hinzufügen';
    document.getElementById('edit-client-id').value = clientId || '';
    document.getElementById('client-name').value = '';
    document.getElementById('client-phone').value = '';
    document.getElementById('client-note').value = '';

    if (clientId) {
      const c = getClients().find(x => x.id === clientId);
      if (c) {
        document.getElementById('client-name').value  = c.name;
        document.getElementById('client-phone').value = c.phone;
        document.getElementById('client-note').value  = c.note;
      }
    }
    show('modal-add-client');
  },

  saveClient() {
    const id   = document.getElementById('edit-client-id').value;
    const name = document.getElementById('client-name').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const note  = document.getElementById('client-note').value.trim();
    if (!name) { toast('Name ist Pflichtfeld'); return; }

    const clients = getClients();
    if (id) {
      const idx = clients.findIndex(c => c.id === id);
      if (idx > -1) { clients[idx] = { ...clients[idx], name, phone, note }; }
    } else {
      clients.push({ id: 'c' + Date.now(), name, phone, note, created: Date.now() });
    }
    saveClients(clients);
    hide('modal-add-client');
    App.renderClients();
    App.refreshStats();
    toast(id ? 'Kunde aktualisiert ✓' : 'Kunde hinzugefügt ✓');
  },

  deleteClient(id) {
    if (!confirm('Kunde wirklich löschen?')) return;
    saveClients(getClients().filter(c => c.id !== id));
    App.renderClients();
    App.refreshStats();
    toast('Kunde gelöscht');
  },

  openAddAppointment() {
    const clients = getClients();
    const sel = document.getElementById('appt-client');
    sel.innerHTML = clients.length
      ? clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
      : '<option value="">– Kein Kunde –</option>';
    document.getElementById('appt-amount').value = '';
    document.getElementById('appt-note').value = '';
    document.getElementById('appt-time').value = '10:00';
    show('modal-add-appt');
  },

  saveAppointment() {
    const clientId = document.getElementById('appt-client').value;
    const time   = document.getElementById('appt-time').value;
    const amount = parseFloat(document.getElementById('appt-amount').value) || 0;
    const note   = document.getElementById('appt-note').value.trim();
    const day    = State.selectedDay;
    if (!day) { toast('Kein Tag ausgewählt'); return; }

    const client = getClients().find(c => c.id === clientId);
    const appts = getAppointments();
    appts.push({
      id: 'a' + Date.now(),
      day,
      clientId,
      clientName: client ? client.name : 'Unbekannt',
      time,
      amount,
      note,
      ts: Date.now()
    });
    saveAppointments(appts);
    hide('modal-add-appt');
    App.renderAdminCal();
    App.showDayDetail(day);
    App.refreshStats();
    toast('Termin eingetragen ✓');
  },

  /* ── ADMIN MAIN ───────────────────────────────── */

  refreshAdmin() {
    App.refreshStats();
    App.renderRequests();
    App.renderRecentPayments();
    App.renderAdminCal();
    App.renderClients();
    App.renderGroups();
    document.getElementById('dash-month-label').textContent =
      MONTHS_DE[new Date().getMonth()] + ' ' + new Date().getFullYear();
  },

  refreshStats() {
    const now   = new Date();
    const y     = now.getFullYear();
    const m     = now.getMonth();
    const appts = getAppointments().filter(a => {
      const [ay, am] = a.day.split('-').map(Number);
      return ay === y && (am - 1) === m;
    });
    const revenue = appts.reduce((s, a) => s + (a.amount || 0), 0);
    document.getElementById('stat-revenue').textContent  = 'CHF ' + revenue.toFixed(0);
    document.getElementById('stat-cuts').textContent     = appts.length;
    document.getElementById('stat-requests').textContent = getRequests().filter(r => r.status === 'pending').length;
    document.getElementById('stat-clients').textContent  = getClients().length;
  },

  renderRequests() {
    const reqs = getRequests().filter(r => r.status === 'pending');
    const el   = document.getElementById('requests-list');
    if (!reqs.length) { el.innerHTML = '<p class="empty-hint">Keine offenen Anfragen</p>'; return; }
    el.innerHTML = reqs.map(r => `
      <div class="request-card">
        <div class="request-info">
          <div class="request-name">🗓 ${r.clientName}</div>
          <div class="request-meta">${r.day} · ${r.time} Uhr${r.note ? ' · ' + r.note : ''}</div>
        </div>
        <div class="request-actions">
          <button class="btn-success" onclick="App.acceptRequest('${r.id}')">✓</button>
          <button class="btn-danger"  onclick="App.declineRequest('${r.id}')">✕</button>
        </div>
      </div>`).join('');
  },

  acceptRequest(id) {
    const reqs = getRequests();
    const req  = reqs.find(r => r.id === id);
    if (!req) return;
    req.status = 'accepted';
    saveRequests(reqs);

    // Add as appointment
    const appts = getAppointments();
    appts.push({
      id: 'a' + Date.now(),
      day: req.day,
      clientId: req.clientId || '',
      clientName: req.clientName,
      time: req.time,
      amount: 0,
      note: req.note,
      ts: Date.now()
    });
    saveAppointments(appts);
    App.renderRequests();
    App.renderAdminCal();
    App.refreshStats();
    toast('Termin bestätigt ✓');
  },

  declineRequest(id) {
    const reqs = getRequests();
    const idx  = reqs.findIndex(r => r.id === id);
    if (idx > -1) { reqs[idx].status = 'declined'; saveRequests(reqs); }
    App.renderRequests();
    App.refreshStats();
    toast('Anfrage abgelehnt');
  },

  renderRecentPayments() {
    const appts = getAppointments()
      .filter(a => a.amount > 0)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
    const el = document.getElementById('recent-payments');
    if (!appts.length) { el.innerHTML = '<p class="empty-hint">Noch keine Einnahmen erfasst</p>'; return; }
    el.innerHTML = appts.map(a => `
      <div class="payment-row">
        <div>
          <div class="payment-name">${a.clientName}</div>
          <div class="payment-meta">${a.day} · ${a.time} Uhr${a.note ? ' · ' + a.note : ''}</div>
        </div>
        <div class="payment-amount">CHF ${a.amount}</div>
      </div>`).join('');
  },

  /* ── ADMIN CALENDAR ───────────────────────────── */

  calPrev() {
    State.adminCalDate = new Date(State.adminCalDate.getFullYear(), State.adminCalDate.getMonth() - 1, 1);
    State.selectedDay = null;
    hide('day-detail');
    App.renderAdminCal();
  },

  calNext() {
    State.adminCalDate = new Date(State.adminCalDate.getFullYear(), State.adminCalDate.getMonth() + 1, 1);
    State.selectedDay = null;
    hide('day-detail');
    App.renderAdminCal();
  },

  renderAdminCal() {
    const date  = State.adminCalDate;
    const y     = date.getFullYear();
    const m     = date.getMonth();
    document.getElementById('admin-cal-label').textContent = MONTHS_DE[m] + ' ' + y;

    const appts  = getAppointments();
    const reqs   = getRequests().filter(r => r.status === 'pending');
    const today  = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    const grid   = document.getElementById('admin-cal-grid');
    grid.innerHTML = App._buildCalHTML(y, m, today, (dk) => {
      const hasAppt = appts.some(a => a.day === dk);
      const hasReq  = reqs.some(r => r.day === dk);
      let cls = '';
      if (dk === State.selectedDay) cls = 'selected';
      else if (hasReq) cls = 'has-request';
      else if (hasAppt) cls = 'has-appt';
      const dot = (hasAppt || hasReq) && dk !== State.selectedDay ? '<span class="dot"></span>' : '';
      return { cls, dot };
    });

    grid.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
      el.addEventListener('click', () => {
        const dk = el.dataset.key;
        State.selectedDay = dk;
        App.renderAdminCal();
        App.showDayDetail(dk);
      });
    });
  },

  showDayDetail(dk) {
    const [y, m, d] = dk.split('-').map(Number);
    document.getElementById('day-detail-title').textContent =
      `${d}. ${MONTHS_DE[m - 1]} ${y}`;

    const appts = getAppointments().filter(a => a.day === dk)
      .sort((a, b) => a.time.localeCompare(b.time));

    const list = document.getElementById('day-appointments');
    if (!appts.length) {
      list.innerHTML = '<p class="empty-hint">Keine Termine</p>';
    } else {
      list.innerHTML = appts.map(a => `
        <div class="appt-row">
          <div class="appt-info">
            <span class="appt-time">${a.time}</span>${a.clientName}
            ${a.note ? `<span style="color:var(--gray-lt);font-size:.78rem"> · ${a.note}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            ${a.amount > 0 ? `<span class="appt-amount">CHF ${a.amount}</span>` : ''}
            <button class="btn-danger" onclick="App.deleteAppt('${a.id}','${dk}')">✕</button>
          </div>
        </div>`).join('');
    }
    show('day-detail');
  },

  deleteAppt(id, dk) {
    saveAppointments(getAppointments().filter(a => a.id !== id));
    App.showDayDetail(dk);
    App.renderAdminCal();
    App.refreshStats();
    toast('Termin gelöscht');
  },

  /* ── CLIENTS TAB ──────────────────────────────── */

  renderClients(filter = '') {
    let clients = getClients();
    if (filter) clients = clients.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));

    const appts = getAppointments();
    const el    = document.getElementById('clients-list');
    if (!clients.length) {
      el.innerHTML = '<p class="empty-hint">Noch keine Kunden erfasst</p>';
      return;
    }
    el.innerHTML = clients.map(c => {
      const total = appts.filter(a => a.clientId === c.id).reduce((s, a) => s + (a.amount || 0), 0);
      const count = appts.filter(a => a.clientId === c.id).length;
      return `
        <div class="client-card">
          <div class="client-avatar">${initials(c.name)}</div>
          <div class="client-info">
            <div class="client-cname">${c.name}</div>
            <div class="client-cmeta">
              ${c.phone ? c.phone : ''}${c.phone && c.note ? ' · ' : ''}${c.note ? c.note : ''}
              ${count ? ` · ${count} Schnitt${count !== 1 ? 'e' : ''}` : ''}
            </div>
          </div>
          ${total > 0 ? `<div class="client-ctotal">CHF ${total}</div>` : ''}
          <div class="client-actions">
            <button class="icon-btn" onclick="App.openAddClient('${c.id}')" title="Bearbeiten">✏️</button>
            <button class="icon-btn" onclick="App.deleteClient('${c.id}')" title="Löschen">🗑</button>
          </div>
        </div>`;
    }).join('');
  },

  filterClients() {
    App.renderClients(document.getElementById('client-search').value);
  },

  /* ── GROUPS TAB ───────────────────────────────── */

  createGroup() {
    const name = prompt('Gruppenname:');
    if (!name) return;
    const groups = getGroups();
    const code   = genCode();
    groups.push({ id: 'g' + Date.now(), name, code, members: [] });
    saveGroups(groups);
    App.renderGroups();
    toast(`Gruppe "${name}" erstellt · Code: ${code}`);
  },

  renderGroups() {
    const groups = getGroups();
    const el     = document.getElementById('groups-list');
    if (!groups.length) {
      el.innerHTML = '<p class="empty-hint">Noch keine Gruppen. Erstelle eine, damit Kunden beitreten können.</p>';
      return;
    }
    el.innerHTML = groups.map(g => `
      <div class="group-card">
        <div class="group-name">${g.name}</div>
        <div class="group-code">${g.code}</div>
        <div class="group-members">
          👥 ${g.members.length} Mitglied${g.members.length !== 1 ? 'er' : ''}
          ${g.members.length ? ': ' + g.members.join(', ') : ''}
        </div>
        <div class="group-hint">Diesen Code an deine Kunden weitergeben</div>
        <div style="margin-top:.75rem;display:flex;gap:.5rem">
          <button class="btn-secondary" style="font-size:.8rem;padding:.5rem .8rem" onclick="App.copyCode('${g.code}')">📋 Code kopieren</button>
          <button class="btn-danger" onclick="App.deleteGroup('${g.id}')">Löschen</button>
        </div>
      </div>`).join('');
  },

  copyCode(code) {
    navigator.clipboard.writeText(code).catch(() => {});
    toast(`Code ${code} kopiert ✓`);
  },

  deleteGroup(id) {
    if (!confirm('Gruppe wirklich löschen?')) return;
    saveGroups(getGroups().filter(g => g.id !== id));
    App.renderGroups();
    toast('Gruppe gelöscht');
  },

  /* ── CLIENT CALENDAR ──────────────────────────── */

  clientCalPrev() {
    State.clientCalDate = new Date(State.clientCalDate.getFullYear(), State.clientCalDate.getMonth() - 1, 1);
    App.renderClientCal();
  },

  clientCalNext() {
    State.clientCalDate = new Date(State.clientCalDate.getFullYear(), State.clientCalDate.getMonth() + 1, 1);
    App.renderClientCal();
  },

  renderClientCal() {
    const date  = State.clientCalDate;
    const y     = date.getFullYear();
    const m     = date.getMonth();
    document.getElementById('client-cal-label').textContent = MONTHS_DE[m] + ' ' + y;

    const appts  = getAppointments();
    const reqs   = getRequests();
    const myReqs = reqs.filter(r => r.clientName === State.clientName);
    const today  = new Date();
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

    const grid = document.getElementById('client-cal-grid');
    grid.innerHTML = App._buildCalHTML(y, m, todayKey, (dk) => {
      // Past days – not clickable
      if (dk < todayKey) return { cls: 'empty', dot: '' };

      const booked  = appts.some(a => a.day === dk);
      const pending = myReqs.some(r => r.day === dk && r.status === 'pending');
      const mine    = myReqs.some(r => r.day === dk && r.status === 'accepted');

      let cls = 'day-free';
      if (booked || mine) cls = 'day-booked';
      else if (pending) cls = 'day-pending';
      return { cls, dot: '' };
    });

    grid.querySelectorAll('.cal-day:not(.empty):not(.day-booked):not(.day-pending)').forEach(el => {
      el.addEventListener('click', () => {
        State.pendingApptDay = el.dataset.key;
        App.openBookingModal(el.dataset.key);
      });
    });
  },

  openBookingModal(dk) {
    const [y, m, d] = dk.split('-').map(Number);
    document.getElementById('book-date-label').textContent =
      `📅 ${d}. ${MONTHS_DE[m - 1]} ${y}`;
    document.getElementById('book-time').value = '10:00';
    document.getElementById('book-note').value = '';
    show('modal-book');
  },

  sendBookingRequest() {
    const dk   = State.pendingApptDay;
    const time = document.getElementById('book-time').value;
    const note = document.getElementById('book-note').value.trim();
    if (!dk) { toast('Fehler: kein Tag ausgewählt'); return; }

    const reqs = getRequests();
    reqs.push({
      id: 'r' + Date.now(),
      day: dk,
      time,
      note,
      clientName: State.clientName,
      clientId: '',
      status: 'pending',
      ts: Date.now()
    });
    saveRequests(reqs);
    hide('modal-book');
    App.renderClientCal();
    toast('Anfrage gesendet ✓ Dein Barber wird bestätigen.');
  },

  /* ── TAB SWITCHING ────────────────────────────── */

  switchTab(btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tabId = btn.dataset.tab;
    document.getElementById(tabId).classList.add('active');

    if (tabId === 'tab-dashboard') {
      App.refreshStats();
      App.renderRequests();
      App.renderRecentPayments();
    } else if (tabId === 'tab-calendar') {
      App.renderAdminCal();
    } else if (tabId === 'tab-clients') {
      App.renderClients();
    } else if (tabId === 'tab-groups') {
      App.renderGroups();
    }
  },

  /* ── INTERNAL: Build Calendar HTML ───────────── */

  _buildCalHTML(y, m, todayKey, dayFn) {
    const firstDay = new Date(y, m, 1).getDay();  // 0=So, 1=Mo, …
    const offset   = (firstDay === 0) ? 6 : firstDay - 1; // Mo-first offset
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let html = '';
    // Empty cells
    for (let i = 0; i < offset; i++) html += '<div class="cal-day empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
      const dk      = dateKey(y, m, d);
      const isToday = dk === todayKey;
      const { cls, dot } = dayFn(dk);
      html += `<div class="cal-day ${cls}${isToday ? ' today' : ''}" data-key="${dk}">
                 <span class="day-num">${d}</span>${dot}
               </div>`;
    }
    return html;
  }

};

/* ── Keyboard Support ───────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const modal = document.querySelector('.modal:not(.hidden)');
    if (!modal) return;
    if (modal.id === 'modal-login')      App.doAdminLogin();
    if (modal.id === 'modal-join')       App.doJoinGroup();
    if (modal.id === 'modal-add-client') App.saveClient();
    if (modal.id === 'modal-add-appt')   App.saveAppointment();
    if (modal.id === 'modal-book')       App.sendBookingRequest();
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});

/* ── Service Worker registrieren ─────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW:', err));
  });
}

/* ── Init ────────────────────────────────────────── */
window.App = App;
