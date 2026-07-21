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
  const metier = document.getElementById('new-client-metier').value.trim();
  if (!name) { alert('Le nom du client est obligatoire.'); return; }
  const result = await apiCall('/admin/api/clients', { body: JSON.stringify({ name, metier: metier || null }) });
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
  document.getElementById('profile-metier-input').value = a.metier || '';
  document.getElementById('profile-twilio-input').value = a.twilioNumber || '';
  document.getElementById('profile-forwarding-input').value = a.forwardingNumber || '';

  const statusEl = document.getElementById('profile-status');
  statusEl.textContent = statusLabel(a.status);
  statusEl.className = 'status-pill ' + a.status;
  document.getElementById('profile-pause-btn').textContent = a.status === 'en_pause' ? 'Réactiver' : 'Mettre en pause';
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
    metier: document.getElementById('profile-metier-input').value.trim() || null,
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
  document.getElementById('chat-box').innerHTML = '<div class="bubble-row" style="justify-content:center;"><div class="bubble system">Nouvelle conversation de test — rien n\'est envoyé pour de vrai.</div></div>';
}

async function sendTestMessage() {
  const input = document.getElementById('test-message-input');
  const message = input.value.trim();
  if (!message || !laboCurrentClientId) return;

  const box = document.getElementById('chat-box');
  box.innerHTML += `<div class="bubble-row"><div class="bubble client">${escapeHtml(message)}</div></div>`;
  input.value = '';
  box.scrollTop = box.scrollHeight;

  const result = await apiCall('/admin/api/labo/simulate', {
    body: JSON.stringify({ artisanId: laboCurrentClientId, state: laboState, history: laboHistory, message }),
  });
  if (!result) return;

  box.innerHTML += `<div class="bubble-row" style="justify-content:flex-end;"><div class="bubble agent">${escapeHtml(result.reply)}</div></div>
    <div class="flag-link" onclick="alert('Signalement noté — fonctionnalité complète à venir.')">Signaler un problème sur cette réponse</div>`;
  box.scrollTop = box.scrollHeight;

  laboHistory = laboHistory ? `${laboHistory}\nClient: ${message}\nAssistant: ${result.reply}` : `Client: ${message}\nAssistant: ${result.reply}`;
  laboState = result.nextState;
}
