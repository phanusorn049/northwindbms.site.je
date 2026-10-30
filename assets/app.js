(() => {
  const scriptUrl = document.currentScript && document.currentScript.src;
  if (!scriptUrl) {
    throw new Error('Northwind BMS app script must be loaded as an external file.');
  }

  function bindGlobalSearch() {
    document.querySelectorAll('.search-box').forEach((box) => {
      const input = document.createElement('input');
      input.type = 'search';
      input.className = 'nw-global-search';
      input.placeholder = 'ค้นหา...';
      input.setAttribute('aria-label', 'ค้นหาข้อมูล');
      box.replaceChildren(input);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && input.value.trim()) {
          window.location.href = `products.html?q=${encodeURIComponent(input.value.trim())}`;
        }
      });
    });
  }

  const apiUrl = new URL('../api/index.php', scriptUrl);
  const page = document.querySelector('.screen.active')?.id || '';
  const pageFiles = {
    login: 'login.html',
    dashboard: 'dashboard.html',
    products: 'products.html',
    'product-form': 'product-form.html',
    categories: 'categories.html',
    orders: 'orders.html',
    'order-detail': 'order-detail.html',
    customers: 'customers.html',
    suppliers: 'suppliers.html',
    employees: 'employees.html',
    shippers: 'shippers.html',
    reports: 'reports.html',
  };
  const csrfToken = { value: '' };
  const state = { records: [], filtered: [], pageNumber: 1, report: null, references: {} };

  const entityFields = {
    products: [
      { key: 'c_ProductName', label: 'ชื่อสินค้า', required: true },
      { key: 'i_CategoryID', label: 'หมวดหมู่', required: true, source: 'categories' },
      { key: 'i_SupplierID', label: 'ผู้จัดจำหน่าย', required: true, source: 'suppliers' },
      { key: 'c_Unit', label: 'หน่วยบรรจุภัณฑ์', required: true },
      { key: 'i_Price', label: 'ราคาต่อหน่วย', required: true, type: 'number', min: '0.01', step: '0.01' },
    ],
    categories: [
      { key: 'c_CategoryName', label: 'ชื่อหมวดหมู่', required: true },
      { key: 'c_Description', label: 'รายละเอียด', required: true },
    ],
    customers: [
      { key: 'c_customername', label: 'ชื่อบริษัท', required: true },
      { key: 'c_contactname', label: 'ชื่อผู้ติดต่อ', required: true },
      { key: 'c_address', label: 'ที่อยู่', required: true },
      { key: 'c_city', label: 'เมือง', required: true },
      { key: 'c_postalcode', label: 'รหัสไปรษณีย์', required: true },
      { key: 'c_country', label: 'ประเทศ', required: true },
    ],
    suppliers: [
      { key: 'c_SupplierName', label: 'ชื่อบริษัท', required: true },
      { key: 'c_ContactName', label: 'ชื่อผู้ติดต่อ', required: true },
      { key: 'c_Address', label: 'ที่อยู่', required: true },
      { key: 'c_City', label: 'เมือง', required: true },
      { key: 'c_PostalCode', label: 'รหัสไปรษณีย์', required: true },
      { key: 'c_Country', label: 'ประเทศ', required: true },
      { key: 'c_Phone', label: 'เบอร์โทรศัพท์', required: true },
    ],
    employees: [
      { key: 'c_FirstName', label: 'ชื่อ', required: true },
      { key: 'c_LastName', label: 'นามสกุล', required: true },
      { key: 'c_BirthDate', label: 'วันเกิด', required: true, type: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'c_Photo', label: 'ชื่อไฟล์รูปภาพ', required: true, value: '-' },
      { key: 'c_Notes', label: 'หมายเหตุ', required: true, value: '-' },
    ],
    shippers: [
      { key: 'c_ShipperName', label: 'ชื่อบริษัทขนส่ง', required: true },
      { key: 'c_Phone', label: 'เบอร์โทรศัพท์', required: true },
    ],
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function notify(message, type = 'info') {
    let node = document.querySelector('.nw-notice');
    if (!node) {
      node = document.createElement('div');
      node.className = 'nw-notice';
      node.setAttribute('role', 'status');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.dataset.type = type;
    node.hidden = false;
    clearTimeout(node.hideTimer);
    node.hideTimer = setTimeout(() => { node.hidden = true; }, 5000);
  }

  async function api(method, params = {}, body = null) {
    const url = new URL(apiUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    const headers = { Accept: 'application/json' };
    if (body !== null) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrfToken.value) headers['X-CSRF-Token'] = csrfToken.value;

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        credentials: 'same-origin',
        body: body === null ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new Error('ติดต่อ API ไม่ได้ กรุณาเปิดเว็บผ่าน MAMP และตรวจสอบการตั้งค่าเซิร์ฟเวอร์');
    }
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error(`API ตอบกลับไม่ถูกต้อง (HTTP ${response.status})`);
    }
    if (!response.ok || result.success !== true) {
      if (response.status === 401 && page !== 'login') {
        window.location.replace(`login.html?next=${encodeURIComponent(window.location.pathname.split('/').pop() || 'dashboard.html')}`);
      }
      throw new Error(result.message || `คำขอไม่สำเร็จ (HTTP ${response.status})`);
    }
    return result.data;
  }

  function currentScreen() {
    return document.querySelector('.screen.active');
  }

  function findTableBody() {
    return currentScreen()?.querySelector('tbody') || null;
  }

  function formatMoney(value) {
    return `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function safeText(value, fallback = '—') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function addLogoutButton(user) {
    const nav = document.getElementById('nav-tabs');
    if (!nav) return;
    let account = nav.querySelector('.nav-account');
    if (!account) {
      account = document.createElement('div');
      account.className = 'nav-account';
      account.innerHTML = '<span class="nav-account-name"></span><button class="nav-tab" type="button" data-action="change-password">เปลี่ยนรหัสผ่าน</button><button class="nav-tab" type="button" data-action="logout">ออกจากระบบ</button>';
      nav.appendChild(account);
    }
    account.querySelector('.nav-account-name').textContent = user.display_name || user.username;
  }

  function updateSidebarUser(user) {
    document.querySelectorAll('.user-name').forEach((node) => {
      node.textContent = user.display_name || user.username;
    });
  }

  function showLoading() {
    const content = currentScreen()?.querySelector('.page-content');
    if (!content || content.querySelector('.nw-loading')) return;
    const loading = document.createElement('div');
    loading.className = 'nw-loading';
    loading.textContent = 'กำลังโหลดข้อมูลจากฐานข้อมูล…';
    content.prepend(loading);
  }

  function clearLoading() {
    document.querySelectorAll('.nw-loading').forEach((node) => node.remove());
  }

  function renderPagination(rows, renderRow) {
    const body = findTableBody();
    if (!body) return;
    const pageSizeSelect = page === 'products'
      ? currentScreen()?.querySelectorAll('.filter-select')[2] : null;
    const selectedCount = pageSizeSelect
      ? Number(pageSizeSelect.value.match(/\d+/)?.[0] || pageSizeSelect.selectedOptions[0]?.textContent.match(/\d+/)?.[0])
      : 10;
    const pageSize = [10, 25, 50, 100].includes(selectedCount) ? selectedCount : 10;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.pageNumber = Math.min(state.pageNumber, pages);
    body.innerHTML = rows
      .slice((state.pageNumber - 1) * pageSize, state.pageNumber * pageSize)
      .map(renderRow).join('');
    let pagination = currentScreen()?.querySelector('.nw-pagination');
    if (!pagination) {
      pagination = document.createElement('div');
      pagination.className = 'pagination nw-pagination';
      const card = currentScreen()?.querySelector('.card');
      card?.appendChild(pagination);
    }
    if (!pagination) return;
    pagination.innerHTML = `<span>แสดง ${rows.length ? (state.pageNumber - 1) * pageSize + 1 : 0}–${Math.min(state.pageNumber * pageSize, rows.length)} จาก ${rows.length} รายการ</span>
      <div class="page-btns">
        <button type="button" class="page-btn" data-page="${Math.max(1, state.pageNumber - 1)}" aria-label="หน้าก่อนหน้า">‹</button>
        ${Array.from({ length: pages }, (_, index) => index + 1).map((number) => `<button type="button" class="page-btn${number === state.pageNumber ? ' active' : ''}" data-page="${number}">${number}</button>`).join('')}
        <button type="button" class="page-btn" data-page="${Math.min(pages, state.pageNumber + 1)}" aria-label="หน้าถัดไป">›</button>
      </div>`;
  }

  function editButton(resource, id, label = '✏️') {
    return `<button type="button" class="btn btn-outline btn-sm" data-action="edit" data-resource="${resource}" data-id="${escapeHtml(id)}" aria-label="แก้ไข"> ${label} </button>`;
  }

  function deleteButton(resource, id) {
    return `<button type="button" class="btn btn-danger btn-sm" data-action="delete" data-resource="${resource}" data-id="${escapeHtml(id)}" aria-label="ลบ">ลบ</button>`;
  }

  function renderEntityRows(resource, rows) {
    const renderers = {
      products: (row) => `<tr><td>${escapeHtml(row.id)}</td><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.supplier)}</td><td>${escapeHtml(row.unit)}</td><td>${formatMoney(row.price)}</td><td><span class="badge ${Number(row.price) > 10000 ? 'badge-amber' : 'badge-green'}">${Number(row.price) > 10000 ? 'ตรวจสอบราคา' : 'ปกติ'}</span></td><td>${editButton('products', row.id)}</td></tr>`,
      orders: (row) => `<tr><td><strong>#${escapeHtml(row.id)}</strong></td><td>${escapeHtml(row.customer)}</td><td>${escapeHtml(row.employee)}</td><td>${escapeHtml(row.order_date)}</td><td>${escapeHtml(row.shipper)}</td><td>${escapeHtml(row.item_count)}</td><td><span class="badge ${Number(row.item_count) ? 'badge-green' : 'badge-amber'}">${Number(row.item_count) ? 'มีรายการสินค้า' : 'ไม่มีรายการสินค้า'}</span></td><td><button type="button" class="btn btn-outline btn-sm" data-action="order-detail" data-id="${escapeHtml(row.id)}">👁</button></td></tr>`,
      customers: (row) => `<tr><td>${escapeHtml(row.id)}</td><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.contact)}</td><td>${escapeHtml(row.city)}</td><td>${escapeHtml(row.country)}</td><td>${escapeHtml(row.postal_code)}</td><td>${editButton('customers', row.id)} ${deleteButton('customers', row.id)}</td></tr>`,
      suppliers: (row) => `<tr><td>${escapeHtml(row.id)}</td><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.contact)}</td><td>${escapeHtml(row.city)}</td><td>${escapeHtml(row.country)}</td><td>${escapeHtml(row.phone)}</td><td>${escapeHtml(row.product_count)}</td><td>${editButton('suppliers', row.id)} ${deleteButton('suppliers', row.id)}</td></tr>`,
    };
    const render = renderers[resource];
    if (!render) return;
    renderPagination(rows, render);
  }

  function applySearch() {
    const input = currentScreen()?.querySelector('.filter-input');
    const query = input?.value.trim().toLocaleLowerCase() || '';
    const selects = [...(currentScreen()?.querySelectorAll('.filter-select') || [])];
    const category = page === 'products' && selects[0] && selects[0].value
      ? selects[0].value : '';
    const supplier = page === 'products' && selects[1] && selects[1].value
      ? selects[1].value : '';
    const country = page === 'customers' ? selects[0]?.value || '' : '';
    state.filtered = state.records.filter((row) => {
      const text = Object.values(row).join(' ').toLocaleLowerCase();
      return (!query || text.includes(query))
        && (!category || row.category === category)
        && (!supplier || row.supplier === supplier)
        && (!country || row.country === country);
    });
    state.pageNumber = 1;
    renderEntityRows(page === 'products' ? 'products' : page, state.filtered);
  }

  async function loadEntityPage(resource) {
    const params = { resource };
    if (resource === 'orders') {
      const search = currentScreen()?.querySelector('.filter-input')?.value || '';
      const selects = currentScreen()?.querySelectorAll('.filter-select');
      const dates = currentScreen()?.querySelectorAll('input[type="date"]');
      params.q = search;
      const selectedStatus = selects?.[0]?.value || '';
      params.status = selectedStatus.includes('ทุกสถานะ') ? ''
        : selectedStatus.includes('จัดส่งแล้ว') ? 'มีรายการสินค้า'
          : selectedStatus.includes('กำลังดำเนินการ') ? 'ไม่มีรายการสินค้า' : selectedStatus;
      params.from = dates?.[0]?.value || '';
      params.to = dates?.[1]?.value || '';
    }
    currentScreen()?.querySelectorAll('.pagination:not(.nw-pagination)').forEach((node) => node.remove());
    state.records = await api('GET', params);
    if (resource === 'products' && new URLSearchParams(window.location.search).has('q')) {
      const input = currentScreen()?.querySelector('.filter-input');
      if (input) input.value = new URLSearchParams(window.location.search).get('q') || '';
    }
    if (resource === 'products' || resource === 'customers') {
      const selects = currentScreen()?.querySelectorAll('.filter-select');
      if (selects?.length) {
        const selectedCategory = selects[0].value;
        const selectedSupplier = selects[1]?.value;
        if (resource === 'products') {
          const [categories, suppliers] = await Promise.all([
            api('GET', { resource: 'categories' }), api('GET', { resource: 'suppliers' }),
          ]);
          selects[0].innerHTML = '<option value="">ทุกหมวดหมู่</option>' + categories.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join('');
          selects[1].innerHTML = '<option value="">ทุกผู้จัดจำหน่าย</option>' + suppliers.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join('');
          if (selectedCategory) selects[0].value = selectedCategory;
          if (selectedSupplier) selects[1].value = selectedSupplier;
        } else {
          const countries = [...new Set(state.records.map((row) => row.country).filter(Boolean))].sort();
          const selectedCountry = selects[0].value;
          selects[0].innerHTML = '<option value="">ทุกประเทศ</option>' + countries.map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join('');
          if (selectedCountry) selects[0].value = selectedCountry;
        }
      }
    }
    if (resource === 'products') {
      const pageDesc = currentScreen()?.querySelector('.page-desc');
      if (pageDesc) pageDesc.textContent = `${state.records.length} รายการ`;
    }
    if (resource === 'orders') {
      const pageDesc = currentScreen()?.querySelector('.page-desc');
      if (pageDesc) pageDesc.textContent = `${state.records.length} รายการจากฐานข้อมูล`;
    }
    applySearch();
  }

  function renderCategoryCards(rows) {
    const grid = currentScreen()?.querySelector('.row.row-cols-xl-3');
    if (!grid) return;
    const icons = ['🍹', '🧂', '🍬', '🧀', '🥩', '🐟', '🌾', '🍄'];
    grid.innerHTML = rows.map((row, index) => `<article class="cat-card col">
      <div><div class="cat-icon">${icons[index % icons.length]}</div><div class="cat-name">${escapeHtml(row.name)}</div>
      <div class="cat-desc">${escapeHtml(row.description)}</div><div class="cat-count">${escapeHtml(row.product_count)} รายการสินค้า</div></div>
      <div style="display:flex;gap:4px">${editButton('categories', row.id)} ${deleteButton('categories', row.id)}</div></article>`).join('');
  }

  function renderEmployees(rows) {
    const grid = currentScreen()?.querySelector('.emp-grid');
    if (!grid) return;
    grid.innerHTML = rows.map((row) => {
      const initials = `${row.first_name?.charAt(0) || ''}${row.last_name?.charAt(0) || ''}`;
      return `<article class="emp-card"><div class="emp-avatar">${escapeHtml(initials)}</div>
        <div class="emp-name">${escapeHtml(`${row.first_name} ${row.last_name}`)}</div>
        <div class="emp-title">พนักงาน</div>
        <div class="emp-meta">เกิด: ${escapeHtml(row.birth_date)}</div>
        <div class="emp-actions">${editButton('employees', row.id)} ${deleteButton('employees', row.id)}</div></article>`;
    }).join('');
  }

  function renderShippers(rows) {
    const grid = currentScreen()?.querySelector('.row.row-cols-xl-3');
    if (!grid) return;
    const icons = ['🚀', '📦', '🛳'];
    grid.innerHTML = rows.map((row, index) => `<article class="shipper-card col">
      <div style="font-size:32px;margin-bottom:12px">${icons[index % icons.length]}</div>
      <div style="font-size:15px;font-weight:700;color:var(--ink)">${escapeHtml(row.name)}</div>
      <div style="font-size:13px;color:var(--ink-2);margin-top:4px">${escapeHtml(row.phone)}</div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:var(--ink-3)">คำสั่งซื้อ ${escapeHtml(row.order_count)} รายการ</span>
        <span class="badge badge-green">พร้อมให้บริการ</span></div>
      <div style="margin-top:12px;display:flex;gap:6px">${editButton('shippers', row.id)} ${deleteButton('shippers', row.id)}</div>
    </article>`).join('');
  }

  function renderReport(data) {
    state.report = data;
    state.records = data.top_products;
    const values = currentScreen()?.querySelectorAll('.kpi-value');
    if (values?.length >= 4) {
      values[0].textContent = formatMoney(data.summary.revenue);
      values[1].textContent = Number(data.summary.order_count).toLocaleString('th-TH');
      values[2].textContent = formatMoney(data.summary.average_order);
      values[3].textContent = data.summary.popular_shipper || '—';
      const trend = values[3].parentElement?.querySelector('.kpi-trend');
      if (trend) trend.textContent = `${Number(data.summary.popular_shipper_orders || 0).toLocaleString('th-TH')} ครั้ง`;
    }
    const productCard = [...(currentScreen()?.querySelectorAll('.card') || [])]
      .find((card) => card.textContent.includes('สินค้าขายดี'));
    if (productCard) {
      const max = Math.max(1, ...data.top_products.map((item) => Number(item.quantity)));
      const holder = productCard.querySelector('.prog-row')?.parentElement;
      if (holder) {
        holder.querySelectorAll('.prog-row').forEach((row) => row.remove());
        data.top_products.forEach((product) => {
          const row = document.createElement('div');
          row.className = 'prog-row';
          const percent = Math.round((Number(product.quantity) / max) * 100);
          row.innerHTML = `<div class="prog-label"><span>${escapeHtml(product.name)}</span><span>${Number(product.quantity).toLocaleString('th-TH')} หน่วย</span></div><div class="prog-bar"><div class="prog-fill" style="width:${percent}%"></div></div>`;
          holder.appendChild(row);
        });
      }
    }
    const customerCard = [...(currentScreen()?.querySelectorAll('.card') || [])]
      .find((card) => card.textContent.includes('ลูกค้าที่ซื้อสูงสุด'));
    const customerBody = customerCard?.querySelector('tbody');
    if (customerBody) renderReportTable('customers', data);
    const monthlyBars = currentScreen()?.querySelector('.bar-chart');
    if (monthlyBars) {
      const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const amounts = Array(12).fill(0);
      const selectedYear = currentScreen()?.querySelector('.filter-select')?.value;
      const year = selectedYear && selectedYear !== 'ทุกปี' ? Number(selectedYear.replace(/\D/g, '')) - 543 : null;
      (state.orders || []).forEach((order) => {
        const date = new Date(order.order_date);
        if (!Number.isNaN(date.getTime()) && (!year || date.getFullYear() === year)) {
          amounts[date.getMonth()] += Number(order.total);
        }
      });
      const maxAmount = Math.max(1, ...amounts);
      monthlyBars.style.height = '140px';
      monthlyBars.innerHTML = amounts.map((amount, index) => {
        const compactAmount = amount
          ? `฿${new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 0 }).format(amount)}`
          : '—';
        return `<div class="bar-wrap" aria-label="${monthNames[index]} ${formatMoney(amount)}">
          <span class="bar-value" title="${formatMoney(amount)}">${compactAmount}</span>
          <div class="bar-col" title="${formatMoney(amount)}" style="height:${Math.max(4, Math.round((amount / maxAmount) * 90))}px"></div>
          <div class="bar-lbl">${monthNames[index]}</div>
        </div>`;
      }).join('');
    }
  }

  function renderReportTable(group, data = state.report) {
    if (!data) return;
    const card = [...(currentScreen()?.querySelectorAll('.card') || [])]
      .find((item) => item.textContent.includes('ลูกค้าที่ซื้อสูงสุด') || item.dataset.reportCard === 'true');
    if (!card) return;
    card.dataset.reportCard = 'true';
    const title = card.querySelector('.card-title');
    const table = card.querySelector('table');
    if (!table) return;
    const definitions = {
      products: {
        title: '📦 สินค้าขายดีสูงสุด',
        headers: ['อันดับ', 'สินค้า', 'จำนวนที่ขาย', 'รายได้'],
        rows: data.top_products,
        values: (row) => [row.name, Number(row.quantity).toLocaleString('th-TH'), formatMoney(row.revenue)],
      },
      customers: {
        title: '👥 ลูกค้าที่ซื้อสูงสุด (Top 5)',
        headers: ['อันดับ', 'บริษัท', 'ประเทศ', 'จำนวนออร์เดอร์', 'รายได้'],
        rows: data.top_customers,
        values: (row) => [row.name, row.country, Number(row.order_count).toLocaleString('th-TH'), formatMoney(row.revenue)],
      },
      employees: {
        title: '👤 ยอดขายตามพนักงาน (Top 5)',
        headers: ['อันดับ', 'พนักงาน', 'จำนวนออร์เดอร์', 'รายได้'],
        rows: data.top_employees,
        values: (row) => [row.name, Number(row.order_count).toLocaleString('th-TH'), formatMoney(row.revenue)],
      },
    };
    const selected = definitions[group] || definitions.customers;
    if (title) title.textContent = selected.title;
    table.tHead.innerHTML = `<tr>${selected.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
    table.tBodies[0].innerHTML = selected.rows.map((row, index) => {
      const cells = selected.values(row);
      return `<tr><td>${index + 1}</td>${cells.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`;
    }).join('');
    state.records = selected.rows;
  }

  async function loadDashboard() {
    const [products, orders, customers, suppliers, categories, report] = await Promise.all([
      api('GET', { resource: 'products' }),
      api('GET', { resource: 'orders' }),
      api('GET', { resource: 'customers' }),
      api('GET', { resource: 'suppliers' }),
      api('GET', { resource: 'categories' }),
      api('GET', { resource: 'reports' }),
    ]);
    state.orders = orders;
    const metrics = currentScreen()?.querySelectorAll('.kpi-value');
    if (metrics?.length >= 4) {
      metrics[0].textContent = orders.length.toLocaleString('th-TH');
      metrics[1].textContent = products.length.toLocaleString('th-TH');
      metrics[2].textContent = customers.length.toLocaleString('th-TH');
      metrics[3].textContent = suppliers.length.toLocaleString('th-TH');
    }
    const pageDesc = currentScreen()?.querySelector('.page-desc');
    if (pageDesc) pageDesc.textContent = 'ข้อมูลสดจากฐานข้อมูล Northwind';
    const ordersTable = [...(currentScreen()?.querySelectorAll('table') || [])]
      .find((table) => table.textContent.includes('เลขที่คำสั่งซื้อ'));
    if (ordersTable?.tBodies[0]) {
      ordersTable.tBodies[0].innerHTML = orders.slice(0, 5).map((order) => `<tr>
        <td>#${escapeHtml(order.id)}</td><td>${escapeHtml(order.customer)}</td><td>${escapeHtml(order.employee)}</td>
        <td>${escapeHtml(order.order_date)}</td><td>${escapeHtml(order.shipper)}</td>
        <td><span class="badge ${Number(order.item_count) ? 'badge-green' : 'badge-amber'}">${Number(order.item_count) ? 'มีรายการสินค้า' : 'ไม่มีรายการสินค้า'}</span></td></tr>`).join('');
    }
    const monthlyBars = currentScreen()?.querySelector('.bar-chart');
    if (monthlyBars) {
      const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const counts = Array(12).fill(0);
      orders.forEach((order) => {
        const date = new Date(order.order_date);
        if (!Number.isNaN(date.getTime())) counts[date.getMonth()] += 1;
      });
      const max = Math.max(1, ...counts);
      monthlyBars.innerHTML = counts.map((count, index) => `<div class="bar-wrap">
        <div class="bar-col" title="${count} คำสั่งซื้อ" style="height:${Math.max(4, Math.round(count / max * 76))}px"></div>
        <div class="bar-lbl">${monthNames[index]}</div></div>`).join('');
    }
    const categoryCard = [...(currentScreen()?.querySelectorAll('.card') || [])]
      .find((card) => card.textContent.includes('หมวดหมู่ยอดนิยม'));
    const categoryRows = categoryCard?.querySelectorAll('.prog-row');
    if (categoryCard && categoryRows?.length) {
      const topCategories = [...categories].sort((a, b) => Number(b.product_count) - Number(a.product_count)).slice(0, 5);
      const maximum = Math.max(1, ...topCategories.map((category) => Number(category.product_count)));
      const holder = categoryRows[0].parentElement;
      holder.innerHTML = topCategories.map((category) => `<div class="prog-row">
        <div class="prog-label"><span>${escapeHtml(category.name)}</span><span>${escapeHtml(category.product_count)} รายการ</span></div>
        <div class="prog-bar"><div class="prog-fill" style="width:${Math.round(Number(category.product_count) / maximum * 100)}%"></div></div>
      </div>`).join('');
    }
  }

  function makeInput(field, value = '') {
    const group = document.createElement('label');
    group.className = 'form-group';
    const caption = document.createElement('span');
    caption.className = `form-label${field.required ? ' required' : ''}`;
    caption.textContent = field.label;
    group.appendChild(caption);
    let control;
    if (field.options) {
      control = document.createElement('select');
      control.className = 'form-select';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = `— เลือก${field.label} —`;
      control.appendChild(placeholder);
      field.options.forEach((option) => {
        const item = document.createElement('option');
        item.value = option.id;
        item.textContent = option.name;
        control.appendChild(item);
      });
    } else {
      control = document.createElement('input');
      control.className = 'form-input';
      control.type = field.type || 'text';
      if (field.min) control.min = field.min;
      if (field.step) control.step = field.step;
      if (field.placeholder) control.placeholder = field.placeholder;
    }
    control.name = field.key;
    control.required = Boolean(field.required);
    control.value = value || field.value || '';
    group.appendChild(control);
    return group;
  }

  async function referenceOptions(resource) {
    if (!state.references[resource]) {
      state.references[resource] = await api('GET', { resource });
    }
    return state.references[resource].map((row) => ({
      id: row.id,
      name: row.name || `${row.first_name} ${row.last_name}`,
    }));
  }

  async function openEditor(resource, record = null, readOnly = false) {
    const fields = entityFields[resource];
    if (!fields) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'nw-dialog';
    const form = document.createElement('form');
    form.className = 'nw-dialog-form';
    form.method = 'dialog';
    const heading = document.createElement('h2');
    heading.textContent = readOnly ? 'รายละเอียดข้อมูล' : `${record ? 'แก้ไข' : 'เพิ่ม'}${fields[0].label}`;
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    for (const field of fields) {
      const resolved = field.source ? { ...field, options: await referenceOptions(field.source) } : field;
      const row = record || {};
      let value = row[field.key];
      if (resource === 'products') {
        if (field.key === 'i_CategoryID') value = row.category_id;
        if (field.key === 'i_SupplierID') value = row.supplier_id;
      }
      if (resource === 'employees') {
        if (field.key === 'c_FirstName') value = row.first_name;
        if (field.key === 'c_LastName') value = row.last_name;
        if (field.key === 'c_BirthDate') value = row.birth_date;
        if (field.key === 'c_Photo') value = row.photo;
        if (field.key === 'c_Notes') value = row.notes;
      }
      if (resource === 'categories') {
        if (field.key === 'c_CategoryName') value = row.name;
        if (field.key === 'c_Description') value = row.description;
      }
      if (resource === 'shippers') {
        if (field.key === 'c_ShipperName') value = row.name;
        if (field.key === 'c_Phone') value = row.phone;
      }
      const input = makeInput(resolved, value);
      if (readOnly) {
        input.querySelector('input, select').disabled = true;
      }
      grid.appendChild(input);
    }
    const actions = document.createElement('div');
    actions.className = 'nw-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-outline';
    cancel.textContent = 'ปิด';
    cancel.addEventListener('click', () => dialog.close());
    actions.appendChild(cancel);
    if (!readOnly) {
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'btn btn-primary';
      save.textContent = 'บันทึก';
      actions.appendChild(save);
    }
    form.append(heading, grid, actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    if (!readOnly) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(form).entries());
        try {
          await api(record ? 'PUT' : 'POST', { resource, id: record?.id }, payload);
          dialog.close();
          notify('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
          state.references = {};
          await loadPage();
        } catch (error) {
          notify(error.message, 'error');
        }
      });
    }
    dialog.showModal();
  }

  async function openOrderEditor() {
    const [customers, employees, shippers, products] = await Promise.all([
      referenceOptions('customers'), referenceOptions('employees'),
      referenceOptions('shippers'), referenceOptions('products'),
    ]);
    const dialog = document.createElement('dialog');
    dialog.className = 'nw-dialog';
    const form = document.createElement('form');
    form.className = 'nw-dialog-form';
    const title = document.createElement('h2');
    title.textContent = 'สร้างคำสั่งซื้อ';
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    const today = new Date().toISOString().slice(0, 10);
    const fields = [
      { key: 'customer_id', label: 'ลูกค้า', required: true, options: customers },
      { key: 'employee_id', label: 'พนักงาน', required: true, options: employees },
      { key: 'shipper_id', label: 'บริษัทขนส่ง', required: true, options: shippers },
      { key: 'order_date', label: 'วันที่สั่งซื้อ', required: true, type: 'date', value: today },
      { key: 'product_id', label: 'สินค้า', required: true, options: products },
      { key: 'quantity', label: 'จำนวน', required: true, type: 'number', min: '1', step: '1', value: '1' },
    ];
    fields.forEach((field) => grid.appendChild(makeInput(field, field.value)));
    const actions = document.createElement('div');
    actions.className = 'nw-dialog-actions';
    actions.innerHTML = '<button type="button" class="btn btn-outline">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกคำสั่งซื้อ</button>';
    actions.querySelector('button').addEventListener('click', () => dialog.close());
    form.append(title, grid, actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      const order = {
        customer_id: payload.customer_id,
        employee_id: payload.employee_id,
        shipper_id: payload.shipper_id,
        order_date: payload.order_date,
        items: [{ product_id: payload.product_id, quantity: payload.quantity }],
      };
      try {
        const result = await api('POST', { resource: 'orders' }, order);
        dialog.close();
        notify(`สร้างคำสั่งซื้อ #${result.id} เรียบร้อยแล้ว`, 'success');
        await loadPage();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
    dialog.showModal();
  }

  function exportRows(rows, filename) {
    if (!rows.length) {
      notify('ไม่มีข้อมูลสำหรับส่งออก', 'error');
      return;
    }
    const columns = Object.keys(rows[0]);
    const csv = [columns, ...rows.map((row) => columns.map((key) => row[key] ?? ''))]
      .map((row) => row.map((value) => {
        const text = String(value);
        const safeValue = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return `"${safeValue.replace(/"/g, '""')}"`;
      }).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  async function loadOrderDetail() {
    const id = new URLSearchParams(window.location.search).get('id') || '10443';
    const order = await api('GET', { resource: 'orders', id });
    const screen = currentScreen();
    const breadcrumb = screen?.querySelector('.breadcrumb .cur');
    if (breadcrumb) breadcrumb.textContent = `คำสั่งซื้อ #${order.id}`;
    const status = screen?.querySelector('.topbar .badge');
    if (status) status.textContent = order.items.length ? 'มีรายการสินค้า' : 'ไม่มีรายการสินค้า';
    const tables = screen?.querySelectorAll('tbody');
    const itemBody = tables?.[0];
    if (itemBody) {
      itemBody.innerHTML = order.items.map((item) => `<tr><td><strong>${escapeHtml(item.product_name)}</strong></td>
        <td>${escapeHtml(item.quantity)}</td><td>${formatMoney(item.unit_price)}</td><td>${formatMoney(item.line_total)}</td></tr>`).join('');
    }
    const total = order.items.reduce((sum, item) => sum + Number(item.line_total), 0);
    const infoValues = screen?.querySelectorAll('.info-val');
    if (infoValues?.length >= 8) {
      infoValues[0].textContent = safeText(order.customer);
      infoValues[1].textContent = safeText(order.contact);
      infoValues[2].textContent = `${safeText(order.city)}, ${safeText(order.country)}`;
      infoValues[3].textContent = safeText(order.postal_code);
      infoValues[4].textContent = safeText(order.order_date);
      infoValues[5].textContent = safeText(order.shipper);
      infoValues[6].textContent = safeText(order.employee);
      infoValues[7].textContent = order.items.length ? 'มีรายการสินค้า' : 'ไม่มีรายการสินค้า';
    }
    const infoRows = screen?.querySelectorAll('.detail-grid > div > .card:first-child .info-row');
    if (infoRows?.length >= 3) {
      infoRows[0].querySelector('.info-val').textContent = `${order.items.length} รายการ`;
      infoRows[1].querySelector('.info-val').textContent = `${order.items.reduce((sum, item) => sum + Number(item.quantity), 0)} หน่วย`;
      infoRows[2].querySelector('.info-val').textContent = formatMoney(total);
    }
  }

  async function bindProductForm() {
    const inputs = currentScreen()?.querySelectorAll('.form-input, .form-select');
    const form = document.createElement('form');
    form.id = 'product-edit-form';
    form.className = 'nw-product-form';
    const card = currentScreen()?.querySelector('.card');
    const grid = card?.querySelector('.form-grid');
    if (!grid || !card || !inputs) return;
    const productName = grid.querySelector('input');
    const selects = grid.querySelectorAll('select');
    const textInputs = grid.querySelectorAll('input');
    productName.name = 'c_ProductName';
    productName.required = true;
    selects[0].name = 'i_CategoryID';
    selects[0].required = true;
    selects[1].name = 'i_SupplierID';
    selects[1].required = true;
    textInputs[1].name = 'c_Unit';
    textInputs[1].required = true;
    textInputs[2].name = 'i_Price';
    textInputs[2].required = true;
    const oldCategory = selects[0].value;
    const oldSupplier = selects[1].value;
    const [categories, suppliers] = await Promise.all([
      api('GET', { resource: 'categories' }), api('GET', { resource: 'suppliers' }),
    ]);
    selects[0].innerHTML = '<option value="">— เลือกหมวดหมู่ —</option>' + categories.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    selects[1].innerHTML = '<option value="">— เลือกผู้จัดจำหน่าย —</option>' + suppliers.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    if (oldCategory) selects[0].value = oldCategory;
    if (oldSupplier) selects[1].value = oldSupplier;
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) {
      const product = await api('GET', { resource: 'products', id });
      productName.value = product.name;
      selects[0].value = product.category_id;
      selects[1].value = product.supplier_id;
      textInputs[1].value = product.unit;
      textInputs[2].value = product.price;
      const title = currentScreen()?.querySelector('.page-title');
      if (title) title.textContent = 'แก้ไขสินค้า';
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        await api(id ? 'PUT' : 'POST', { resource: 'products', id }, payload);
        notify('บันทึกข้อมูลสินค้าเรียบร้อยแล้ว', 'success');
        window.location.href = 'products.html';
      } catch (error) {
        notify(error.message, 'error');
      }
    });
    card.insertBefore(form, grid);
    form.appendChild(grid);
    card.querySelectorAll('button').forEach((button) => {
      if (button.textContent.includes('บันทึกสินค้า')) {
        button.type = 'submit';
        button.setAttribute('form', form.id);
      } else if (button.textContent.includes('ยกเลิก')) {
        button.type = 'button';
        button.addEventListener('click', () => { window.location.href = 'products.html'; });
      }
    });
    const back = currentScreen()?.querySelector('.topbar-right .btn');
    back?.addEventListener('click', () => { window.location.href = 'products.html'; });
  }

  async function loadPage() {
    showLoading();
    try {
      if (page === 'dashboard') return await loadDashboard();
      if (page === 'reports') {
        const selector = currentScreen()?.querySelector('.filter-select');
        const selected = selector?.value || '';
        const year = selected === 'ทุกปี' ? 'all' : selected.replace(/\D/g, '');
        const thaiYear = Number(year);
        const data = await api('GET', { resource: 'reports', year: year === 'all' ? 'all' : thaiYear - 543 });
        const orders = await api('GET', { resource: 'orders' });
        state.orders = orders;
        renderReport(data);
        return;
      }
      if (page === 'products' || page === 'orders' || page === 'customers' || page === 'suppliers') {
        return await loadEntityPage(page);
      }
      if (page === 'categories' || page === 'employees' || page === 'shippers') {
        state.records = await api('GET', { resource: page });
        if (page === 'categories') renderCategoryCards(state.records);
        if (page === 'employees') renderEmployees(state.records);
        if (page === 'shippers') renderShippers(state.records);
        const description = currentScreen()?.querySelector('.page-desc');
        if (description) description.textContent = `${state.records.length} รายการจากฐานข้อมูล`;
        return;
      }
      if (page === 'order-detail') return await loadOrderDetail();
      if (page === 'product-form') return await bindProductForm();
    } finally {
      clearLoading();
    }
  }

  function addFilterListeners() {
    const screen = currentScreen();
    screen?.querySelectorAll('.filter-input, .filter-select').forEach((control) => {
      control.addEventListener('input', () => {
        if (page === 'products' || page === 'customers' || page === 'suppliers') applySearch();
        if (page === 'orders') loadEntityPage('orders').catch((error) => notify(error.message, 'error'));
      });
      control.addEventListener('change', () => {
        if (page === 'products' || page === 'customers' || page === 'suppliers') applySearch();
        if (page === 'orders') loadEntityPage('orders').catch((error) => notify(error.message, 'error'));
        if (page === 'reports') loadPage().catch((error) => notify(error.message, 'error'));
      });
    });
  }

  async function login() {
    const form = currentScreen()?.querySelector('#login-form');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const credentials = Object.fromEntries(new FormData(form).entries());
        const result = await api('POST', { action: 'login' }, credentials);
        csrfToken.value = result.csrf_token;
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.replace(pageFiles[next?.replace('.html', '')] || 'dashboard.html');
      } catch (error) {
        notify(error.message, 'error');
      } finally {
        submit.disabled = false;
      }
    });
    const forgot = currentScreen()?.querySelector('[data-action="change-password"]');
    forgot?.addEventListener('click', async () => {
      notify('กรุณาเข้าสู่ระบบก่อน แล้วใช้เมนูเปลี่ยนรหัสผ่านในหน้าหลัก', 'info');
    });
  }

  async function changePassword() {
    const dialog = document.createElement('dialog');
    dialog.className = 'nw-dialog';
    dialog.innerHTML = `<form class="nw-dialog-form">
      <h2>เปลี่ยนรหัสผ่าน</h2>
      <label class="form-group"><span class="form-label required">รหัสผ่านปัจจุบัน</span><input class="form-input" name="old_password" type="password" required autocomplete="current-password"></label>
      <label class="form-group"><span class="form-label required">รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร)</span><input class="form-input" name="new_password" type="password" required minlength="10" autocomplete="new-password"></label>
      <div class="nw-dialog-actions"><button type="button" class="btn btn-outline">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกรหัสผ่าน</button></div>
    </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector('[type="button"]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        await api('POST', { action: 'change-password' }, payload);
        dialog.close();
        notify('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success');
      } catch (error) {
        notify(error.message, 'error');
      }
    });
    dialog.showModal();
  }

  async function handleClick(event) {
    const pagination = event.target.closest('[data-page]');
    if (pagination && pagination.classList.contains('page-btn')) {
      state.pageNumber = Number(pagination.dataset.page);
      renderEntityRows(page, state.filtered);
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.classList.contains('nav-item')) {
      const label = button.textContent.trim();
      const route = label.includes('หมวดหมู่') ? 'categories'
        : label.includes('สินค้า') ? 'products'
          : label.includes('คำสั่งซื้อ') ? 'orders'
            : label.includes('ลูกค้า') ? 'customers'
              : label.includes('ผู้จัดจำหน่าย') ? 'suppliers'
                : label.includes('ขนส่ง') ? 'shippers'
                  : label.includes('พนักงาน') ? 'employees'
                    : label.includes('รายงาน') ? 'reports'
                      : label.includes('แดชบอร์ด') ? 'dashboard' : '';
      if (route) window.location.href = pageFiles[route];
      return;
    }
    const action = button.dataset.action;
    if (action === 'logout') {
      try {
        await api('POST', { action: 'logout' }, {});
        window.location.replace('login.html');
      } catch (error) { notify(error.message, 'error'); }
      return;
    }
    if (action === 'change-password') {
      await changePassword();
      return;
    }
    if (action === 'notifications') {
      notify('ไม่มีการแจ้งเตือนใหม่');
      return;
    }
    if (action === 'edit' || action === 'view') {
      const resource = button.dataset.resource;
      const record = state.records.find((row) => String(row.id) === button.dataset.id);
      if (record) await openEditor(resource, record, action === 'view');
      else await openEditor(resource);
      return;
    }
    if (action === 'delete') {
      const resource = button.dataset.resource;
      const record = state.records.find((row) => String(row.id) === button.dataset.id);
      if (!window.confirm(`ยืนยันลบ ${record?.name || 'รายการนี้'}? การลบไม่สามารถย้อนกลับได้`)) return;
      try {
        await api('DELETE', { resource, id: button.dataset.id });
        notify('ลบข้อมูลเรียบร้อยแล้ว', 'success');
        await loadPage();
      } catch (error) { notify(error.message, 'error'); }
      return;
    }
    if (action === 'order-detail') {
      window.location.href = `order-detail.html?id=${encodeURIComponent(button.dataset.id)}`;
      return;
    }
    if (action === 'logout') return;

    const label = button.textContent.trim();
    if (label.includes('เพิ่มสินค้าใหม่')) {
      window.location.href = 'product-form.html';
    } else if (label.includes('เพิ่มหมวดหมู่')) {
      await openEditor('categories');
    } else if (label.includes('เพิ่มลูกค้า')) {
      await openEditor('customers');
    } else if (label.includes('เพิ่มผู้จัดจำหน่าย')) {
      await openEditor('suppliers');
    } else if (label.includes('เพิ่มพนักงาน')) {
      await openEditor('employees');
    } else if (label.includes('เพิ่มบริษัทขนส่ง')) {
      await openEditor('shippers');
    } else if (label.includes('สร้างคำสั่งซื้อ')) {
      await openOrderEditor();
    } else if (label.includes('รีเฟรช')) {
      await loadPage();
      notify('โหลดข้อมูลใหม่แล้ว', 'success');
    } else if (label.includes('CSV') || label.includes('Excel')) {
      exportRows(state.filtered.length ? state.filtered : state.records, `${page}.csv`);
    } else if (label.includes('PDF')) {
      window.print();
    } else if (label.includes('พิมพ์')) {
      window.print();
    } else if (label.includes('⚙️')) {
      await changePassword();
    } else if (label.includes('🔔')) {
      notify('ไม่มีการแจ้งเตือนใหม่');
    } else if (button.classList.contains('tab-item')) {
      currentScreen()?.querySelectorAll('.tab-item').forEach((tab) => tab.classList.toggle('active', tab === button));
      const tabIndex = [...(currentScreen()?.querySelectorAll('.tab-item') || [])].indexOf(button);
      const group = ['overview', 'products', 'customers', 'employees'][tabIndex];
      if (page === 'reports') renderReportTable(group === 'overview' ? 'customers' : group);
    }
  }

  async function start() {
    if (page === 'login') {
      await login();
      try {
        const session = await api('GET', { action: 'me' });
        csrfToken.value = session.csrf_token;
        window.location.replace('dashboard.html');
      } catch (error) {
        if (!error.message.includes('กรุณาเข้าสู่ระบบ')) notify(error.message, 'error');
      }
      return;
    }
    if (!pageFiles[page]) return;
    try {
      const session = await api('GET', { action: 'me' });
      csrfToken.value = session.csrf_token;
      addLogoutButton(session.user);
      updateSidebarUser(session.user);
      bindGlobalSearch();
      addFilterListeners();
      document.addEventListener('click', (event) => {
        handleClick(event).catch((error) => notify(error.message, 'error'));
      });
      if (page === 'product-form') {
        await bindProductForm();
      } else {
        await loadPage();
      }
    } catch (error) {
      if (!error.message.includes('กรุณาเข้าสู่ระบบ')) notify(error.message, 'error');
    }
  }

  start().catch((error) => notify(error.message, 'error'));
})();
