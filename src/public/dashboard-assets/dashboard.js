function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.getElementById('view-' + id).classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-view="' + id + '"]').forEach(n => n.classList.add('active'));
  document.getElementById('mobileMenu').style.display = 'none';
  window.scrollTo(0,0);
}
function toggleRecap(id) {
  document.getElementById('recap-' + id).classList.toggle('open');
  document.getElementById('chev-' + id).classList.toggle('open');
}
function openSpecificRecap(id) {
  setTimeout(function () {
    var recap = document.getElementById('recap-' + id);
    var chev = document.getElementById('chev-' + id);
    if (recap && !recap.classList.contains('open')) { recap.classList.add('open'); if (chev) chev.classList.add('open'); }
    if (recap) recap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
}
function togglePanelList(listId, chevId) {
  document.getElementById(listId).classList.toggle('open');
  document.getElementById(chevId).classList.toggle('open');
}
function toggleSublist(id, linkEl) {
  const list = document.getElementById(id);
  list.classList.toggle('open');
  const isOpen = list.classList.contains('open');
  if (!linkEl.dataset.label) linkEl.dataset.label = linkEl.textContent.replace('▾','').replace('▴','').replace('— Voir moins','').trim();
  linkEl.textContent = isOpen ? '— Voir moins ▴' : linkEl.dataset.label + ' ▾';
}
function toggleExport(id) {
  document.querySelectorAll('.export-menu').forEach(m => { if (m.id !== id) m.classList.remove('open'); });
  document.getElementById(id).classList.toggle('open');
}
function openAddCaForm() { document.getElementById('add-ca-form').classList.add('open'); }
function closeAddCaForm() { document.getElementById('add-ca-form').classList.remove('open'); }

function dashboardToken() {
  return document.body.dataset.token;
}

async function postAction(path, body) {
  const response = await fetch('/dashboard/' + dashboardToken() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) {
    alert("Une erreur est survenue, merci de réessayer.");
    return null;
  }
  return response.json();
}

async function confirmCallback(leadId) {
  const result = await postAction('/callbacks/' + leadId + '/confirm');
  if (result) location.reload();
}

async function deleteCallback(leadId) {
  const result = await postAction('/callbacks/' + leadId + '/delete');
  if (result) location.reload();
}

async function submitAddCaForm() {
  const clientName = document.getElementById('ca-client').value.trim();
  const completedAt = document.getElementById('ca-date').value;
  const jobType = document.getElementById('ca-jobtype').value.trim();
  const amount = document.getElementById('ca-amount').value;

  if (!clientName || !completedAt || !jobType || !amount) {
    alert('Merci de remplir tous les champs.');
    return;
  }

  const result = await postAction('/revenue', { clientName, completedAt, jobType, amount: Number(amount) });
  if (result) location.reload();
}

function showRelanceTab(id) {
  document.querySelectorAll('.relance-tab-content').forEach(v => v.style.display = 'none');
  document.getElementById('relance-' + id).style.display = 'block';
  document.querySelectorAll('.relance-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.relance-tab-btn[data-rtab="' + id + '"]').classList.add('active');
}
function showFunnelPeriod(id) {
  document.querySelectorAll('.funnel-content').forEach(v => v.style.display = 'none');
  document.getElementById('funnel-' + id).style.display = 'block';
  document.querySelectorAll('.funnel-period-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.funnel-period-btn[data-fperiod="' + id + '"]').classList.add('active');
}
function showConvTab(id) {
  document.querySelectorAll('.conv-tab-content').forEach(v => v.style.display = 'none');
  document.getElementById('conv-' + id).style.display = 'block';
  document.querySelectorAll('.conv-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.conv-tab-btn[data-tab="' + id + '"]').classList.add('active');
}
document.addEventListener('click', function (e) {
  if (!e.target.closest('.export-btn') && !e.target.closest('.export-menu')) {
    document.querySelectorAll('.export-menu').forEach(m => m.classList.remove('open'));
  }
});
