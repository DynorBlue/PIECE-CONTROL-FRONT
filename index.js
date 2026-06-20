const API_URL = 'https://piece-control-api.onrender.com/api';

const STATUS_BADGE = {
  CREATED: 'bg-warning text-dark',
  ACTIVE: 'bg-success',
  THIRTY_DAYS: 'bg-info text-dark',
  SIXTY_DAYS: 'bg-primary',
  DESTROYED: 'bg-danger',
  LOST: 'bg-dark'
};

const STOCK_BADGE = {
  BIG: 'bg-primary',
  LITTLE: 'bg-secondary'
};

let allPieces = [];
let currentPage = 0;
let pageSize = 10;
let totalElements = 0;
let totalPages = 0;
let selectedPieces = new Set();

function formatDateTime(dt) {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    if (isNaN(d.getTime())) return dt;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dt;
  }
}

function badgeStock(stock) {
  const cls = STOCK_BADGE[stock] || 'bg-secondary';
  return `<span class="badge ${cls} badge-status">${stock}</span>`;
}

function badgeStatus(status) {
  const cls = STATUS_BADGE[status] || 'bg-secondary';
  return `<span class="badge ${cls} badge-status">${status}</span>`;
}

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      showLogin();
      Swal.fire({ icon: 'warning', title: 'Sesión expirada', text: 'Inicia sesión nuevamente.', confirmButtonColor: '#C8102E' });
    }
    const errData = await res.json().catch(() => ({}));
    const msg = errData.message || errData.error || 'Error del servidor';
    throw { status: res.status, message: msg };
  }

  if (res.status === 204) return null;
  return res.json();
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('d-none');
  document.getElementById('dashboardScreen').classList.add('d-none');
  document.getElementById('username').focus();
}

function showDashboard() {
  document.getElementById('loginScreen').classList.add('d-none');
  document.getElementById('dashboardScreen').classList.remove('d-none');
  const user = localStorage.getItem('user') || 'admin';
  document.getElementById('displayUser').textContent = user;
}

async function handleLogin(username, password) {
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', data.username || username);
    showDashboard();
    await loadPieces();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error de autenticación', text: err.message || 'Credenciales inválidas', confirmButtonColor: '#C8102E' });
  }
}

function handleLogout() {
  Swal.fire({
    title: '¿Cerrar sesión?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#C8102E',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, salir',
    cancelButtonText: 'Cancelar'
  }).then(r => {
    if (r.isConfirmed) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      showLogin();
    }
  });
}

function isAuth() {
  return !!localStorage.getItem('token');
}

function applyClientFilters() {
  const val = id => { const v = document.getElementById(id).value; return v || ''; };

  let filtered = [...allPieces];

  const numberPart = val('filterNumberPart').toLowerCase();
  if (numberPart) filtered = filtered.filter(p => (p.numberPart || '').toLowerCase().includes(numberPart));

  const vin = val('filterVin').toLowerCase();
  if (vin) filtered = filtered.filter(p => (p.vin || '').toLowerCase().includes(vin));

  const operator = val('filterOperator').toLowerCase();
  if (operator) filtered = filtered.filter(p => (p.operator || '').toLowerCase().includes(operator));

  const stock = val('filterStock');
  if (stock) filtered = filtered.filter(p => p.stock === stock);

  const status = val('filterStatus');
  if (status) filtered = filtered.filter(p => p.status === status);

  const dateEntryFrom = val('filterDateEntryFrom');
  if (dateEntryFrom) filtered = filtered.filter(p => p.dateEntry && new Date(p.dateEntry) >= new Date(dateEntryFrom));

  const dateEntryTo = val('filterDateEntryTo');
  if (dateEntryTo) filtered = filtered.filter(p => p.dateEntry && new Date(p.dateEntry) <= new Date(dateEntryTo + 'T23:59:59'));

  return filtered;
}

function paginatePieces(filtered) {
  totalElements = filtered.length;
  totalPages = Math.ceil(totalElements / pageSize) || 1;

  if (currentPage >= totalPages) {
    currentPage = Math.max(0, totalPages - 1);
  }

  const start = currentPage * pageSize;
  return filtered.slice(start, start + pageSize);
}

async function loadPieces() {
  const tbody = document.getElementById('piecesTableBody');
  tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-5">
    <div class="spinner-border text-byd mb-2" role="status"><span class="visually-hidden">Cargando...</span></div>
    <div class="small">Cargando piezas...</div>
  </td></tr>`;

  try {
    allPieces = await apiFetch('/pieces/filter', {
      method: 'POST',
      body: JSON.stringify({})
    });

    if (!Array.isArray(allPieces)) allPieces = [];

    selectedPieces.forEach(id => {
      if (!allPieces.some(p => p.idPiece === id)) {
        selectedPieces.delete(id);
      }
    });

    const filtered = applyClientFilters();
    const page = paginatePieces(filtered);

    renderTable(page);
    renderPagination();
    renderLabelingGrid();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-5">
      <i class="bi bi-exclamation-triangle fs-1 d-block mb-2 text-danger"></i>
      <span class="small">${err.message || 'Error al cargar piezas'}</span>
    </td></tr>`;
  }
}

function renderTable(pieces) {
  const tbody = document.getElementById('piecesTableBody');

  if (pieces.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-5">
      <i class="bi bi-inbox fs-1 d-block mb-2 text-byd"></i>
      <span class="small">No se encontraron piezas</span>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = pieces.map((p, i) => {
    const desc = p.description || '';
    return `<tr class="fade-in" style="animation-delay:${(i % 10) * 0.04}s">
      <td class="text-center fw-bold">${p.idPiece}</td>
      <td><span class="text-truncate-cell" title="${p.numberPart}">${p.numberPart}</span></td>
      <td><span class="text-truncate-cell" title="${p.vin}">${p.vin}</span></td>
      <td>${p.vehiculo}</td>
      <td><span class="text-truncate-cell" title="${desc}">${desc || '—'}</span></td>
      <td>${p.operator}</td>
      <td class="text-center">${badgeStock(p.stock)}</td>
      <td class="text-center">${badgeStatus(p.status)}</td>
      <td class="small">${formatDateTime(p.dateEntry)}</td>
      <td class="text-center">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-info btn-action view-piece" data-id="${p.idPiece}" title="Ver detalle"><i class="bi bi-eye"></i></button>
          <button class="btn btn-outline-primary btn-action edit-piece" data-id="${p.idPiece}" title="Editar pieza"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-action delete-piece" data-id="${p.idPiece}" title="Eliminar pieza"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderPagination() {
  const info = document.getElementById('paginationInfo');
  const start = totalElements === 0 ? 0 : (currentPage * pageSize) + 1;
  const end = Math.min((currentPage + 1) * pageSize, totalElements);
  info.textContent = `Mostrando ${start}-${end} de ${totalElements} pieza${totalElements !== 1 ? 's' : ''}`;

  document.getElementById('totalPiecesBadge').textContent = totalElements;

  const nav = document.getElementById('paginationNav');
  let pagesHtml = '';

  pagesHtml += `<li class="page-item ${currentPage === 0 ? 'disabled' : ''}">
    <button class="page-link page-nav" data-page="prev" aria-label="Anterior"><i class="bi bi-chevron-left"></i></button>
  </li>`;

  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) {
      pagesHtml += `<li class="page-item ${i === currentPage ? 'active' : ''}">
        <button class="page-link page-num" data-page="${i}">${i + 1}</button>
      </li>`;
    }
  } else {
    pagesHtml += `<li class="page-item ${currentPage === 0 ? 'active' : ''}">
      <button class="page-link page-num" data-page="0">1</button>
    </li>`;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages - 2, currentPage + 2);
    if (currentPage - 2 > 1) pagesHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    for (let i = startPage; i <= endPage; i++) {
      pagesHtml += `<li class="page-item ${i === currentPage ? 'active' : ''}">
        <button class="page-link page-num" data-page="${i}">${i + 1}</button>
      </li>`;
    }
    if (currentPage + 2 < totalPages - 2) pagesHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    pagesHtml += `<li class="page-item ${currentPage === totalPages - 1 ? 'active' : ''}">
      <button class="page-link page-num" data-page="${totalPages - 1}">${totalPages}</button>
    </li>`;
  }

  pagesHtml += `<li class="page-item ${currentPage >= totalPages - 1 ? 'disabled' : ''}">
    <button class="page-link page-nav" data-page="next" aria-label="Siguiente"><i class="bi bi-chevron-right"></i></button>
  </li>`;

  nav.innerHTML = pagesHtml;
}

function goToPage(page) {
  if (page === 'prev') page = currentPage - 1;
  if (page === 'next') page = currentPage + 1;
  if (page < 0 || page >= totalPages) return;
  currentPage = page;

  const filtered = applyClientFilters();
  const pieces = paginatePieces(filtered);
  renderTable(pieces);
  renderPagination();
}

function getFilterData() {
  const val = id => { const v = document.getElementById(id).value; return v || undefined; };
  return {
    numberPart: val('filterNumberPart'),
    vin: val('filterVin'),
    operator: val('filterOperator'),
    stock: val('filterStock'),
    status: val('filterStatus'),
    dateEntryFrom: val('filterDateEntryFrom'),
    dateEntryTo: val('filterDateEntryTo')
  };
}

function clearFilters() {
  ['filterNumberPart', 'filterVin', 'filterOperator', 'filterStock', 'filterStatus', 'filterDateEntryFrom', 'filterDateEntryTo']
    .forEach(id => document.getElementById(id).value = '');
  currentPage = 0;

  const filtered = applyClientFilters();
  const pieces = paginatePieces(filtered);
  renderTable(pieces);
  renderPagination();
}

function openCreateModal() {
  document.getElementById('createForm').reset();
  new bootstrap.Modal(document.getElementById('createModal')).show();
}

async function handleCreate() {
  const form = document.getElementById('createForm');
  const data = Object.fromEntries(new FormData(form).entries());
  delete data.status;

  const required = ['numberPart', 'operator', 'dateEntry', 'stock'];
  for (const field of required) {
    if (!data[field]) {
      Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Completa todos los campos obligatorios', confirmButtonColor: '#C8102E' });
      return;
    }
  }

  const btn = document.getElementById('saveCreateBtn');
  const txt = document.getElementById('saveCreateText');
  const spn = document.getElementById('saveCreateSpinner');
  btn.disabled = true; txt.textContent = 'Creando...'; spn.classList.remove('d-none');

  try {
    await apiFetch('/pieces', { method: 'POST', body: JSON.stringify(data) });
    bootstrap.Modal.getInstance(document.getElementById('createModal')).hide();
    form.reset();
    Swal.fire({ icon: 'success', title: 'Pieza creada', text: 'Registrada correctamente', timer: 2000, showConfirmButton: false });
    currentPage = 0;
    await loadPieces();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Error al crear pieza', confirmButtonColor: '#C8102E' });
  } finally {
    btn.disabled = false; txt.textContent = 'Crear Pieza'; spn.classList.add('d-none');
  }
}

function openEditModal(id) {
  apiFetch(`/pieces/${id}`, { method: 'GET' }).then(p => {
    const f = document.getElementById('editForm');
    f.elements['idPiece'].value = p.idPiece;
    f.elements['numberPart'].value = p.numberPart || '';
    f.elements['vin'].value = p.vin || '';
    f.elements['reportingDate'].value = p.reportingDate ? p.reportingDate.substring(0, 16) : '';
    f.elements['claimApplicationForm'].value = p.claimApplicationForm || '';
    f.elements['vehiculo'].value = p.vehiculo || '';
    f.elements['operator'].value = p.operator || '';
    f.elements['dateEntry'].value = p.dateEntry ? p.dateEntry.substring(0, 16) : '';
    f.elements['stock'].value = p.stock || '';
    f.elements['status'].value = p.status || '';
    f.elements['description'].value = p.description || '';
    new bootstrap.Modal(document.getElementById('editModal')).show();
  }).catch(err => {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Error al cargar pieza', confirmButtonColor: '#C8102E' });
  });
}

async function handleUpdate() {
  const form = document.getElementById('editForm');
  const data = Object.fromEntries(new FormData(form).entries());
  const id = parseInt(data.idPiece);

  Object.keys(data).forEach(k => { if (data[k] === '') data[k] = undefined; });
  data.idPiece = id;

  const btn = document.getElementById('saveEditBtn');
  const txt = document.getElementById('saveEditText');
  const spn = document.getElementById('saveEditSpinner');
  btn.disabled = true; txt.textContent = 'Guardando...'; spn.classList.remove('d-none');

  try {
    await apiFetch(`/pieces/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
    Swal.fire({ icon: 'success', title: 'Pieza actualizada', text: 'Cambios guardados', timer: 2000, showConfirmButton: false });

    const idx = allPieces.findIndex(p => p.idPiece === id);
    if (idx !== -1) {
      const updated = await apiFetch(`/pieces/${id}`, { method: 'GET' });
      allPieces[idx] = updated;
    }

    const filtered = applyClientFilters();
    const pieces = paginatePieces(filtered);
    renderTable(pieces);
    renderPagination();
    renderLabelingGrid();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Error al actualizar', confirmButtonColor: '#C8102E' });
  } finally {
    btn.disabled = false; txt.textContent = 'Guardar Cambios'; spn.classList.add('d-none');
  }
}

function openViewModal(id) {
  apiFetch(`/pieces/${id}`, { method: 'GET' }).then(p => {
    document.getElementById('viewContent').innerHTML = `
      <div class="col-md-6">
        <div class="mb-3"><div class="detail-label">ID</div><div class="detail-value">${p.idPiece}</div></div>
        <div class="mb-3"><div class="detail-label">Número de Parte</div><div class="detail-value">${p.numberPart}</div></div>
        <div class="mb-3"><div class="detail-label">VIN</div><div class="detail-value" style="font-size:0.85rem">${p.vin || '—'}</div></div>
        <div class="mb-3"><div class="detail-label">Vehículo</div><div class="detail-value">${p.vehiculo || '—'}</div></div>
        <div class="mb-3"><div class="detail-label">Operador</div><div class="detail-value">${p.operator}</div></div>
        <div class="mb-3"><div class="detail-label">Número de Reporte</div><div class="detail-value">${p.claimApplicationForm || '—'}</div></div>
      </div>
      <div class="col-md-6">
        <div class="mb-3"><div class="detail-label">Bodega/Stock</div><div class="detail-value">${badgeStock(p.stock)}</div></div>
        <div class="mb-3"><div class="detail-label">Estado</div><div class="detail-value">${badgeStatus(p.status)}</div></div>
        <div class="mb-3"><div class="detail-label">Fecha Bodega</div><div class="detail-value">${formatDateTime(p.dateEntry)}</div></div>
        <div class="mb-3"><div class="detail-label">Fecha de Reporte</div><div class="detail-value">${formatDateTime(p.reportingDate)}</div></div>
        <div class="mb-3"><div class="detail-label">Descripción</div><div class="detail-value">${p.description || 'Sin descripción'}</div></div>
      </div>`;
    new bootstrap.Modal(document.getElementById('viewModal')).show();
  }).catch(err => {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Error al cargar pieza', confirmButtonColor: '#C8102E' });
  });
}

async function handleDelete(id) {
  const result = await Swal.fire({
    title: '¿Eliminar pieza?',
    html: `Se eliminará la pieza <strong>#${id}</strong><br>No se podrá recuperar.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#C8102E',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar',
    reverseButtons: true
  });
  if (!result.isConfirmed) return;

  try {
    await apiFetch(`/pieces/${id}`, { method: 'DELETE' });
    Swal.fire({ icon: 'success', title: 'Pieza eliminada', text: 'Eliminada correctamente', timer: 2000, showConfirmButton: false });

    allPieces = allPieces.filter(p => p.idPiece !== id);

    const filtered = applyClientFilters();
    if (filtered.length === 0 && currentPage > 0) currentPage--;
    const pieces = paginatePieces(filtered);
    renderTable(pieces);
    renderPagination();
    renderLabelingGrid();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Error al eliminar', confirmButtonColor: '#C8102E' });
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-nav-bar .nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabName}`);
  });
  if (tabName === 'etiquetado') {
    renderLabelingGrid();
  }
}

function renderLabelingGrid() {
  const grid = document.getElementById('labelingGrid');
  if (!grid) return;

  if (!allPieces || allPieces.length === 0) {
    grid.innerHTML = `<div class="col-12 text-center text-muted py-5">
      <i class="bi bi-inbox fs-1 d-block mb-2 text-byd"></i>
      <span class="small">No hay piezas disponibles</span>
    </div>`;
    return;
  }

  grid.innerHTML = allPieces.map(p => `
    <div class="col-xl-3 col-lg-4 col-md-6">
      <div class="card labeling-card ${selectedPieces.has(p.idPiece) ? 'selected' : ''}" data-id="${p.idPiece}">
        <div class="card-body">
          <div class="d-flex align-items-start gap-2">
            <div class="form-check labeling-check-wrap">
              <input class="form-check-input labeling-check" type="checkbox" data-id="${p.idPiece}" ${selectedPieces.has(p.idPiece) ? 'checked' : ''}>
            </div>
            <div class="flex-grow-1 labeling-card-info" data-id="${p.idPiece}">
              <div class="fw-bold text-truncate mb-1" title="${p.numberPart}">${p.numberPart}</div>
              <div class="small text-muted">${p.claimApplicationForm ? 'Reporte: ' + p.claimApplicationForm : 'Sin reporte'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  updateSelectionUI();
}

function togglePieceSelection(id) {
  if (selectedPieces.has(id)) {
    selectedPieces.delete(id);
  } else {
    selectedPieces.add(id);
  }
  renderLabelingGrid();
}

function updateSelectionUI() {
  const count = selectedPieces.size;
  document.getElementById('selectedCountBadge').textContent = count;
  document.getElementById('exportPdfBtn').disabled = count === 0;

  const selectAllBtn = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  if (count === allPieces.length && allPieces.length > 0) {
    selectAllBtn.classList.add('d-none');
    deselectAllBtn.classList.remove('d-none');
  } else {
    selectAllBtn.classList.remove('d-none');
    deselectAllBtn.classList.add('d-none');
  }
}

async function showQrModal(id) {
  const piece = allPieces.find(p => p.idPiece === id);
  if (!piece) return;

  const modalEl = document.getElementById('qrModal');
  const imgEl = document.getElementById('qrModalImage');
  const subEl = document.getElementById('qrModalSubtitle');

  document.getElementById('qrModalTitle').textContent = `QR · ${piece.numberPart || ''}`;
  imgEl.src = '';
  imgEl.style.display = 'none';

  if (!piece.qrUuid) {
    subEl.textContent = 'Esta pieza no tiene código QR';
  } else {
    subEl.textContent = 'Generando QR...';
  }

  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  if (!piece.qrUuid) return;

  try {
    const base = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const qrContent = `${base}/public-piece.html?qrUuid=${piece.qrUuid}`;
    const qr = qrcode(0, 'M');
    qr.addData(qrContent);
    qr.make();
    const dataUrl = qr.createDataURL(8, 2);

    imgEl.src = dataUrl;
    imgEl.style.display = '';
    subEl.textContent = piece.numberPart;
    imgEl.onerror = () => { subEl.textContent = 'Error al mostrar QR'; imgEl.style.display = 'none'; };
  } catch (err) {
    subEl.textContent = 'Error al generar QR';
    imgEl.style.display = 'none';
    console.error('QR generation error:', err);
  }
}

async function exportToPdf() {
  const ids = [...selectedPieces];
  if (ids.length === 0) return;

  const pieces = ids.map(id => allPieces.find(p => p.idPiece === id)).filter(Boolean);

  Swal.fire({ title: 'Generando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const withQR = pieces.filter(p => p.qrUuid);
    if (withQR.length === 0) {
      Swal.close();
      Swal.fire({ icon: 'warning', title: 'Sin QR', text: 'Ninguna pieza seleccionada tiene código QR', confirmButtonColor: '#C8102E' });
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'letter');

    const margin = 15;
    const cols = 3;
    const rows = 4;
    const cellW = (215.9 - 2 * margin) / cols;
    const cellH = (279.4 - 2 * margin) / rows;
    const qrSize = 42;
    const perPage = cols * rows;

    for (let i = 0; i < withQR.length; i++) {
      if (i > 0 && i % perPage === 0) {
        doc.addPage();
      }

      const idx = i % perPage;
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const cellX = margin + col * cellW;
      const cellY = margin + row * cellH;
      const qrX = cellX + (cellW - qrSize) / 2;
      const qrY = cellY + 5;

      try {
        const base = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const qrContent = `${base}/public-piece.html?qrUuid=${withQR[i].qrUuid}`;
        const qr = qrcode(0, 'M');
        qr.addData(qrContent);
        qr.make();
        const dataUrl = qr.createDataURL(4, 1);
        doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      } catch {
        // skip QR if generation fails
      }

      doc.setFontSize(8);
      doc.text(
        withQR[i].numberPart || '',
        cellX + cellW / 2,
        qrY + qrSize + 5,
        { align: 'center' }
      );
    }

    doc.save('etiquetas.pdf');
    Swal.close();
    Swal.fire({ icon: 'success', title: 'PDF generado', text: `${withQR.length} etiqueta(s) exportada(s)`, timer: 2000, showConfirmButton: false });
  } catch (err) {
    Swal.close();
    Swal.fire({ icon: 'error', title: 'Texto', text: 'Error al generar PDF: ' + (err.message || 'desconocido'), confirmButtonColor: '#C8102E' });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
      Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Ingresa usuario y contraseña', confirmButtonColor: '#C8102E' });
      return;
    }

    const btn = document.getElementById('loginBtn');
    const txt = document.getElementById('loginBtnText');
    const spn = document.getElementById('loginBtnSpinner');
    btn.disabled = true; txt.textContent = 'Iniciando...'; spn.classList.remove('d-none');
    await handleLogin(username, password);
    btn.disabled = false; txt.textContent = 'Iniciar Sesión'; spn.classList.add('d-none');
  });

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  document.getElementById('createPieceBtn').addEventListener('click', openCreateModal);
  document.getElementById('saveCreateBtn').addEventListener('click', handleCreate);
  document.getElementById('saveEditBtn').addEventListener('click', handleUpdate);

  document.getElementById('applyFilterBtn').addEventListener('click', () => {
    currentPage = 0;
    const filtered = applyClientFilters();
    const pieces = paginatePieces(filtered);
    renderTable(pieces);
    renderPagination();
  });

  document.getElementById('clearFilterBtn').addEventListener('click', clearFilters);

  document.getElementById('pageSizeSelect').addEventListener('change', e => {
    pageSize = parseInt(e.target.value);
    currentPage = 0;
    const filtered = applyClientFilters();
    const pieces = paginatePieces(filtered);
    renderTable(pieces);
    renderPagination();
  });

  document.getElementById('piecesTableBody').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    if (btn.classList.contains('view-piece')) openViewModal(id);
    else if (btn.classList.contains('edit-piece')) openEditModal(id);
    else if (btn.classList.contains('delete-piece')) handleDelete(id);
  });

  document.getElementById('paginationNav').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('page-num')) goToPage(parseInt(btn.dataset.page));
    else if (btn.classList.contains('page-nav')) goToPage(btn.dataset.page);
  });

  document.getElementById('mainTabs').addEventListener('click', e => {
    const btn = e.target.closest('.nav-link');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  document.getElementById('labelingGrid').addEventListener('click', e => {
    const info = e.target.closest('.labeling-card-info');
    if (info) {
      const id = parseInt(info.dataset.id);
      showQrModal(id);
    }
  });

  document.getElementById('labelingGrid').addEventListener('change', e => {
    if (e.target.classList.contains('labeling-check')) {
      const id = parseInt(e.target.dataset.id);
      togglePieceSelection(id);
    }
  });

  document.getElementById('selectAllBtn').addEventListener('click', () => {
    allPieces.forEach(p => selectedPieces.add(p.idPiece));
    renderLabelingGrid();
  });

  document.getElementById('deselectAllBtn').addEventListener('click', () => {
    selectedPieces.clear();
    renderLabelingGrid();
  });

  document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf);

  const filterToggle = document.querySelector('[data-bs-target="#filterCollapse"]');
  if (filterToggle) {
    filterToggle.addEventListener('click', () => {
      const icon = document.getElementById('filterToggleIcon');
      icon.classList.toggle('bi-chevron-up');
      icon.classList.toggle('bi-chevron-down');
    });
  }

  document.querySelectorAll('#filterCollapse input, #filterCollapse select').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        currentPage = 0;
        const filtered = applyClientFilters();
        const pieces = paginatePieces(filtered);
        renderTable(pieces);
        renderPagination();
      }
    });
  });

  document.getElementById('createModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('createForm').reset();
  });

  if (isAuth()) {
    showDashboard();
    loadPieces();
  } else {
    showLogin();
  }
});
