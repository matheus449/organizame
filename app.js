'use strict';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => key(new Date());
const uid = () => crypto.randomUUID();

const paths = {
  home: 'M3 10 12 3l9 7v10H15v-6H9v6H3Z',
  note: 'M15 3H5v18h14V7Z M15 3v5h5 M8 12h7 M8 16h5',
  calendar: 'M4 5h16v16H4Z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M5 12h14 M14 7l5 5-5 5',
  edit: 'm14 5 5 5 M4 20l4-1L21 6l-4-4L4 15Z',
  trash: 'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  pin: 'm9 3 6 0-1 7 4 4H6l4-4Z M12 14v7',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6',
  check: 'M20 6 9 17l-5-5',
  clock: 'M12 6v6l4 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0'
};

const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.plus}"/></svg>`;

let db;
let tab = 'inicio';
let selected = today();
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let search = '';
let filterDate = '';
let filterColor = 'todas';
let toastTimer;

// Estado do temporizador de pausa/foco suave
let focusTimer = null;
let focusSeconds = 15 * 60;
let focusRunning = false;
let focusPreset = 15;

try {
  db = JSON.parse(localStorage.getItem('organizame:v2'));
} catch {}

if (!db || !Array.isArray(db.events) || !Array.isArray(db.notes)) {
  db = {
    version: 2,
    profile: { id: uid(), name: 'Você', photo: '' },
    events: [],
    notes: [],
    theme: 'light',
    lastBackup: null,
    itemSchedules: {},
    notifiedLog: {}
  };
}

if (!db.itemSchedules || typeof db.itemSchedules !== 'object') db.itemSchedules = {};
if (!db.notifiedLog || typeof db.notifiedLog !== 'object') db.notifiedLog = {};

if (!db.pinnedBoards) {
  db.pinnedBoards = {
    verde: { title: '', text: '' },
    amarelo: { title: '', text: '' },
    vermelho: { title: '', text: '' }
  };
} else {
  for (const k of ['verde', 'amarelo', 'vermelho']) {
    if (!db.pinnedBoards[k]) db.pinnedBoards[k] = { title: '', text: '' };
    if (db.pinnedBoards[k].title && db.pinnedBoards[k].title.startsWith('Quadro ')) {
      db.pinnedBoards[k].title = '';
    }
  }
}

function migrate() {
  if (localStorage.getItem('organizame:v2')) return;
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u?.nome) db.profile.name = u.nome;
    db.profile.photo = localStorage.getItem('@organizame:foto_perfil') || '';
    const slots = JSON.parse(localStorage.getItem('@slots_' + (u?.email || u?.nome || 'usuario')) || '{}');
    for (const [date, arr] of Object.entries(slots)) {
      if (Array.isArray(arr)) {
        for (const s of arr) {
          db.events.push({
            id: uid(),
            date,
            title: s.titulo || 'Compromisso',
            description: s.descricao || '',
            start: s.horaInicio || '08:00',
            end: s.horaFim || '09:00',
            priority: s.prioridade === 'alta' ? 'alta' : 'normal',
            done: false,
            notifyStart: true,
            notifyEnd: false,
            notifyBefore: 10
          });
        }
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith('@diario_')) continue;
      let ns;
      try {
        ns = JSON.parse(localStorage.getItem(k));
      } catch {
        ns = localStorage.getItem(k);
      }
      if (typeof ns === 'string') ns = [{ texto: ns }];
      if (Array.isArray(ns)) {
        for (const n of ns) {
          db.notes.push({
            id: uid(),
            text: n.texto || '',
            title: '',
            date: n.data || k.slice(8) + 'T12:00:00',
            pinned: false
          });
        }
      }
    }
    save();
  } catch {
    toast('Não foi possível importar todos os dados antigos. Os originais foram preservados.');
  }
}

function save() {
  try {
    localStorage.setItem('organizame:v2', JSON.stringify(db));
    return true;
  } catch {
    toast('Não foi possível salvar. Exporte um backup e verifique o espaço do navegador.');
    return false;
  }
}

function toast(msg, action) {
  clearTimeout(toastTimer);
  $('#toast').textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.textContent = 'Desfazer';
    b.onclick = () => {
      action();
      $('#toast').style.display = 'none';
    };
    $('#toast').append(b);
  }
  $('#toast').style.display = 'block';
  toastTimer = setTimeout(() => {
    $('#toast').style.display = 'none';
  }, 6500);
}

// ==========================================================================
// Sistema de Notificações Estilo Windows + Som de Notificação Alto e Característico
// ==========================================================================

// Toque de notificação único, bem alto e característico (curto como notificação, mas audível mesmo com música)
function playCharacteristicNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Compressor dinâmico para deixar o som da notificação bem encorpado e alto
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-22, ctx.currentTime);
    compressor.knee.setValueAtTime(4, ctx.currentTime);
    compressor.ratio.setValueAtTime(14, ctx.currentTime);
    compressor.attack.setValueAtTime(0.001, ctx.currentTime);
    compressor.release.setValueAtTime(0.12, ctx.currentTime);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.95, ctx.currentTime);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Acorde triplo ascendente característico de notificação (estilo Windows/sistema moderno, ~0.95s)
    const chimeNotes = [
      { t: 0.00, d: 0.16, f1: 880.00,  f2: 1760.00 }, // A5 + A6
      { t: 0.13, d: 0.16, f1: 1174.66, f2: 2349.32 }, // D6 + D7
      { t: 0.26, d: 0.62, f1: 1760.00, f2: 3520.00 }  // A6 + A7 (ressonância cristalina que corta música)
    ];

    for (const note of chimeNotes) {
      const start = ctx.currentTime + note.t;
      const stop = start + note.d;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(note.f1, start);
      osc2.frequency.setValueAtTime(note.f2, start);

      noteGain.gain.setValueAtTime(0.001, start);
      noteGain.gain.exponentialRampToValueAtTime(0.9, start + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.001, stop);

      osc1.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(compressor);

      osc1.start(start);
      osc2.start(start);
      osc1.stop(stop + 0.02);
      osc2.stop(stop + 0.02);
    }

    setTimeout(() => {
      try { ctx.close(); } catch {}
    }, 1100);
  } catch {}
}

// Renderiza a notificação visual idêntica ao banner nativo escuro do Windows 10/11 (canto inferior direito)
function showWindowsStyleBanner(title, body, targetTab = 'inicio') {
  let stack = document.getElementById('winNotifyStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'winNotifyStack';
    stack.className = 'win-notify-stack';
    document.body.appendChild(stack);
  }

  const card = document.createElement('div');
  card.className = 'win-notify-card';
  card.setAttribute('role', 'alert');
  card.innerHTML = `
    <button type="button" class="win-notify-close" aria-label="Fechar notificação" title="Fechar">×</button>
    <div class="win-notify-icon">
      <img src="./logo.png" alt="" onerror="this.style.display='none'">
      <span class="win-notify-fallback-icon">${icon('bell')}</span>
    </div>
    <div class="win-notify-content">
      <strong class="win-notify-title">${esc(title)}</strong>
      <p class="win-notify-body">${esc(body)}</p>
      <div class="win-notify-footer">
        <span>Google Chrome • organizame</span>
      </div>
    </div>
  `;

  const dismiss = () => {
    card.classList.add('closing');
    setTimeout(() => card.remove(), 220);
  };

  card.querySelector('.win-notify-close').onclick = e => {
    e.stopPropagation();
    dismiss();
  };

  card.onclick = () => {
    navigate(targetTab);
    dismiss();
  };

  stack.appendChild(card);

  // Mantém visível por 12 segundos no canto inferior direito
  setTimeout(() => {
    if (card.isConnected) {
      card.classList.add('closing');
      setTimeout(() => card.remove(), 220);
    }
  }, 12000);
}

async function ensureNotificationPermission() {
  if (!('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    return false;
  }
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch {
    return false;
  }
}

async function sendSystemNotification(title, body, targetTab = 'inicio', tag = undefined) {
  playCharacteristicNotificationSound();
  showWindowsStyleBanner(title, body, targetTab);

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options = {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: tag || 'organizame-' + Date.now(),
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { tab: targetTab }
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return;
      }
    }
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      navigate(targetTab);
      n.close();
    };
  } catch {}
}

function parseDateTimeMs(dateStr, timeStr) {
  if (!dateStr || !timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

// Verifica se um item de checklist (ex: board:verde:0 ou note:id:2) já está marcado como concluído [x]
function isChecklistItemCompleted(schedKey) {
  const parts = String(schedKey).split(':');
  if (parts.length < 3) return false;
  const ownerType = parts[0];
  const lineIdx = Number(parts[parts.length - 1]);
  const ownerId = parts.slice(1, -1).join(':');
  let rawText = '';
  if (ownerType === 'board') {
    rawText = db.pinnedBoards?.[ownerId]?.text || '';
  } else if (ownerType === 'note') {
    const noteObj = db.notes.find(n => String(n.id) === String(ownerId));
    rawText = noteObj?.text || '';
  }
  const lines = String(rawText).split('\n');
  const line = lines[lineIdx];
  if (!line) return false;
  return /^\s*(?:-\s*)?\[[xX]\]\s+/.test(line);
}

// Obtém o texto atualizado de um item de checklist (sem o "- [ ]")
function getChecklistItemTitle(schedKey, fallbackTitle = 'Atividade') {
  const parts = String(schedKey).split(':');
  if (parts.length >= 3) {
    const ownerType = parts[0];
    const lineIdx = Number(parts[parts.length - 1]);
    const ownerId = parts.slice(1, -1).join(':');
    let rawText = '';
    if (ownerType === 'board') {
      rawText = db.pinnedBoards?.[ownerId]?.text || '';
    } else if (ownerType === 'note') {
      const noteObj = db.notes.find(n => String(n.id) === String(ownerId));
      rawText = noteObj?.text || '';
    }
    const line = String(rawText).split('\n')[lineIdx];
    if (line) {
      const cleaned = line.replace(/^\s*(?:-\s*)?\[[ xX]\]\s+/, '').trim();
      if (cleaned) return cleaned;
    }
  }
  return fallbackTitle || 'Atividade';
}

function getUrgencyFromSchedKey(schedKey) {
  const parts = String(schedKey).split(':');
  if (parts.length >= 3) {
    const ownerType = parts[0];
    const ownerId = parts.slice(1, -1).join(':');
    if (ownerType === 'board') {
      if (['verde', 'amarelo', 'vermelho'].includes(ownerId)) return ownerId;
    } else if (ownerType === 'note') {
      const noteObj = db.notes.find(n => String(n.id) === String(ownerId));
      if (noteObj && ['verde', 'amarelo', 'vermelho'].includes(noteObj.color)) return noteObj.color;
    }
  }
  return 'amarelo';
}

function getUrgencyNotificationTitle(urgency) {
  if (urgency === 'verde' || urgency === 'baixa') {
    return 'Você tem uma atividade pouco urgente';
  }
  if (urgency === 'vermelho' || urgency === 'alta') {
    return 'Você tem uma atividade muito urgente';
  }
  return 'Você tem uma atividade urgente';
}

function getSampleTaskForNotification() {
  for (const [schedKey, sc] of Object.entries(db.itemSchedules || {})) {
    if (sc && sc.enabled && !isChecklistItemCompleted(schedKey)) {
      const taskTitle = getChecklistItemTitle(schedKey, sc.title);
      const urgency = getUrgencyFromSchedKey(schedKey);
      const isOvernight = sc.start && sc.end && sc.end <= sc.start;
      const timeDesc = sc.start
        ? `${sc.start}${sc.end ? ' às ' + sc.end + (isOvernight ? ' (+1 dia)' : '') : ''}`
        : `até ${sc.end}`;
      return {
        title: getUrgencyNotificationTitle(urgency),
        body: `${taskTitle} (${timeDesc})`
      };
    }
  }
  for (const bId of ['vermelho', 'amarelo', 'verde']) {
    const text = db.pinnedBoards?.[bId]?.text || '';
    const line = text.split('\n').find(l => l.trim() && !/^\s*(?:-\s*)?\[[xX]\]\s+/.test(l));
    if (line) {
      const clean = line.replace(/^\s*(?:-\s*)?\[[ xX]\]\s+/, '').trim();
      if (clean) {
        return {
          title: getUrgencyNotificationTitle(bId),
          body: clean
        };
      }
    }
  }
  const nextEv = db.events.find(e => !e.done);
  if (nextEv) {
    return {
      title: getUrgencyNotificationTitle(nextEv.priority),
      body: nextEv.allDay ? nextEv.title : `${nextEv.title} (${nextEv.start}${nextEv.end ? ' às ' + nextEv.end : ''})`
    };
  }
  const firstNote = db.notes[0];
  if (firstNote) {
    const clean = firstNote.title || firstNote.text.split('\n')[0].replace(/^\s*(?:-\s*)?\[[ xX]\]\s+/, '').slice(0, 60);
    return {
      title: getUrgencyNotificationTitle(firstNote.color),
      body: clean
    };
  }
  return {
    title: 'Você tem uma atividade urgente',
    body: 'Revisar suas tarefas do dia'
  };
}

function checkScheduledNotifications() {
  const now = Date.now();
  let changed = false;

  // Limpa registros antigos de mais de 3 dias para manter o localStorage leve
  for (const [k, ts] of Object.entries(db.notifiedLog || {})) {
    if (now - ts > 3 * 86400000) {
      delete db.notifiedLog[k];
      changed = true;
    }
  }

  // Coleta todas as atividades com horário (Agenda + Anotações + Itens de Checklist)
  const tasks = [];

  // 1. Compromissos da Agenda
  for (const ev of db.events) {
    if (ev.done || ev.allDay) continue;
    tasks.push({
      uid: `event:${ev.id}`,
      title: ev.title,
      urgency: ev.priority || 'normal',
      date: ev.date,
      start: ev.start,
      end: ev.end,
      notifyStart: !!ev.notifyStart,
      notifyEnd: !!ev.notifyEnd,
      notifyBefore: Number(ev.notifyBefore ?? 10),
      tab: 'agenda'
    });
  }

  // 2. Anotações com horário
  for (const n of db.notes) {
    if (!n.schedule || !n.schedule.enabled) continue;
    const sc = n.schedule;
    const firstLine = (n.text || '').split('\n')[0].replace(/^\s*(?:-\s*)?\[[ xX]\]\s+/, '').slice(0, 60);
    tasks.push({
      uid: `note:${n.id}`,
      title: n.title || firstLine || 'Atividade',
      urgency: n.color || 'amarelo',
      date: sc.date || today(),
      start: sc.start,
      end: sc.end,
      notifyStart: !!sc.notifyStart,
      notifyEnd: !!sc.notifyEnd,
      notifyBefore: Number(sc.notifyBefore ?? 10),
      tab: 'notas'
    });
  }

  // 3. Itens individuais de checklist com horário (ignora os que já foram marcados como concluídos)
  for (const [schedKey, sc] of Object.entries(db.itemSchedules || {})) {
    if (!sc || !sc.enabled) continue;
    if (isChecklistItemCompleted(schedKey)) continue;
    tasks.push({
      uid: `item:${schedKey}`,
      title: getChecklistItemTitle(schedKey, sc.title),
      urgency: getUrgencyFromSchedKey(schedKey),
      date: sc.date || today(),
      start: sc.start,
      end: sc.end,
      notifyStart: !!sc.notifyStart,
      notifyEnd: !!sc.notifyEnd,
      notifyBefore: Number(sc.notifyBefore ?? 10),
      tab: 'notas'
    });
  }

  // Verifica gatilhos de Início e de Término
  for (const t of tasks) {
    const beforeMin = Number.isFinite(t.notifyBefore) ? t.notifyBefore : 10;
    const notifHeader = getUrgencyNotificationTitle(t.urgency);
    const isOvernight = t.start && t.end && t.end <= t.start;

    // Verificação de INÍCIO
    if (t.notifyStart && t.start) {
      const startMs = parseDateTimeMs(t.date, t.start);
      if (startMs) {
        // Notificação antecipada (se beforeMin > 0)
        if (beforeMin > 0) {
          const advanceMs = startMs - beforeMin * 60000;
          const advKey = `${t.uid}:start:adv:${t.date}:${t.start}:${beforeMin}`;
          if (!db.notifiedLog[advKey] && now >= advanceMs && now < startMs) {
            db.notifiedLog[advKey] = now;
            changed = true;
            sendSystemNotification(
              notifHeader,
              `${t.title} — Começa em ${beforeMin} min (às ${t.start}).`,
              t.tab,
              advKey
            );
          }
        }
        // Notificação no horário exato de iniciar
        const exactStartKey = `${t.uid}:start:exact:${t.date}:${t.start}`;
        if (!db.notifiedLog[exactStartKey] && now >= startMs && now <= startMs + 10 * 60000) {
          db.notifiedLog[exactStartKey] = now;
          changed = true;
          sendSystemNotification(
            notifHeader,
            `${t.title} — Hora de iniciar (${t.start}${t.end ? ' às ' + t.end + (isOvernight ? ' do dia seguinte' : '') : ''}).`,
            t.tab,
            exactStartKey
          );
        }
      }
    }

    // Verificação de TÉRMINO (suporta atividades que viram de um dia para o outro, ex: 12:00 às 11:00)
    if (t.notifyEnd && t.end) {
      let endMs = parseDateTimeMs(t.date, t.end);
      if (endMs && isOvernight) {
        endMs += 86400000; // +1 dia
      }
      if (endMs) {
        // Notificação antecipada de término (se beforeMin > 0)
        if (beforeMin > 0) {
          const advanceEndMs = endMs - beforeMin * 60000;
          const advEndKey = `${t.uid}:end:adv:${t.date}:${t.end}:${beforeMin}`;
          if (!db.notifiedLog[advEndKey] && now >= advanceEndMs && now < endMs) {
            db.notifiedLog[advEndKey] = now;
            changed = true;
            sendSystemNotification(
              notifHeader,
              `${t.title} — Termina em ${beforeMin} min (às ${t.end}).`,
              t.tab,
              advEndKey
            );
          }
        }
        // Notificação no horário exato de finalizar
        const exactEndKey = `${t.uid}:end:exact:${t.date}:${t.end}`;
        if (!db.notifiedLog[exactEndKey] && now >= endMs && now <= endMs + 10 * 60000) {
          db.notifiedLog[exactEndKey] = now;
          changed = true;
          sendSystemNotification(
            notifHeader,
            `${t.title} — Prazo de finalizar (${t.end}).`,
            t.tab,
            exactEndKey
          );
        }
      }
    }
  }

  if (changed) save();
}

setInterval(checkScheduledNotifications, 15000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkScheduledNotifications();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'NAVIGATE_TAB' && event.data.tab) {
      navigate(event.data.tab);
    }
  });
}

function navigate(next) {
  tab = ['inicio', 'notas', 'agenda', 'perfil'].includes(next) ? next : 'inicio';
  history.replaceState(null, '', '#' + tab);
  render();
}

function render() {
  document.body.classList.toggle('dark', db.theme === 'dark');
  $('nav').innerHTML = [
    ['inicio', 'home', 'Início'],
    ['agenda', 'calendar', 'Agenda'],
    ['notas', 'note', 'Anotações'],
    ['perfil', 'user', 'Meu espaço']
  ].map(([id, ic, label]) =>
    `<button data-tab="${id}" class="${tab === id ? 'active' : ''}" ${tab === id ? 'aria-current="page"' : ''} title="${label}">${icon(ic)}<span>${label}</span></button>`
  ).join('');

  document.querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => navigate(b.dataset.tab);
  });

  $('#profileButton').innerHTML = db.profile.photo
    ? `<img src="${esc(db.profile.photo)}" alt="">`
    : esc(db.profile.name.charAt(0));

  $('#breadcrumb').textContent = {
    inicio: 'Seu espaço pessoal',
    agenda: 'Um espaço para seus planos',
    notas: 'Ideias que merecem ficar',
    perfil: 'Do seu jeito'
  }[tab];

  ({ inicio: home, agenda: agenda, notas: notes, perfil: profile })[tab]();
}

function heading(kicker, title, sub, action) {
  return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${sub}</p></div>${action || ''}</div>`;
}

const newButton = () => `<button class="glass primary" data-new>${icon('plus')} Novo compromisso</button>`;

function sorted(events) {
  return events.slice().sort((a, b) =>
    a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '')
  );
}

function formatScheduleBadge(sc, isCompleted = false) {
  if (!sc || !sc.enabled || (!sc.start && !sc.end)) return '';
  const datePart = sc.date && sc.date !== today()
    ? new Date(sc.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' '
    : '';
  const isOvernight = sc.start && sc.end && sc.end <= sc.start;
  const timePart = sc.start && sc.end
    ? `${sc.start}–${sc.end}${isOvernight ? ' (+1d)' : ''}`
    : sc.start
      ? `Início ${sc.start}`
      : `Até ${sc.end}`;
  const hasBell = sc.notifyStart || sc.notifyEnd;
  return `<span class="item-time-badge ${hasBell ? 'has-bell' : ''} ${isCompleted ? 'is-completed' : ''}" title="${hasBell ? `Aviso configurado (${sc.notifyBefore ?? 10} min antes)${isOvernight ? ' · Termina no dia seguinte' : ''}` : 'Horário definido'}">${icon(hasBell ? 'bell' : 'clock')}<span class="badge-time-text">${esc(datePart + timePart)}</span></span>`;
}

// Renderiza texto com suporte a linhas de checklist interativas e botão de definir horário por atividade
function renderFormattedText(rawText, ownerType, ownerId) {
  if (!rawText) return '';
  const lines = String(rawText).split('\n');
  const hasChecklist = ownerType === 'board' || lines.some(l => /^\s*(?:-\s*)?\[([ xX])\]\s+/.test(l));
  if (!hasChecklist) {
    return esc(rawText);
  }
  return lines.map((line, idx) => {
    const match = line.match(/^\s*(?:-\s*)?\[([ xX])\]\s+(.*)$/);
    if (match || (ownerType === 'board' && line.trim())) {
      const checked = match ? match[1].toLowerCase() === 'x' : false;
      const content = match ? match[2] : line.trim();
      const schedKey = `${ownerType}:${ownerId}:${idx}`;
      const sc = db.itemSchedules?.[schedKey];
      const badgeHTML = formatScheduleBadge(sc, checked);
      return `<div class="checklist-row ${checked ? 'is-checked' : ''}">
        <label class="checklist-item ${checked ? 'is-checked' : ''}" data-check-owner="${esc(ownerType)}" data-check-id="${esc(ownerId)}" data-check-line="${idx}">
          <input type="checkbox" ${checked ? 'checked' : ''}>
          <span class="check-box">${icon('check')}</span>
          <span class="check-label">${esc(content)}</span>
        </label>
        <div class="checklist-actions">
          ${badgeHTML}
          <button type="button" class="icon-btn item-clock-btn ${sc?.enabled ? 'active' : ''}" data-item-sched="${esc(schedKey)}" data-item-title="${esc(content)}" title="Alterar horário e aviso desta atividade" aria-label="Horário para ${esc(content)}">${icon('clock')}</button>
          ${ownerType === 'board' ? `<button type="button" class="icon-btn item-clock-btn item-del-btn" data-board-del="${esc(ownerId)}" data-line-idx="${idx}" title="Remover tarefa" aria-label="Remover ${esc(content)}">×</button>` : ''}
        </div>
      </div>`;
    }
    return `<span class="text-line">${esc(line)}</span>`;
  }).join('');
}

// Modal para configurar horário de início, término e notificações de um item de atividade
function openItemScheduleDialog(schedKey, itemTitle) {
  const existing = db.itemSchedules?.[schedKey] || {
    enabled: true,
    date: today(),
    start: '',
    end: '',
    notifyStart: true,
    notifyEnd: true,
    notifyBefore: 10
  };
  const d = document.createElement('dialog');
  d.innerHTML = `<form id="itemSchedForm">
    <div class="dialog-head">
      <div>
        <small>HORÁRIO E LEMBRETES DA ATIVIDADE</small>
        <h2>${esc(itemTitle || 'Configurar horário')}</h2>
      </div>
      <button type="button" class="icon-btn" id="closeItemSched" aria-label="Fechar">×</button>
    </div>
    <label>Data da atividade
      <input type="date" id="schedDate" value="${esc(existing.date || today())}" required>
    </label>
    <div class="two">
      <label>Horário de início
        <input type="time" id="schedStart" value="${esc(existing.start || '')}">
      </label>
      <label>Horário de término
        <input type="time" id="schedEnd" value="${esc(existing.end || '')}">
      </label>
    </div>
    <div class="notify-settings-box">
      <span class="notify-box-title">Como você quer ser avisado?</span>
      <div class="notify-checks">
        <label class="check"><input type="checkbox" id="schedNotifyStart" ${existing.notifyStart !== false ? 'checked' : ''}> Avisar sobre o início da atividade</label>
        <label class="check"><input type="checkbox" id="schedNotifyEnd" ${existing.notifyEnd ? 'checked' : ''}> Avisar sobre o final da atividade</label>
      </div>
      <label>Com quanto tempo antes a notificação deve ser entregue?
        <select id="schedNotifyBefore">
          ${[
            [0, 'No horário exato (0 min antes)'],
            [5, '5 minutos antes'],
            [10, '10 minutos antes'],
            [15, '15 minutos antes'],
            [30, '30 minutos antes'],
            [60, '1 hora antes']
          ].map(([val, label]) => `<option value="${val}" ${Number(existing.notifyBefore ?? 10) === val ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
    </div>
    <p id="itemSchedError" role="alert" style="color:#b05040;font-size:12px;margin-top:8px"></p>
    <div class="dialog-actions">
      ${db.itemSchedules?.[schedKey]?.enabled ? `<button type="button" class="glass danger" id="removeItemSched">Remover horário</button>` : ''}
      <button type="button" class="glass" id="cancelItemSched">Cancelar</button>
      <button type="submit" class="glass primary">Salvar horário ↗</button>
    </div>
  </form>`;
  document.body.append(d);
  d.showModal();
  const close = () => {
    d.close();
    d.remove();
  };
  $('#closeItemSched').onclick = close;
  $('#cancelItemSched').onclick = close;
  d.oncancel = () => d.remove();
  if ($('#removeItemSched')) {
    $('#removeItemSched').onclick = () => {
      delete db.itemSchedules[schedKey];
      save();
      close();
      notes();
      toast('Horário removido da atividade.');
    };
  }
  $('#itemSchedForm').onsubmit = async e => {
    e.preventDefault();
    const date = $('#schedDate').value || today();
    const start = $('#schedStart').value;
    const end = $('#schedEnd').value;
    const notifyStart = $('#schedNotifyStart').checked;
    const notifyEnd = $('#schedNotifyEnd').checked;
    const notifyBefore = Number($('#schedNotifyBefore').value);

    if (!start && !end) {
      $('#itemSchedError').textContent = 'Informe pelo menos o horário de início ou de término.';
      return;
    }

    if (notifyStart || notifyEnd) {
      await ensureNotificationPermission();
    }

    if (!db.itemSchedules) db.itemSchedules = {};
    db.itemSchedules[schedKey] = {
      enabled: true,
      title: itemTitle,
      date,
      start,
      end,
      notifyStart,
      notifyEnd,
      notifyBefore
    };
    save();
    close();
    notes();
    checkScheduledNotifications();
    toast('Horário e avisos configurados.');
  };
}

function toggleChecklistLine(ownerType, ownerId, lineIndex) {
  const idx = Number(lineIndex);
  if (ownerType === 'board') {
    const board = db.pinnedBoards?.[ownerId];
    if (!board || !board.text) return;
    const lines = board.text.split('\n');
    if (idx < 0 || idx >= lines.length) return;
    if (/^\s*(?:-\s*)?\[([ xX])\]\s+/.test(lines[idx])) {
      lines[idx] = lines[idx].replace(/^(\s*(?:-\s*)?\[)([ xX])(\]\s+)/, (_, p1, state, p3) =>
        `${p1}${state.toLowerCase() === 'x' ? ' ' : 'x'}${p3}`
      );
    } else {
      lines[idx] = `- [x] ${lines[idx].trim()}`;
    }
    board.text = lines.join('\n');
    board.updated = new Date().toISOString();
    save();
    notes();
  } else if (ownerType === 'note') {
    const note = db.notes.find(n => n.id === ownerId);
    if (!note || !note.text) return;
    const lines = note.text.split('\n');
    if (idx < 0 || idx >= lines.length) return;
    lines[idx] = lines[idx].replace(/^(\s*(?:-\s*)?\[)([ xX])(\]\s+)/, (_, p1, state, p3) =>
      `${p1}${state.toLowerCase() === 'x' ? ' ' : 'x'}${p3}`
    );
    note.text = lines.join('\n');
    note.updated = new Date().toISOString();
    save();
    notes();
  }
}

function deleteBoardTaskLine(boardId, lineIndex) {
  const idx = Number(lineIndex);
  const board = db.pinnedBoards?.[boardId];
  if (!board || !board.text) return;
  const lines = board.text.split('\n');
  if (idx < 0 || idx >= lines.length) return;
  const totalOld = lines.length;
  lines.splice(idx, 1);
  board.text = lines.join('\n');
  board.updated = new Date().toISOString();

  // Reorganiza os horários dos itens seguintes daquele quadro
  if (db.itemSchedules) {
    delete db.itemSchedules[`board:${boardId}:${idx}`];
    for (let i = idx + 1; i < totalOld; i++) {
      const oldKey = `board:${boardId}:${i}`;
      const newKey = `board:${boardId}:${i - 1}`;
      if (db.itemSchedules[oldKey]) {
        db.itemSchedules[newKey] = db.itemSchedules[oldKey];
        delete db.itemSchedules[oldKey];
      }
    }
  }
  save();
  notes();
  toast('Tarefa removida.');
}

function eventHTML(e) {
  const hasNotify = !e.allDay && (e.notifyStart || e.notifyEnd);
  const notifySummary = hasNotify
    ? ` · 🔔 ${e.notifyStart && e.notifyEnd ? 'Início e fim' : e.notifyStart ? 'Início' : 'Fim'} (${e.notifyBefore ? e.notifyBefore + 'm antes' : 'na hora'})`
    : '';
  return `<div class="event ${e.done ? 'is-done' : ''}">
    <div class="event-time">${e.allDay ? 'Dia todo' : esc(e.start)}<small>${e.allDay ? '' : esc(e.end)}</small></div>
    <div class="event-info">
      <strong><span class="dot ${e.priority === 'alta' ? 'high' : e.priority === 'baixa' ? 'low' : ''}"></span><span class="event-title-text">${esc(e.title)}</span></strong>
      <p>${tab === 'inicio' ? new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : esc(e.description || 'Reserve esse momento para você.')}${e.series ? ' · Repetição semanal' : ''}${notifySummary}${e.done ? ' · Concluído' : ''}</p>
    </div>
    <button class="icon-btn check-event-btn ${e.done ? 'checked' : ''}" data-toggle-done="${e.id}" aria-label="${e.done ? 'Desmarcar conclusão de' : 'Marcar como concluído'} ${esc(e.title)}" title="${e.done ? 'Concluído (clique para reabrir)' : 'Marcar como concluído'}">${icon('check')}</button>
    <button class="icon-btn" data-edit="${e.id}" aria-label="Editar ${esc(e.title)}" title="Editar">${icon('edit')}</button>
    <button class="icon-btn" data-delete="${e.id}" aria-label="Excluir ${esc(e.title)}" title="Excluir">${icon('trash')}</button>
  </div>`;
}

function bindEvents() {
  document.querySelectorAll('[data-new]').forEach(b => {
    b.onclick = () => openEvent();
  });
  document.querySelectorAll('[data-toggle-done]').forEach(b => {
    b.onclick = () => {
      const ev = db.events.find(e => e.id === b.dataset.toggleDone);
      if (!ev) return;
      ev.done = !ev.done;
      if (save()) {
        render();
        toast(ev.done ? 'Compromisso concluído.' : 'Compromisso reaberto.');
      }
    };
  });
  document.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => openEvent(db.events.find(e => e.id === b.dataset.edit));
  });
  document.querySelectorAll('[data-delete]').forEach(b => {
    b.onclick = () => deleteEvent(b.dataset.delete);
  });
}

function formatFocusTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function updateFocusUI() {
  const display = $('#focusClock');
  const toggleBtn = $('#focusToggle');
  if (display) display.textContent = formatFocusTime(focusSeconds);
  if (toggleBtn) toggleBtn.textContent = focusRunning ? 'Pausar' : 'Iniciar pausa';
  document.querySelectorAll('[data-focus-min]').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.focusMin) === focusPreset);
  });
}

async function toggleFocusTimer() {
  if (focusRunning) {
    clearInterval(focusTimer);
    focusRunning = false;
    updateFocusUI();
    return;
  }
  await ensureNotificationPermission();
  focusRunning = true;
  updateFocusUI();
  focusTimer = setInterval(() => {
    if (focusSeconds > 0) {
      focusSeconds--;
      updateFocusUI();
    } else {
      clearInterval(focusTimer);
      focusRunning = false;
      focusSeconds = focusPreset * 60;
      updateFocusUI();
      sendSystemNotification(
        'Pausa concluída!',
        'Respire fundo e continue seu dia no seu ritmo.',
        'inicio',
        'focus-done'
      );
    }
  }, 1000);
}

// Calcula o progresso diário (compromissos de hoje + tarefas dos quadros de prioridade + checklists agendados para hoje)
function computeDailyProgress() {
  const todayStr = today();

  // 1. Compromissos da agenda de hoje
  const todayEvents = db.events.filter(e => e.date === todayStr);
  const eventsTotal = todayEvents.length;
  const eventsDone = todayEvents.filter(e => !!e.done).length;

  // 2. Tarefas nos 3 quadros fixos de prioridade (considera as de hoje ou sem data futura diferente)
  let boardTotal = 0;
  let boardDone = 0;
  for (const bId of ['verde', 'amarelo', 'vermelho']) {
    const raw = (db.pinnedBoards?.[bId]?.text || '').trim();
    if (!raw) continue;
    const lines = raw.split('\n');
    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      const sc = db.itemSchedules?.[`board:${bId}:${idx}`];
      // Se tiver data agendada para outro dia diferente de hoje, não entra na meta de hoje
      if (sc && sc.enabled && sc.date && sc.date !== todayStr) return;
      boardTotal++;
      if (/^\s*(?:-\s*)?\[[xX]\]\s+/.test(line)) {
        boardDone++;
      }
    });
  }

  // 3. Itens de checklist em anotações que estejam agendados para hoje
  let notesTotal = 0;
  let notesDone = 0;
  for (const n of db.notes) {
    const lines = String(n.text || '').split('\n');
    lines.forEach((line, idx) => {
      const m = line.match(/^\s*(?:-\s*)?\[([ xX])\]\s+/);
      if (!m) return;
      const sc = db.itemSchedules?.[`note:${n.id}:${idx}`];
      const isNoteFromToday = key(new Date(n.date)) === todayStr;
      if ((sc && sc.enabled && sc.date === todayStr) || (!sc && isNoteFromToday)) {
        notesTotal++;
        if (m[1].toLowerCase() === 'x') notesDone++;
      }
    });
  }

  const total = eventsTotal + boardTotal + notesTotal;
  const completed = eventsDone + boardDone + notesDone;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  let message = '';
  let subtitle = '';
  if (total === 0) {
    message = 'Seu dia está livre e tranquilo.';
    subtitle = 'Adicione planos apenas para o que realmente importa hoje, respeitando o seu bem-estar.';
  } else if (percent === 0) {
    message = 'Comece pelo que for mais leve.';
    subtitle = 'Um passo de cada vez já transforma o seu dia. Não há pressa.';
  } else if (percent < 50) {
    message = 'Bom começo! Siga no seu próprio ritmo.';
    subtitle = 'Cada atividade concluída abre mais espaço mental para você respirar.';
  } else if (percent < 100) {
    message = 'Mais da metade do caminho concluído!';
    subtitle = 'Reconheça o seu esforço até aqui e lembre-se de fazer pequenas pausas.';
  } else {
    message = 'Tudo concluído por hoje!';
    subtitle = 'Você cumpriu todas as atividades do dia. Descanse a mente e aproveite seu tempo.';
  }

  return {
    total,
    completed,
    percent,
    eventsTotal,
    eventsDone,
    tasksTotal: boardTotal + notesTotal,
    tasksDone: boardDone + notesDone,
    message,
    subtitle
  };
}

function home() {
  const hour = new Date().getHours();
  const g = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const upcoming = sorted(
    db.events.filter(e => !e.done && (e.date > today() || (e.date === today() && (e.allDay || e.end > new Date().toTimeString().slice(0, 5)))))
  ).slice(0, 3);
  const todayEvents = db.events.filter(e => e.date === today());
  const pendingToday = todayEvents.filter(e => !e.done).length;
  const prog = computeDailyProgress();
  const radius = 34;
  const circumference = +(2 * Math.PI * radius).toFixed(2);
  const dashOffset = +(circumference - (prog.percent / 100) * circumference).toFixed(2);

  $('#view').innerHTML =
    heading(
      new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
      `${g}, ${esc(db.profile.name === 'Você' ? 'que bom te ver' : db.profile.name.split(' ')[0])}.`,
      'Sua rotina pode ter mais espaço e menos pressa.',
      newButton()
    ) +
    `<section class="panel daily-progress-widget" aria-label="Progresso diário e bem-estar">
      <div class="progress-ring-wrap">
        <svg class="progress-ring-svg" viewBox="0 0 84 84" aria-hidden="true">
          <circle class="progress-ring-bg" cx="42" cy="42" r="${radius}" />
          <circle class="progress-ring-fill" cx="42" cy="42" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" />
        </svg>
        <div class="progress-ring-label">
          <strong>${prog.percent}%</strong>
          <span>hoje</span>
        </div>
      </div>
      <div class="progress-widget-info">
        <div class="progress-widget-top">
          <span class="eyebrow"> EQUILÍBRIO E PROGRESSO DO DIA</span>
          <span class="progress-count-badge">${prog.total > 0 ? `${prog.completed} de ${prog.total} concluídas` : 'Dia livre'}</span>
        </div>
        <h2>${esc(prog.message)}</h2>
        <p>${esc(prog.subtitle)}</p>
        <div class="progress-bar-track" role="progressbar" aria-valuenow="${prog.percent}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar-fill" style="width:${prog.percent}%"></div>
        </div>
        <div class="progress-pillars">
          <span>📅 Compromissos: <strong>${prog.eventsDone}/${prog.eventsTotal}</strong></span>
          <span>✓ Tarefas e quadros: <strong>${prog.tasksDone}/${prog.tasksTotal}</strong></span>
        </div>
      </div>
    </section>
    <section class="hero">
      <div>
        <span class="eyebrow">SEU DIA, NO SEU RITMO</span>
        <h2>${pendingToday ? `Você tem ${pendingToday} ${pendingToday === 1 ? 'plano pendente' : 'planos pendentes'} para hoje.` : todayEvents.length ? 'Tudo concluído por hoje.<br>Aproveite seu tempo.' : 'Um pouco de organização.<br>Um dia mais leve.'}</h2>
        <button class="glass" id="planDay">Vamos planejar o dia ${icon('arrow')}</button>
      </div>
      <span class="botanical" aria-hidden="true">🌿</span>
    </section>
    <div class="columns">
      <section>
        <div class="section-head">
          <h2>O que vem a seguir</h2>
          <button class="text-btn" id="seeAgenda">Ver agenda ↗</button>
        </div>
        <div class="panel">
          ${upcoming.length
            ? upcoming.map(eventHTML).join('')
            : `<div class="empty">${icon('calendar')}<h3>O dia está em aberto</h3><p>Adicione um compromisso e deixe os detalhes por nossa conta.</p><button class="glass" data-new>${icon('plus')} Criar meu primeiro plano</button></div>`}
        </div>
      </section>
      <section>
        <div class="section-head">
          <h2>Tire uma ideia da cabeça</h2>
          <button class="text-btn" id="seeNotes">Ver anotações ↗</button>
        </div>
        <div class="panel quicknote">
          <textarea id="quickDraft" aria-label="Anotação rápida" placeholder="Uma ideia, um lembrete, um pensamento… (use - [ ] para criar lista)"></textarea>
          <div class="bottom">
            <small id="draftStatus">Rascunho salvo neste navegador</small>
            <button class="glass" id="saveQuick">Guardar ${icon('arrow')}</button>
          </div>
        </div>
        <div class="inspiration">
          <div class="focus-header">
            <div>
              <span class="eyebrow">UMA PEQUENA PAUSA</span>
              <p>Você não precisa fazer tudo hoje.<br>Um passo de cada vez também é caminho.</p>
            </div>
            <div class="focus-widget">
              <div class="focus-clock" id="focusClock">${formatFocusTime(focusSeconds)}</div>
              <div class="focus-presets">
                ${[5, 15, 25].map(min => `<button type="button" class="focus-chip ${focusPreset === min ? 'active' : ''}" data-focus-min="${min}">${min}m</button>`).join('')}
              </div>
              <div class="focus-controls">
                <button type="button" class="glass" id="focusToggle">${focusRunning ? 'Pausar' : 'Iniciar pausa'}</button>
                <button type="button" class="text-btn" id="focusReset" title="Reiniciar">↺</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>`;

  $('#planDay').onclick = () => {
    selected = today();
    navigate('agenda');
  };
  $('#seeAgenda').onclick = () => navigate('agenda');
  $('#seeNotes').onclick = () => navigate('notas');

  const draft = $('#quickDraft');
  draft.value = localStorage.getItem('organizame:draft') || '';
  draft.oninput = () => {
    try {
      localStorage.setItem('organizame:draft', draft.value);
    } catch {
      toast('Não foi possível salvar o rascunho.');
    }
  };
  $('#saveQuick').onclick = () => {
    if (!draft.value.trim()) return draft.focus();
    db.notes.push({
      id: uid(),
      title: '',
      text: draft.value.trim(),
      color: 'branco',
      date: new Date().toISOString(),
      pinned: false
    });
    if (save()) {
      draft.value = '';
      localStorage.removeItem('organizame:draft');
      toast('Anotação guardada.');
    }
  };

  $('#focusToggle').onclick = toggleFocusTimer;
  $('#focusReset').onclick = () => {
    clearInterval(focusTimer);
    focusRunning = false;
    focusSeconds = focusPreset * 60;
    updateFocusUI();
  };
  document.querySelectorAll('[data-focus-min]').forEach(btn => {
    btn.onclick = () => {
      clearInterval(focusTimer);
      focusRunning = false;
      focusPreset = Number(btn.dataset.focusMin);
      focusSeconds = focusPreset * 60;
      updateFocusUI();
    };
  });

  bindEvents();
}

function agenda() {
  const y = month.getFullYear();
  const m = month.getMonth();
  const offset = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  let cells = '<span></span>'.repeat(offset);

  for (let d = 1; d <= days; d++) {
    const k = key(new Date(y, m, d));
    const dayEvents = db.events.filter(e => e.date === k);
    const dotsHTML = dayEvents.length
      ? `<span class="day-dots">${dayEvents.slice(0, 3).map(ev => `<i class="${ev.done ? 'done' : ev.priority === 'alta' ? 'high' : ''}"></i>`).join('')}</span>`
      : '';
    cells += `<button class="${k === selected ? 'selected ' : ''}${k === today() ? 'today' : ''}" data-day="${k}" aria-label="${d} de ${month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}" aria-pressed="${k === selected}">${d}${dotsHTML}</button>`;
  }

  const events = sorted(db.events.filter(e => e.date === selected));
  const doneCount = events.filter(e => e.done).length;

  $('#view').innerHTML =
    heading('CADA COISA NO SEU TEMPO', 'Minha agenda.', 'Planos pequenos ou grandes. Todos têm seu espaço.', newButton()) +
    `<div class="columns">
      <section class="panel">
        <div class="calendar-toolbar">
          <h2>${month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
          <div>
            <button class="icon-btn" id="prev" aria-label="Mês anterior">‹</button>
            <button class="glass" id="todayBtn" style="padding:5px 12px;font-size:11px">Hoje</button>
            <button class="icon-btn" id="next" aria-label="Próximo mês">›</button>
          </div>
        </div>
        <div class="week">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div>
        <div class="calendar">${cells}</div>
      </section>
      <section>
        <div class="agenda-day-header">
          <p class="date-label" style="margin:0">${new Date(selected + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          ${events.length ? `<small class="muted">${doneCount}/${events.length} concluídos</small>` : ''}
        </div>
        <div class="panel">
          ${events.length
            ? events.map(eventHTML).join('')
            : `<div class="empty">${icon('calendar')}<h3>Espaço para seus planos</h3><p>Nenhum compromisso neste dia.</p><button class="glass" data-new>${icon('plus')} Adicionar compromisso</button></div>`}
        </div>
      </section>
    </div>`;

  $('#prev').onclick = () => {
    month = new Date(y, m - 1, 1);
    agenda();
  };
  $('#next').onclick = () => {
    month = new Date(y, m + 1, 1);
    agenda();
  };
  $('#todayBtn').onclick = () => {
    selected = today();
    month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    agenda();
  };
  document.querySelectorAll('[data-day]').forEach(b => {
    b.onclick = () => {
      selected = b.dataset.day;
      agenda();
    };
  });
  bindEvents();
}

const form = $('#eventForm');
const field = n => form.elements.namedItem(n);
let editing = null;

function openEvent(e) {
  editing = e || null;
  form.reset();
  $('#formError').textContent = '';
  $('#dialogTitle').textContent = e ? 'Editar compromisso' : 'Novo compromisso';
  for (const n of ['id', 'title', 'description', 'start', 'end', 'priority']) {
    field(n).value = e?.[n] || (n === 'priority' ? 'normal' : '');
  }
  field('date').value = e?.date || (tab === 'agenda' ? selected : today());
  field('allDay').checked = !!e?.allDay;
  field('notifyStart').checked = e ? !!e.notifyStart : true;
  field('notifyEnd').checked = e ? !!e.notifyEnd : false;
  field('notifyBefore').value = String(e?.notifyBefore ?? 10);
  field('repeat').value = 'none';
  field('repeat').disabled = !!e;
  $('#untilLabel').hidden = true;
  field('until').required = false;
  $('#scopeLabel').hidden = !e?.series;
  syncAllDay();
  if (!e) {
    try {
      const draft = JSON.parse(localStorage.getItem('organizame:eventDraft') || 'null');
      if (draft) {
        for (const n of ['title', 'description', 'date', 'start', 'end', 'priority']) {
          if (draft[n]) field(n).value = draft[n];
        }
        field('allDay').checked = draft.allDay === 'on';
        syncAllDay();
      }
    } catch {}
  }
  $('#editor').showModal();
  field('title').focus();
}

function syncAllDay() {
  const isAllDay = field('allDay').checked;
  for (const n of ['start', 'end']) {
    field(n).disabled = isAllDay;
    field(n).required = !isAllDay;
  }
  const notifyBox = $('#eventNotifyBox');
  if (notifyBox) notifyBox.hidden = isAllDay;
}

field('allDay').onchange = syncAllDay;
field('repeat').onchange = () => {
  $('#untilLabel').hidden = field('repeat').value !== 'weekly';
  field('until').required = field('repeat').value === 'weekly';
};

function closeEditor() {
  if (!editing && field('title').value.trim()) {
    try {
      localStorage.setItem('organizame:eventDraft', JSON.stringify(Object.fromEntries(new FormData(form))));
    } catch {}
  }
  $('#editor').close();
}

$('#editor').addEventListener('cancel', e => {
  e.preventDefault();
  closeEditor();
});
$('#closeDialog').onclick = closeEditor;
$('#cancelDialog').onclick = closeEditor;

form.onsubmit = async e => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(form));
  v.allDay = field('allDay').checked;
  v.notifyStart = !v.allDay && field('notifyStart').checked;
  v.notifyEnd = !v.allDay && field('notifyEnd').checked;
  v.notifyBefore = Number(field('notifyBefore').value || 10);
  v.title = v.title.trim();
  const fail = t => ($('#formError').textContent = t);
  if (!v.title) return fail('Dê um título ao compromisso.');
  if (v.repeat === 'weekly' && (!v.until || v.until < v.date)) return fail('Escolha uma data final posterior ao início.');
  if (v.repeat === 'weekly' && new Date(v.until) - new Date(v.date) > 366 * 86400000) return fail('Escolha um período de até um ano para esta série.');

  if (v.notifyStart || v.notifyEnd) {
    await ensureNotificationPermission();
  }

  const before = structuredClone(db.events);
  const base = {
    title: v.title,
    description: v.description,
    date: v.date,
    start: v.start || '',
    end: v.end || '',
    allDay: v.allDay,
    priority: v.priority,
    notifyStart: v.notifyStart,
    notifyEnd: v.notifyEnd,
    notifyBefore: v.notifyBefore
  };

  if (editing) {
    const targets = db.events.filter(x =>
      x.id === editing.id ||
      (editing.series && x.series === editing.series && (v.scope === 'all' || (v.scope === 'future' && x.date >= editing.date)))
    );
    const delta = Math.round((new Date(v.date + 'T12:00:00') - new Date(editing.date + 'T12:00:00')) / 86400000);
    for (const x of targets) {
      const d = new Date(x.date + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      Object.assign(x, base, { date: key(d) });
    }
  } else if (v.repeat === 'weekly') {
    const series = uid();
    for (let d = new Date(v.date + 'T12:00:00'); key(d) <= v.until; d.setDate(d.getDate() + 7)) {
      db.events.push({ ...base, id: uid(), series, date: key(d), done: false });
    }
  } else {
    db.events.push({ ...base, id: uid(), done: false });
  }

  if (!save()) {
    db.events = before;
    return;
  }
  localStorage.removeItem('organizame:eventDraft');
  $('#editor').close();
  render();
  checkScheduledNotifications();
  toast('Compromisso salvo.');
};

function deleteEvent(id) {
  const event = db.events.find(x => x.id === id);
  if (!event) return;
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<h2>Excluir compromisso?</h2><p>${esc(event.title)}</p>${event.series ? '<label>Excluir<select id="deleteScope"><option value="one">Somente este</option><option value="future">Este e os próximos</option><option value="all">Toda a série</option></select></label>' : ''}<div class="dialog-actions"><button class="glass" id="keepEvent">Cancelar</button><button class="glass danger" id="confirmDelete">Excluir</button></div>`;
  document.body.append(dialog);
  dialog.showModal();
  const cleanup = () => {
    dialog.close();
    dialog.remove();
  };
  $('#keepEvent').onclick = cleanup;
  dialog.oncancel = () => dialog.remove();
  $('#confirmDelete').onclick = () => {
    const scope = $('#deleteScope')?.value || 'one';
    const before = structuredClone(db.events);
    db.events = db.events.filter(x => !(
      x.id === id ||
      (event.series && x.series === event.series && (scope === 'all' || (scope === 'future' && x.date >= event.date)))
    ));
    if (!save()) {
      db.events = before;
      return;
    }
    cleanup();
    render();
    toast('Compromisso excluído.', () => {
      db.events = before;
      save();
      render();
    });
  };
}

const boardDefs = [
  { id: 'verde', level: 'Pouco urgente', placeholder: 'Sem pressa, no seu tempo…' },
  { id: 'amarelo', level: 'Urgente', placeholder: 'Atenção para os próximos dias…' },
  { id: 'vermelho', level: 'Muito urgente', placeholder: 'Resolver com prioridade…' }
];

// Modal de cadastro de tarefa nos quadros coloridos já com credenciamento de horário e notificação
function openBoardTaskRegistrationDialog(boardId, initialTitle = '') {
  const bDef = boardDefs.find(x => x.id === boardId) || { id: boardId, level: 'Prioridade' };
  const cleanInitial = String(initialTitle).replace(/^\s*(?:-\s*)?\[[ xX]\]\s+/, '').trim();
  const d = document.createElement('dialog');
  d.innerHTML = `<form id="boardTaskRegForm">
    <div class="dialog-head">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="board-dot ${boardId}"></span>
        <div>
          <small>NOVA TAREFA · ${esc(bDef.level.toUpperCase())}</small>
          <h2>Cadastrar atividade e horário</h2>
        </div>
      </div>
      <button type="button" class="icon-btn" id="closeBoardTaskReg" aria-label="Fechar">×</button>
    </div>
    <label>Qual é a atividade?
      <input type="text" id="regTaskTitle" maxlength="160" required value="${esc(cleanInitial)}" placeholder="Ex: Entregar relatório, Estudar capítulo 4…">
    </label>
    <label>Data da atividade
      <input type="date" id="regTaskDate" value="${today()}" required>
    </label>
    <div class="two">
      <label>Horário de início
        <input type="time" id="regTaskStart" required>
      </label>
      <label>Horário de término
        <input type="time" id="regTaskEnd" required>
      </label>
    </div>
    <div class="notify-settings-box">
      <span class="notify-box-title">Como você quer ser avisado?</span>
      <div class="notify-checks">
        <label class="check"><input type="checkbox" id="regNotifyStart" checked> Avisar sobre o tempo de início da atividade</label>
        <label class="check"><input type="checkbox" id="regNotifyEnd" checked> Avisar sobre o tempo de final da atividade</label>
      </div>
      <label>Com quanto tempo antes a notificação vai ser entregue?
        <select id="regNotifyBefore">
          <option value="0">No horário exato (0 min antes)</option>
          <option value="5">5 minutos antes</option>
          <option value="10" selected>10 minutos antes</option>
          <option value="15">15 minutos antes</option>
          <option value="30">30 minutos antes</option>
          <option value="60">1 hora antes</option>
        </select>
      </label>
    </div>
    <p id="regTaskError" role="alert" style="color:#b05040;font-size:12px;margin-top:8px"></p>
    <div class="dialog-actions">
      <button type="button" class="glass" id="saveWithoutTimeBtn">Salvar sem horário</button>
      <button type="submit" class="glass primary">Cadastrar com horário ↗</button>
    </div>
  </form>`;
  document.body.append(d);
  d.showModal();

  const close = () => {
    d.close();
    d.remove();
  };
  $('#closeBoardTaskReg').onclick = close;
  d.oncancel = () => d.remove();

  const insertTaskIntoBoard = (titleText, scheduleObj) => {
    if (!db.pinnedBoards) db.pinnedBoards = {};
    const current = (db.pinnedBoards[boardId]?.text || '').trim();
    const lines = current ? current.split('\n') : [];
    const newIdx = lines.length;
    const formattedLine = `- [ ] ${titleText}`;
    lines.push(formattedLine);
    db.pinnedBoards[boardId] = {
      title: db.pinnedBoards[boardId]?.title || '',
      text: lines.join('\n'),
      updated: new Date().toISOString()
    };
    if (scheduleObj && scheduleObj.enabled) {
      if (!db.itemSchedules) db.itemSchedules = {};
      db.itemSchedules[`board:${boardId}:${newIdx}`] = scheduleObj;
    }
    save();
    close();
    notes();
    checkScheduledNotifications();
  };

  $('#saveWithoutTimeBtn').onclick = () => {
    const titleText = $('#regTaskTitle').value.trim();
    if (!titleText) {
      $('#regTaskError').textContent = 'Informe o nome da atividade.';
      $('#regTaskTitle').focus();
      return;
    }
    insertTaskIntoBoard(titleText, null);
    toast('Atividade adicionada.');
  };

  $('#boardTaskRegForm').onsubmit = async e => {
    e.preventDefault();
    const titleText = $('#regTaskTitle').value.trim();
    const date = $('#regTaskDate').value || today();
    const start = $('#regTaskStart').value;
    const end = $('#regTaskEnd').value;
    const notifyStart = $('#regNotifyStart').checked;
    const notifyEnd = $('#regNotifyEnd').checked;
    const notifyBefore = Number($('#regNotifyBefore').value || 10);

    if (!titleText) {
      $('#regTaskError').textContent = 'Informe o nome da atividade.';
      return;
    }
    if (!start && !end) {
      $('#regTaskError').textContent = 'Informe o horário de início e de término.';
      return;
    }

    if (notifyStart || notifyEnd) {
      await ensureNotificationPermission();
    }

    insertTaskIntoBoard(titleText, {
      enabled: true,
      title: titleText,
      date,
      start,
      end,
      notifyStart,
      notifyEnd,
      notifyBefore
    });
    toast('Atividade cadastrada com horário e avisos.');
  };

  if (cleanInitial) {
    $('#regTaskStart').focus();
  } else {
    $('#regTaskTitle').focus();
  }
}

function notes() {
  if (!db.pinnedBoards) {
    db.pinnedBoards = {
      verde: { title: '', text: '' },
      amarelo: { title: '', text: '' },
      vermelho: { title: '', text: '' }
    };
  } else {
    for (const k of ['verde', 'amarelo', 'vermelho']) {
      if (!db.pinnedBoards[k]) db.pinnedBoards[k] = { title: '', text: '' };
      if (db.pinnedBoards[k].title && db.pinnedBoards[k].title.startsWith('Quadro ')) {
        db.pinnedBoards[k].title = '';
      }
    }
  }

  const list = db.notes
    .filter(n => {
      const matchesSearch = !search || (n.text + ' ' + n.title).toLocaleLowerCase().includes(search.toLocaleLowerCase());
      const matchesDate = !filterDate || key(new Date(n.date)) === filterDate;
      const noteColor = n.color || 'branco';
      const matchesColor = filterColor === 'todas' || noteColor === filterColor;
      return matchesSearch && matchesDate && matchesColor;
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date));

  const fixedBoardsHTML = `<div class="fixed-notes-grid">${boardDefs.map(b => {
    const bd = db.pinnedBoards[b.id] || { title: '', text: '' };
    return `<article class="panel board-card ${b.id}" data-board="${b.id}">
      <div class="board-top">
        <div class="board-level">
          <span class="board-dot ${b.id}"></span>
          <span class="board-level-name">${b.level}</span>
        </div>
      </div>
      ${bd.title ? `<h3 class="board-title">${esc(bd.title)}</h3>` : ''}
      <div class="board-text ${!bd.text ? 'is-empty' : ''}">${bd.text ? renderFormattedText(bd.text, 'board', b.id) : esc(b.placeholder)}</div>
      <form class="board-quick-form" data-quick-board="${b.id}">
        <input type="text" class="board-quick-input" placeholder="+ Nova tarefa com horário… (Enter)" aria-label="Adicionar tarefa em ${b.level}">
      </form>
    </article>`;
  }).join('')}</div>`;

  const colorFiltersHTML = `<div class="color-filter-bar" role="group" aria-label="Filtrar por prioridade">
    ${[
      ['todas', 'Todas', ''],
      ['verde', 'Pouco urgente', 'verde'],
      ['amarelo', 'Urgente', 'amarelo'],
      ['vermelho', 'Muito urgente', 'vermelho'],
      ['branco', 'Em branco', 'branco']
    ].map(([id, label, dotClass]) =>
      `<button type="button" class="color-filter-chip ${filterColor === id ? 'active' : ''}" data-color-filter="${id}">
        ${dotClass && dotClass !== 'branco' ? `<span class="board-dot ${dotClass}" style="width:8px;height:8px;box-shadow:none"></span>` : ''}
        <span>${label}</span>
      </button>`
    ).join('')}
  </div>`;

  $('#view').innerHTML =
    heading(
      'PARA NÃO DEIXAR ESCAPAR',
      'Minhas anotações.',
      'Ideias, pensamentos e lembretes. Tudo em um lugar.',
      `<button class="glass primary" id="newNote">${icon('plus')} Nova anotação</button>`
    ) +
    fixedBoardsHTML +
    `<div class="filters">
      <input id="noteSearch" type="search" placeholder="Buscar nas suas anotações" aria-label="Buscar anotações" value="${esc(search)}">
      <input type="date" id="noteDate" aria-label="Filtrar por data" value="${filterDate}">
      <button class="glass" id="clearFilters">Limpar</button>
    </div>` +
    colorFiltersHTML +
    `<div class="notes-grid">${list.length
      ? list.map(n => {
          const checkLines = String(n.text || '').split('\n').filter(l => /^\s*(?:-\s*)?\[([ xX])\]\s+/.test(l));
          const allNoteChecksDone = checkLines.length > 0 && checkLines.every(l => /^\s*(?:-\s*)?\[[xX]\]\s+/.test(l));
          return `<article class="panel note ${n.pinned ? 'pinned' : ''} ${n.color ? 'color-' + n.color : ''}">
          <div class="note-meta">
            <small>${n.pinned ? 'FIXADA · ' : ''}${new Date(n.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</small>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${formatScheduleBadge(n.schedule, allNoteChecksDone)}
              ${n.color && n.color !== 'branco' ? `<span class="note-color-badge ${n.color}"><span class="dot"></span>${n.color === 'verde' ? 'Pouco urgente' : n.color === 'amarelo' ? 'Urgente' : 'Muito urgente'}</span>` : ''}
            </div>
          </div>`;
        }).map((metaHTML, idx) => {
          const n = list[idx];
          return metaHTML + `
          ${n.title ? `<h3 style="margin-top:12px">${esc(n.title)}</h3>` : ''}
          <div class="note-body" style="margin-top:12px">${renderFormattedText(n.text, 'note', n.id)}</div>`;
        }).map((bodyHTML, idx) => {
          const n = list[idx];
          return bodyHTML + `
          <div class="actions">
            <button class="icon-btn" data-pin="${n.id}" aria-label="${n.pinned ? 'Desafixar' : 'Fixar'} anotação" aria-pressed="${n.pinned}" title="${n.pinned ? 'Desafixar' : 'Fixar'}">${icon('pin')}</button>
            <button class="icon-btn" data-noteedit="${n.id}" aria-label="Editar anotação" title="Editar">${icon('edit')}</button>
            <button class="icon-btn" data-notedelete="${n.id}" aria-label="Excluir anotação" title="Excluir">${icon('trash')}</button>
          </div>
        </article>`;
        }).join('')
      : `<div class="panel empty">${icon('note')}<h3>${search || filterDate || filterColor !== 'todas' ? 'Nenhuma anotação encontrada' : 'Uma página em branco'}</h3><p>${search || filterDate || filterColor !== 'todas' ? 'Tente outra busca ou limpe os filtros.' : 'Tudo começa com uma ideia. Guarde a sua primeira anotação.'}</p></div>`
    }</div>`;

  $('#newNote').onclick = () => noteEditor();
  $('#noteSearch').oninput = e => {
    const position = e.target.selectionStart;
    search = e.target.value;
    notes();
    $('#noteSearch').focus();
    $('#noteSearch').setSelectionRange(position, position);
  };
  $('#noteDate').onchange = e => {
    filterDate = e.target.value;
    notes();
  };
  $('#clearFilters').onclick = () => {
    search = '';
    filterDate = '';
    filterColor = 'todas';
    notes();
  };

  document.querySelectorAll('[data-color-filter]').forEach(btn => {
    btn.onclick = () => {
      filterColor = btn.dataset.colorFilter;
      notes();
    };
  });

  document.querySelectorAll('[data-item-sched]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      openItemScheduleDialog(btn.dataset.itemSched, btn.dataset.itemTitle);
    };
  });

  document.querySelectorAll('[data-board-del]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      deleteBoardTaskLine(btn.dataset.boardDel, btn.dataset.lineIdx);
    };
  });

  document.querySelectorAll('.board-quick-form').forEach(f => {
    f.onclick = e => e.stopPropagation();
    f.onsubmit = e => {
      e.preventDefault();
      const input = f.querySelector('input');
      const val = input.value.trim();
      const bId = f.dataset.quickBoard;
      input.value = '';
      openBoardTaskRegistrationDialog(bId, val);
    };
  });

  document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(chk => {
    chk.onchange = e => {
      e.stopPropagation();
      const label = chk.closest('.checklist-item');
      toggleChecklistLine(label.dataset.checkOwner, label.dataset.checkId, label.dataset.checkLine);
    };
  });

  document.querySelectorAll('[data-pin]').forEach(b => {
    b.onclick = () => {
      const n = db.notes.find(x => x.id === b.dataset.pin);
      n.pinned = !n.pinned;
      if (!save()) n.pinned = !n.pinned;
      notes();
    };
  });
  document.querySelectorAll('[data-noteedit]').forEach(b => {
    b.onclick = () => noteEditor(db.notes.find(x => x.id === b.dataset.noteedit));
  });
  document.querySelectorAll('[data-notedelete]').forEach(b => {
    b.onclick = () => {
      const old = db.notes.slice();
      db.notes = db.notes.filter(x => x.id !== b.dataset.notedelete);
      if (!save()) {
        db.notes = old;
        return;
      }
      notes();
      toast('Anotação excluída.', () => {
        db.notes = old;
        save();
        render();
      });
    };
  });
}

function noteEditor(n) {
  const sc = n?.schedule || {
    enabled: false,
    date: today(),
    start: '',
    end: '',
    notifyStart: true,
    notifyEnd: false,
    notifyBefore: 10
  };
  const d = document.createElement('dialog');
  d.innerHTML = `<form id="noteForm">
    <div class="dialog-head">
      <h2>${n ? 'Editar' : 'Nova'} anotação</h2>
      <button type="button" class="icon-btn" id="closeNote" aria-label="Fechar">×</button>
    </div>
    <label>Título (opcional)<input id="noteTitle" maxlength="160" value="${esc(n?.title || '')}"></label>
    <label>Prioridade da anotação
      <select id="noteColor">
        <option value="branco" ${!n?.color || n?.color === 'branco' ? 'selected' : ''}>Normal (em branco)</option>
        <option value="verde" ${n?.color === 'verde' ? 'selected' : ''}>Pouco urgente (Verde)</option>
        <option value="amarelo" ${n?.color === 'amarelo' ? 'selected' : ''}>Urgente (Amarelo)</option>
        <option value="vermelho" ${n?.color === 'vermelho' ? 'selected' : ''}>Muito urgente (Vermelho)</option>
      </select>
    </label>
    <div class="editor-toolbar">
      <span>Anotação</span>
      <button type="button" class="text-btn" id="addNoteCheck">+ Item de checklist</button>
    </div>
    <textarea id="noteText" rows="6" required placeholder="Escreva com calma…">${esc(n?.text || localStorage.getItem('organizame:noteDraft') || '')}</textarea>

    <label class="check" style="margin-top:14px;font-weight:600">
      <input type="checkbox" id="noteHasSchedule" ${sc.enabled ? 'checked' : ''}> Definir horário e notificações para esta atividade
    </label>
    <div class="notify-settings-box" id="noteScheduleBox" ${sc.enabled ? '' : 'hidden'}>
      <label style="margin-top:0">Data da atividade
        <input type="date" id="noteSchedDate" value="${esc(sc.date || today())}">
      </label>
      <div class="two">
        <label>Hora de início
          <input type="time" id="noteSchedStart" value="${esc(sc.start || '')}">
        </label>
        <label>Hora de término
          <input type="time" id="noteSchedEnd" value="${esc(sc.end || '')}">
        </label>
      </div>
      <span class="notify-box-title" style="margin-top:12px">Como você quer ser avisado?</span>
      <div class="notify-checks">
        <label class="check"><input type="checkbox" id="noteNotifyStart" ${sc.notifyStart !== false ? 'checked' : ''}> Avisar sobre o início da atividade</label>
        <label class="check"><input type="checkbox" id="noteNotifyEnd" ${sc.notifyEnd ? 'checked' : ''}> Avisar sobre o final da atividade</label>
      </div>
      <label>Com quanto tempo antes a notificação vai ser entregue?
        <select id="noteNotifyBefore">
          ${[
            [0, 'No horário exato (0 min antes)'],
            [5, '5 minutos antes'],
            [10, '10 minutos antes'],
            [15, '15 minutos antes'],
            [30, '30 minutos antes'],
            [60, '1 hora antes']
          ].map(([val, label]) => `<option value="${val}" ${Number(sc.notifyBefore ?? 10) === val ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
    </div>

    <p id="noteFormError" role="alert" style="color:#b05040;font-size:12px;margin-top:8px"></p>
    <small class="muted">Rascunho preservado neste navegador.</small>
    <div class="dialog-actions">
      <button type="submit" class="glass primary">Guardar anotação ↗</button>
    </div>
  </form>`;
  document.body.append(d);
  d.showModal();
  const draftKey = n ? 'organizame:editDraft:' + n.id : 'organizame:noteDraft';
  const draft = localStorage.getItem(draftKey);
  if (draft !== null) $('#noteText').value = draft;
  $('#noteText').oninput = () => {
    try {
      localStorage.setItem(draftKey, $('#noteText').value);
    } catch {
      toast('Não foi possível preservar o rascunho.');
    }
  };
  $('#noteHasSchedule').onchange = () => {
    $('#noteScheduleBox').hidden = !$('#noteHasSchedule').checked;
  };
  $('#addNoteCheck').onclick = () => {
    const t = $('#noteText');
    const prefix = t.value && !t.value.endsWith('\n') ? '\n- [ ] ' : '- [ ] ';
    t.value += prefix;
    t.dispatchEvent(new Event('input'));
    t.focus();
  };
  const close = () => {
    d.close();
    d.remove();
  };
  $('#closeNote').onclick = close;
  d.oncancel = () => d.remove();
  $('#noteForm').onsubmit = async e => {
    e.preventDefault();
    const text = $('#noteText').value.trim();
    if (!text) return;

    const hasSched = $('#noteHasSchedule').checked;
    let schedule = { enabled: false };
    if (hasSched) {
      const sDate = $('#noteSchedDate').value || today();
      const sStart = $('#noteSchedStart').value;
      const sEnd = $('#noteSchedEnd').value;
      const nStart = $('#noteNotifyStart').checked;
      const nEnd = $('#noteNotifyEnd').checked;
      const nBefore = Number($('#noteNotifyBefore').value || 10);
      if (!sStart && !sEnd) {
        $('#noteFormError').textContent = 'Informe pelo menos o horário de início ou de término da atividade.';
        return;
      }
      if (nStart || nEnd) {
        await ensureNotificationPermission();
      }
      schedule = {
        enabled: true,
        date: sDate,
        start: sStart,
        end: sEnd,
        notifyStart: nStart,
        notifyEnd: nEnd,
        notifyBefore: nBefore
      };
    }

    const old = structuredClone(db.notes);
    const title = $('#noteTitle').value.trim();
    const color = $('#noteColor')?.value || 'branco';
    if (n) {
      Object.assign(n, { title, text, color, schedule, updated: new Date().toISOString() });
    } else {
      db.notes.push({ id: uid(), title, text, color, schedule, date: new Date().toISOString(), pinned: false });
    }
    if (!save()) {
      db.notes = old;
      return;
    }
    localStorage.removeItem(draftKey);
    close();
    notes();
    checkScheduledNotifications();
    toast('Anotação guardada.');
  };
  $('#noteText').focus();
}

function profile() {
  const daysSinceBackup = db.lastBackup
    ? Math.floor((Date.now() - Date.parse(db.lastBackup)) / 86400000)
    : null;
  const backupStatusText = daysSinceBackup === null
    ? 'Você ainda não exportou nenhum backup neste navegador.'
    : daysSinceBackup === 0
      ? 'Último backup exportado hoje.'
      : `Último backup exportado há ${daysSinceBackup} ${daysSinceBackup === 1 ? 'dia' : 'dias'}.`;

  const notifPerm = 'Notification' in window ? Notification.permission : 'unsupported';
  const notifStatusText = notifPerm === 'granted'
    ? 'Ativadas neste navegador (você receberá avisos mesmo em outra aba).'
    : notifPerm === 'denied'
      ? 'Bloqueadas no navegador (altere nas permissões de site na barra de endereço).'
      : notifPerm === 'default'
        ? 'Ainda não ativadas. Clique abaixo para permitir avisos de início e término.'
        : 'Este navegador não suporta notificações nativas.';

  $('#view').innerHTML =
    heading('UM POUCO MAIS SEU', 'Meu espaço.', 'Preferências e cuidado com os seus dados.') +
    `<div class="settings">
      <section class="panel">
        <h2>Seu perfil</h2>
        <label>Como podemos te chamar?<input id="profileName" maxlength="60" value="${esc(db.profile.name)}"></label>
        <div class="row">
          <div>${db.profile.photo ? `<img class="profile-photo" src="${esc(db.profile.photo)}" alt="Sua foto">` : `<span class="avatar" style="display:grid;place-items:center;width:60px;height:60px">${esc(db.profile.name.charAt(0))}</span>`}</div>
          <label style="flex:1">Foto de perfil<input type="file" accept="image/*" id="photo"></label>
        </div>
        <button class="glass" id="saveName">Salvar nome</button>
        <button class="text-btn" id="removePhoto">Remover foto</button>
      </section>
      <section class="panel">
        <h2>Notificações de atividades</h2>
        <p>${esc(notifStatusText)}</p>
        <div class="row">
          ${notifPerm !== 'granted' ? `<button class="glass primary" id="enableNotifBtn">${icon('bell')} Ativar notificações</button>` : ''}
          <button class="glass" id="testNotifBtn">Testar notificação agora</button>
        </div>
      </section>
      <section class="panel">
        <h2>Aparência</h2>
        <div class="row">
          <p style="margin:0">Escolha o ambiente mais confortável para você.</p>
          <button class="glass" id="settingTheme">${db.theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</button>
        </div>
      </section>
      <section class="panel">
        <h2>Seus dados, com você</h2>
        <p>As anotações, os compromissos e a foto ficam neste navegador. Eles não são sincronizados entre dispositivos. Faça um backup antes de limpar os dados do navegador.</p>
        <div class="backup-notice ${daysSinceBackup === null || daysSinceBackup > 15 ? 'needs-attention' : ''}">
          <span>${esc(backupStatusText)}</span>
        </div>
        <div class="row">
          <button class="glass" id="export">Exportar backup ↗</button>
          <button class="glass" id="import">Importar backup</button>
          <input type="file" id="importFile" accept="application/json" hidden>
        </div>
        <p style="font-size:11px;margin-bottom:0">A importação combina os registros com os existentes e preserva seu perfil atual.</p>
      </section>
    </div>`;

  if ($('#enableNotifBtn')) {
    $('#enableNotifBtn').onclick = async () => {
      await ensureNotificationPermission();
      const sample = getSampleTaskForNotification();
      profile();
      sendSystemNotification(sample.title, sample.body, 'perfil');
    };
  }
  $('#testNotifBtn').onclick = async () => {
    await ensureNotificationPermission();
    const sample = getSampleTaskForNotification();
    sendSystemNotification(sample.title, sample.body, 'perfil');
    profile();
  };

  $('#saveName').onclick = () => {
    const name = $('#profileName').value.trim();
    if (!name) return;
    const old = db.profile.name;
    db.profile.name = name;
    if (!save()) {
      db.profile.name = old;
      return;
    }
    render();
    toast('Nome atualizado.');
  };
  $('#settingTheme').onclick = toggleTheme;
  $('#removePhoto').onclick = () => {
    db.profile.photo = '';
    save();
    render();
  };
  $('#photo').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 15000000) return toast('Escolha uma imagem de até 15 MB.');
    try {
      const bitmap = await createImageBitmap(f);
      const canvas = document.createElement('canvas');
      const size = Math.min(bitmap.width, bitmap.height);
      canvas.width = canvas.height = 256;
      canvas.getContext('2d').drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 256, 256);
      const old = db.profile.photo;
      db.profile.photo = canvas.toDataURL('image/jpeg', 0.85);
      if (!save()) db.profile.photo = old;
      bitmap.close();
      render();
    } catch {
      toast('Não foi possível abrir esta imagem.');
    }
  };
  $('#export').onclick = () => {
    db.lastBackup = new Date().toISOString();
    save();
    const url = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'organiza-me-backup-' + today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    profile();
    toast('Backup preparado.');
  };
  $('#import').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (f.size > 10000000) throw Error();
      const data = JSON.parse(await f.text());
      if (data.version !== 2 || !Array.isArray(data.notes) || !Array.isArray(data.events)) throw Error();
      const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00'));
      for (const n of data.notes) {
        if (typeof n.id !== 'string' || typeof n.text !== 'string' || typeof n.title !== 'string' || !Number.isFinite(Date.parse(n.date))) throw Error();
      }
      for (const x of data.events) {
        if (typeof x.id !== 'string' || typeof x.title !== 'string' || !validDate(x.date) || (!x.allDay && (!/^\d{2}:\d{2}$/.test(x.start) || !/^\d{2}:\d{2}$/.test(x.end) || x.end <= x.start))) throw Error();
      }
      const old = structuredClone(db);
      db.notes.push(
        ...data.notes
          .filter(n => !db.notes.some(x => x.id === n.id))
          .map(n => ({
            id: n.id,
            title: n.title,
            text: n.text,
            color: ['verde', 'amarelo', 'vermelho', 'branco'].includes(n.color) ? n.color : 'branco',
            schedule: n.schedule && typeof n.schedule === 'object' ? n.schedule : undefined,
            date: n.date,
            pinned: !!n.pinned
          }))
      );
      db.events.push(
        ...data.events
          .filter(n => !db.events.some(x => x.id === n.id))
          .map(n => ({
            id: n.id,
            title: n.title,
            description: String(n.description || ''),
            date: n.date,
            start: n.start || '',
            end: n.end || '',
            allDay: !!n.allDay,
            done: !!n.done,
            notifyStart: n.notifyStart !== undefined ? !!n.notifyStart : true,
            notifyEnd: !!n.notifyEnd,
            notifyBefore: Number(n.notifyBefore ?? 10),
            priority: ['alta', 'normal', 'baixa'].includes(n.priority) ? n.priority : 'normal',
            series: typeof n.series === 'string' ? n.series : undefined
          }))
      );
      if (data.pinnedBoards && typeof data.pinnedBoards === 'object') {
        for (const k of ['verde', 'amarelo', 'vermelho']) {
          if (data.pinnedBoards[k] && !db.pinnedBoards[k]?.text) {
            db.pinnedBoards[k] = {
              title: String(data.pinnedBoards[k].title || ''),
              text: String(data.pinnedBoards[k].text || '')
            };
          }
        }
      }
      if (data.itemSchedules && typeof data.itemSchedules === 'object') {
        db.itemSchedules = { ...data.itemSchedules, ...db.itemSchedules };
      }
      if (!save()) {
        db = old;
        return;
      }
      render();
      toast('Backup importado com sucesso.');
    } catch {
      toast('Arquivo de backup inválido. Nenhum dado foi alterado.');
    }
  };
}

function toggleTheme() {
  db.theme = db.theme === 'dark' ? 'light' : 'dark';
  save();
  render();
}

$('#theme').onclick = toggleTheme;
$('#profileButton').onclick = () => navigate('perfil');
migrate();

const requested = new URLSearchParams(location.search).get('tab');
navigate(requested === 'diario' ? 'notas' : requested || location.hash.slice(1) || 'inicio');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// Gerenciamento do estado do menu lateral retrátil
const SIDEBAR_KEY = 'organizame:sidebar_collapsed';
let sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === 'true';

function updateSidebarState() {
  document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  const toggleBtn = $('#toggleSidebar');
  const headerBtn = $('#headerToggleSidebar');
  const label = sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral';
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-label', label);
    toggleBtn.setAttribute('title', label);
  }
  if (headerBtn) {
    headerBtn.setAttribute('aria-label', label);
    headerBtn.setAttribute('title', label);
  }
  positionGlassSelection();
  setTimeout(positionGlassSelection, 150);
  setTimeout(positionGlassSelection, 320);
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  try {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
  } catch {}
  updateSidebarState();
}

if ($('#toggleSidebar')) $('#toggleSidebar').onclick = toggleSidebar;
if ($('#headerToggleSidebar')) $('#headerToggleSidebar').onclick = toggleSidebar;

// Efeitos delegados de reflexo e seleção em vidro
function positionGlassSelection() {
  const nav = $('nav');
  if (!nav) return;
  const active = nav.querySelector('.active');
  if (!active) return;
  nav.style.setProperty('--nav-x', active.offsetLeft + 'px');
  nav.style.setProperty('--nav-y', active.offsetTop + 'px');
  nav.style.setProperty('--nav-w', active.offsetWidth + 'px');
  nav.style.setProperty('--nav-h', active.offsetHeight + 'px');
}

new MutationObserver(() => requestAnimationFrame(positionGlassSelection)).observe($('nav'), { childList: true });
window.addEventListener('resize', positionGlassSelection);
updateSidebarState();

document.addEventListener('pointermove', e => {
  const b = e.target.closest('.glass, nav button');
  if (!b) return;
  const r = b.getBoundingClientRect();
  b.style.setProperty('--light-x', ((e.clientX - r.left) / r.width) * 100 + '%');
  b.style.setProperty('--light-y', ((e.clientY - r.top) / r.height) * 100 + '%');
}, { passive: true });

document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.glass, nav button, .icon-btn, .avatar');
  if (!b || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = b.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const ring = document.createElement('span');
  ring.className = 'water-ring';
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, {
    width: size + 'px',
    height: size + 'px',
    left: e.clientX - r.left - size / 2 + 'px',
    top: e.clientY - r.top - size / 2 + 'px'
  });
  b.append(ring);
  ring.animate(
    [
      { transform: 'scale(.03)', opacity: 0.9, filter: 'blur(0px)' },
      { offset: 0.5, opacity: 0.45, filter: 'blur(.4px)' },
      { transform: 'scale(1)', opacity: 0, filter: 'blur(2px)' }
    ],
    { duration: 1000, easing: 'cubic-bezier(.16,.8,.25,1)' }
  ).finished.then(() => ring.remove()).catch(() => ring.remove());
  b.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(.95,.98)', offset: 0.25 },
      { transform: 'scale(1.025,.99)', offset: 0.55 },
      { transform: 'scale(1)' }
    ],
    { duration: 650, easing: 'cubic-bezier(.2,.8,.25,1)' }
  );
}, { passive: true });
