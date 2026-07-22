function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.getElementById('view-' + id).classList.add('active-view');
  const tabViews = ['overview', 'clients', 'agentone', 'settings'];
  if (tabViews.includes(id)) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[data-tab="' + id + '"]').classList.add('active');
  }
  document.getElementById('fab').style.display = (id === 'overview' || id === 'clients') ? 'flex' : 'none';
  window.scrollTo(0, 0);
}

async function apiCall(path, options) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    alert("Une erreur est survenue, merci de réessayer.");
    return null;
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

async function createClient() {
  const name = document.getElementById('new-client-name').value.trim();
  if (!name) { alert('Le nom du client est obligatoire.'); return; }
  const payload = {
    name,
    contactFirstName: document.getElementById('new-client-first-name').value.trim() || null,
    contactLastName: document.getElementById('new-client-last-name').value.trim() || null,
    metier: document.getElementById('new-client-metier').value.trim() || null,
    activityDescription: document.getElementById('new-client-activity').value.trim() || null,
  };
  const result = await apiCall('/admin/api/clients', { body: JSON.stringify(payload) });
  if (result) location.reload();
}

let currentProfileId = null;

async function openProfile(id) {
  currentProfileId = id;
  const data = await apiCall('/admin/api/clients/' + id, { method: 'GET' });
  if (!data) return;
  renderProfile(data);
  showView('client-profile');
}

function renderProfile(data) {
  const a = data.artisan;
  document.getElementById('profile-name').textContent = a.name;
  document.getElementById('profile-name-input').value = a.name;
  document.getElementById('profile-first-name-input').value = a.contactFirstName || '';
  document.getElementById('profile-last-name-input').value = a.contactLastName || '';
  document.getElementById('profile-metier-input').value = a.metier || '';
  document.getElementById('profile-activity-input').value = a.activityDescription || '';
  document.getElementById('profile-twilio-input').value = a.twilioNumber || '';
  document.getElementById('profile-forwarding-input').value = a.forwardingNumber || '';

  const statusEl = document.getElementById('profile-status');
  statusEl.textContent = statusLabel(data.status);
  statusEl.className = 'status-pill ' + data.status;
  document.getElementById('profile-pause-btn').textContent = data.status === 'en_pause' ? 'Réactiver' : 'Mettre en pause';
  document.getElementById('profile-link').textContent = location.origin + '/dashboard/' + a.dashboardToken;

  document.getElementById('profile-notes-list').innerHTML = data.notes.length
    ? data.notes.map(n => `<div class="detail-row"><span>${escapeHtml(n.body)}</span></div>`).join('')
    : `<div class="detail-row"><span class="client-meta">Aucune note pour l'instant</span></div>`;

  document.getElementById('profile-tasks-list').innerHTML = data.tasks.length
    ? data.tasks.map(t => `<div class="task-item ${t.done ? 'done' : ''}"><input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask('${t.id}', this.checked)"><span>${escapeHtml(t.body)}</span></div>`).join('')
    : `<div class="detail-row"><span class="client-meta">Aucune tâche pour l'instant</span></div>`;
}

function statusLabel(status) {
  return status === 'actif' ? 'Actif' : status === 'en_pause' ? 'En pause' : 'En attente';
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

async function saveProfile() {
  const fields = {
    name: document.getElementById('profile-name-input').value.trim(),
    contactFirstName: document.getElementById('profile-first-name-input').value.trim() || null,
    contactLastName: document.getElementById('profile-last-name-input').value.trim() || null,
    metier: document.getElementById('profile-metier-input').value.trim() || null,
    activityDescription: document.getElementById('profile-activity-input').value.trim() || null,
    twilioNumber: document.getElementById('profile-twilio-input').value.trim() || null,
    forwardingNumber: document.getElementById('profile-forwarding-input').value.trim() || null,
  };
  const result = await apiCall('/admin/api/clients/' + currentProfileId, { body: JSON.stringify(fields) });
  if (result) openProfile(currentProfileId);
}

async function toggleClientStatus() {
  const statusEl = document.getElementById('profile-status');
  const next = statusEl.classList.contains('en_pause') ? 'actif' : 'en_pause';
  const result = await apiCall('/admin/api/clients/' + currentProfileId, { body: JSON.stringify({ subscriptionStatus: next }) });
  if (result) openProfile(currentProfileId);
}

async function deleteClient() {
  if (!confirm('Supprimer définitivement ce client ? Cette action est irréversible.')) return;
  const result = await apiCall('/admin/api/clients/' + currentProfileId + '/delete');
  if (result) location.href = '/admin';
}

function copyProfileLink() {
  const link = document.getElementById('profile-link').textContent;
  navigator.clipboard.writeText(link).then(() => alert('Lien copié.'));
}

async function addNote() {
  const input = document.getElementById('new-note-input');
  if (!input.value.trim()) return;
  const result = await apiCall('/admin/api/clients/' + currentProfileId + '/notes', { body: JSON.stringify({ body: input.value.trim() }) });
  input.value = '';
  if (result) openProfile(currentProfileId);
}

async function addTask() {
  const input = document.getElementById('new-task-input');
  if (!input.value.trim()) return;
  const result = await apiCall('/admin/api/clients/' + currentProfileId + '/tasks', { body: JSON.stringify({ body: input.value.trim() }) });
  input.value = '';
  if (result) openProfile(currentProfileId);
}

async function toggleTask(taskId, done) {
  await apiCall('/admin/api/tasks/' + taskId + '/toggle', { body: JSON.stringify({ done }) });
}

// ---------------------------------------------------------------------------
// Labo Agent One — Test de conversation (simulation uniquement)
// ---------------------------------------------------------------------------

let laboClients = [];
let laboCurrentClientId = null;
let laboState = null;
let laboHistory = '';
let laboTurns = []; // { historyBefore, actualReply } — pour le signalement d'une réponse précise

async function openLabo() {
  if (laboClients.length === 0) {
    laboClients = await apiCall('/admin/api/labo/clients', { method: 'GET' }) || [];
  }
  if (laboClients.length === 0) {
    alert("Aucun client à tester pour l'instant — crée d'abord une fiche client.");
    return;
  }
  document.getElementById('labo-client-pills').innerHTML = laboClients
    .map((c, i) => `<span class="${i === 0 ? 'active' : ''}" onclick="selectLaboClient('${c.id}', this)">${escapeHtml(c.name)}</span>`)
    .join('');
  selectLaboClient(laboClients[0].id, document.querySelector('#labo-client-pills span'));
  showView('labo');
}

function selectLaboClient(id, el) {
  document.querySelectorAll('#labo-client-pills span').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  laboCurrentClientId = id;
  resetLabo();
}

function resetLabo() {
  laboState = null;
  laboHistory = '';
  laboTurns = [];
  document.getElementById('chat-box').innerHTML = '<div class="bubble-row" style="justify-content:center;"><div class="bubble system">Nouvelle conversation de test — rien n\'est envoyé pour de vrai.</div></div>';
}

function appendAgentBubble(replyText, turnIndex) {
  const box = document.getElementById('chat-box');
  box.innerHTML += `<div class="bubble-row" style="justify-content:flex-end;"><div class="bubble agent">${escapeHtml(replyText)}</div></div>
    <div class="flag-link" data-turn="${turnIndex}" onclick="openFlagForm(${turnIndex}, this)">Signaler un problème sur cette réponse</div>`;
  box.scrollTop = box.scrollHeight;
}

async function sendTestMessage() {
  const input = document.getElementById('test-message-input');
  const message = input.value.trim();
  if (!message || !laboCurrentClientId) return;

  const box = document.getElementById('chat-box');
  box.innerHTML += `<div class="bubble-row"><div class="bubble client">${escapeHtml(message)}</div></div>`;
  input.value = '';
  box.scrollTop = box.scrollHeight;

  const historyBefore = laboHistory;
  const result = await apiCall('/admin/api/labo/simulate', {
    body: JSON.stringify({ artisanId: laboCurrentClientId, state: laboState, history: laboHistory, message }),
  });
  if (!result) return;

  const turnIndex = laboTurns.length;
  laboTurns.push({ historyBefore: historyBefore ? `${historyBefore}\nClient: ${message}` : `Client: ${message}`, actualReply: result.reply });
  appendAgentBubble(result.reply, turnIndex);

  laboHistory = laboHistory ? `${laboHistory}\nClient: ${message}\nAssistant: ${result.reply}` : `Client: ${message}\nAssistant: ${result.reply}`;
  laboState = result.nextState;
}

async function simulateMissedCallOpening() {
  if (!laboCurrentClientId) return;
  resetLabo();
  const result = await apiCall('/admin/api/labo/missed-call', { body: JSON.stringify({ artisanId: laboCurrentClientId }) });
  if (!result) return;

  document.getElementById('chat-box').innerHTML = '<div class="bubble-row" style="justify-content:center;"><div class="bubble system">Simulation : l\'appel n\'a mené nulle part, Agent One envoie le premier message.</div></div>';
  const turnIndex = laboTurns.length;
  laboTurns.push({ historyBefore: '', actualReply: result.reply });
  appendAgentBubble(result.reply, turnIndex);

  laboHistory = `Assistant: ${result.reply}`;
  laboState = result.nextState;
}

// ---------------------------------------------------------------------------
// Signalement d'une réponse ratée — jusqu'à 3 exemples de bonne réponse +
// le pourquoi, envoyés immédiatement (pas de confirmation à part) : dès
// l'envoi, la correction est enregistrée et réinjectée automatiquement
// dans toutes les réponses futures d'Agent One (voir composeReply côté
// serveur) — pas besoin d'une validation supplémentaire.
// ---------------------------------------------------------------------------

function openFlagForm(turnIndex, linkEl) {
  linkEl.outerHTML = `<div class="detail-list" id="flag-form-${turnIndex}" style="padding: 10px 12px; margin-top: -4px; margin-bottom: 8px;">
    <label style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">Exemples de bonne réponse (1 à 3)</label>
    <div id="flag-examples-${turnIndex}">
      <textarea class="flag-example" rows="2" placeholder="Exemple 1" style="width:100%; font-family:inherit; font-size:13px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); margin-bottom:6px;"></textarea>
    </div>
    <div class="flag-add-example" onclick="addFlagExample(${turnIndex})" style="font-size:12px; color:var(--accent); cursor:pointer; margin-bottom:8px;">+ Ajouter un exemple</div>
    <label style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">Pourquoi (ce qui n'allait pas / ce qu'il fallait faire)</label>
    <textarea id="flag-reasoning-${turnIndex}" rows="2" placeholder="Explique le pourquoi du comment..." style="width:100%; font-family:inherit; font-size:13px; padding:8px 10px; border-radius:8px; border:1px solid var(--border);"></textarea>
    <div style="display:flex; gap:8px;">
      <button class="btn-secondary" style="margin-top:6px;" onclick="cancelFlagForm(${turnIndex})">Annuler</button>
      <button class="btn-primary" style="margin-top:6px;" onclick="submitFlag(${turnIndex})">Envoyer le signalement</button>
    </div>
  </div>`;
}

function addFlagExample(turnIndex) {
  const container = document.getElementById('flag-examples-' + turnIndex);
  if (container.children.length >= 3) return;
  const n = container.children.length + 1;
  const textarea = document.createElement('textarea');
  textarea.className = 'flag-example';
  textarea.rows = 2;
  textarea.placeholder = 'Exemple ' + n;
  textarea.style.cssText = 'width:100%; font-family:inherit; font-size:13px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); margin-bottom:6px;';
  container.appendChild(textarea);
  if (container.children.length >= 3) {
    document.querySelector('#flag-form-' + turnIndex + ' .flag-add-example').style.display = 'none';
  }
}

function cancelFlagForm(turnIndex) {
  const container = document.getElementById('flag-form-' + turnIndex);
  container.outerHTML = `<div class="flag-link" data-turn="${turnIndex}" onclick="openFlagForm(${turnIndex}, this)">Signaler un problème sur cette réponse</div>`;
}

async function submitFlag(turnIndex) {
  const form = document.getElementById('flag-form-' + turnIndex);
  const expectedReplies = Array.from(form.querySelectorAll('.flag-example')).map(t => t.value.trim()).filter(Boolean);
  const reasoning = document.getElementById('flag-reasoning-' + turnIndex).value.trim();
  if (expectedReplies.length === 0) { alert('Ajoute au moins un exemple de bonne réponse.'); return; }
  if (!reasoning) { alert('Explique le pourquoi du comment.'); return; }

  const turn = laboTurns[turnIndex];
  const result = await apiCall('/admin/api/labo/feedback', {
    body: JSON.stringify({
      artisanId: laboCurrentClientId,
      conversationExcerpt: turn.historyBefore,
      actualReply: turn.actualReply,
      expectedReplies,
      reasoning,
    }),
  });
  if (!result) return;
  form.outerHTML = `<div style="font-size:12px; color:var(--positive); margin-top:-4px; margin-bottom:8px;">✓ Signalé et déjà pris en compte pour les prochaines réponses d'Agent One</div>`;
}

// ---------------------------------------------------------------------------
// Problèmes signalés
// ---------------------------------------------------------------------------

async function openIssues() {
  const issues = await apiCall('/admin/api/labo/feedback', { method: 'GET' }) || [];
  document.getElementById('issues-list').innerHTML = issues.length
    ? `<div class="detail-list">` + issues.map(({ feedback, artisanName }) => `
        <div class="detail-row" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:600; font-size:13.5px;">${escapeHtml(artisanName)}</span>
            <span class="status-pill ${feedback.status === 'ouvert' ? 'en_attente' : 'actif'}" style="cursor:pointer;" onclick="toggleIssue('${feedback.id}', '${feedback.status === 'ouvert' ? 'resolu' : 'ouvert'}')">${feedback.status === 'ouvert' ? 'Ouvert' : 'Résolu'}</span>
          </div>
          <div style="font-size:12.5px; color:var(--text-secondary);">Réponse d'Agent One : "${escapeHtml(feedback.actualReply)}"</div>
          <div style="font-size:12.5px;">${feedback.expectedReplies.map(r => `Attendu : "${escapeHtml(r)}"`).join('<br>')}</div>
          <div style="font-size:12px; color:var(--text-secondary); font-style:italic;">${escapeHtml(feedback.reasoning)}</div>
        </div>`).join('') + `</div>`
    : `<div class="empty-state">Aucun problème signalé pour l'instant.</div>`;
  showView('issues');
}

async function toggleIssue(id, status) {
  await apiCall('/admin/api/labo/feedback/' + id + '/toggle', { body: JSON.stringify({ status }) });
  openIssues();
}
