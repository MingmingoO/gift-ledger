/* ============================================================
 * 主逻辑 App
 * ============================================================ */
(function () {
  const $ = id => document.getElementById(id);
  let authMode = 'signin';
  let editingId = null;
  let charts = {};
  let lastFilter = {};

  // ---------------- 工具 ----------------
  function showToast(msg, isErr) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.classList.remove('hidden');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.add('hidden'), 2600);
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function uid() { return (crypto.randomUUID && crypto.randomUUID()) || ('x' + Date.now()); }

  // ---------------- 登录视图 ----------------
  function renderLogin() {
    const cfgExists = APP_CONFIG.useSupabase;
    const cloud = cfgExists && Auth.isCloudReady();
    $('cloud-login').classList.toggle('hidden', !cloud);
    $('local-login').classList.toggle('hidden', cloud);
    const sub = $('login-sub');
    sub.style.color = '';
    if (cloud) {
      sub.textContent = '已连接到云端，使用邮箱登录即可多设备同步。';
    } else if (cfgExists) {
      sub.textContent = '⚠ 云端连接失败：' + (Auth.getCloudError() || '未知错误') + '。可先用本地账号进入，或到「设置」检查配置。';
      sub.style.color = 'var(--out)';
    } else {
      sub.textContent = '记录人情往来，分人分时段查询，多账号各自独立。';
    }
    // 云端可用时：提供「改用本地」入口
    if (cloud && !$('switch-local')) {
      const a = document.createElement('a');
      a.id = 'switch-local'; a.href = 'javascript:;'; a.className = 'hint';
      a.textContent = '不使用云端，用本地账号进入 →';
      a.style.display = 'block'; a.style.marginTop = '10px';
      a.onclick = () => { $('cloud-login').classList.add('hidden'); $('local-login').classList.remove('hidden'); };
      $('cloud-login').appendChild(a);
    }
    // 已填云端配置但当前不可用 / 本地模式：提供「尝试云端」入口
    if (cfgExists && !cloud && !$('switch-cloud')) {
      const a = document.createElement('a');
      a.id = 'switch-cloud'; a.href = 'javascript:;'; a.className = 'hint';
      a.textContent = '改用云端邮箱登录 →';
      a.style.display = 'block'; a.style.marginTop = '10px';
      a.onclick = () => {
        $('local-login').classList.add('hidden');
        $('cloud-login').classList.remove('hidden');
        const s = $('login-sub');
        s.textContent = '⚠ 云端仍不可用：' + (Auth.getCloudError() || '') + '。可先返回用本地账号。';
        s.style.color = 'var(--out)';
      };
      $('local-login').appendChild(a);
    }
  }

  function bindLogin() {
    // 云端 注册/登录 切换
    document.querySelectorAll('#cloud-login .seg-btn').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#cloud-login .seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        authMode = b.dataset.auth;
        $('auth-submit').textContent = authMode === 'signup' ? '注册' : '登录';
        $('auth-hint').textContent = '';
      };
    });
    $('auth-submit').onclick = async () => {
      const email = $('auth-email').value.trim();
      const pwd = $('auth-pwd').value;
      if (!email || !pwd) { $('auth-hint').textContent = '请填写邮箱和密码'; return; }
      try {
        if (authMode === 'signup') await Auth.signUp(email, pwd);
        else await Auth.signIn(email, pwd);
        // 成功后会触发 onAuthStateChange → renderApp
      } catch (e) {
        $('auth-hint').textContent = e.message || '操作失败';
      }
    };
    // 本地账号
    $('local-submit').onclick = () => {
      try { Auth.loginLocal($('local-account').value); }
      catch (e) { showToast(e.message, true); }
    };
  }

  // ---------------- 主应用渲染 ----------------
  function renderApp(user) {
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    $('user-name').textContent = user.name;
    const badge = $('mode-badge');
    if (user.mode === 'cloud') { badge.textContent = '云端'; badge.className = 'badge'; }
    else { badge.textContent = '本地'; badge.className = 'badge local'; }
    $('rec-date').value = today();
    refreshAll();
  }

  function renderLoggedOut() {
    $('app-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    renderLogin();
  }

  // ---------------- Tab 切换 ----------------
  function bindTabs() {
    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        $('tab-' + t.dataset.tab).classList.add('active');
        if (t.dataset.tab === 'list') refreshList();
        if (t.dataset.tab === 'stats') refreshStats();
      };
    });
  }

  // ---------------- 记账表单 ----------------
  function bindForm() {
    document.querySelectorAll('#add-form .seg-btn').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#add-form .seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        $('rec-type').value = b.dataset.type;
      };
    });
    $('add-form').onsubmit = async (e) => {
      e.preventDefault();
      const rec = {
        type: $('rec-type').value,
        person: $('rec-person').value.trim(),
        eventType: $('rec-event').value,
        amount: $('rec-amount').value,
        recordDate: $('rec-date').value,
        note: $('rec-note').value.trim()
      };
      if (!rec.person || !rec.amount || !rec.recordDate) { showToast('请填写往来人、金额、日期', true); return; }
      try {
        if (editingId) { await GiftDB.update(Object.assign(rec, { id: editingId })); showToast('已更新'); }
        else { await GiftDB.add(rec); showToast('已保存'); }
        resetForm();
        refreshAll();
      } catch (err) { showToast('保存失败：' + (err.message || err), true); }
    };
    $('btn-cancel-edit').onclick = resetForm;
  }

  function resetForm() {
    editingId = null;
    $('edit-id').value = '';
    $('form-title').textContent = '添加一笔记录';
    $('add-form').reset();
    $('rec-type').value = 'in';
    document.querySelectorAll('#add-form .seg-btn').forEach(x => x.classList.toggle('active', x.dataset.type === 'in'));
    $('rec-date').value = today();
    $('btn-cancel-edit').classList.add('hidden');
  }

  function startEdit(rec) {
    editingId = rec.id;
    $('form-title').textContent = '编辑记录';
    $('rec-type').value = rec.type;
    document.querySelectorAll('#add-form .seg-btn').forEach(x => x.classList.toggle('active', x.dataset.type === rec.type));
    $('rec-person').value = rec.person;
    $('rec-event').value = rec.eventType;
    $('rec-amount').value = rec.amount;
    $('rec-date').value = rec.recordDate;
    $('rec-note').value = rec.note;
    $('btn-cancel-edit').classList.remove('hidden');
    // 切到记账页
    document.querySelector('.tab[data-tab="add"]').click();
  }

  // ---------------- 明细 / 查询 ----------------
  function bindList() {
    $('btn-query').onclick = refreshList;
    $('btn-reset').onclick = () => {
      $('f-person').value = ''; $('f-from').value = ''; $('f-to').value = '';
      $('f-type').value = ''; $('f-event').value = ''; refreshList();
    };
  }

  async function refreshList() {
    lastFilter = {
      person: $('f-person').value.trim(),
      dateFrom: $('f-from').value,
      dateTo: $('f-to').value,
      type: $('f-type').value,
      eventType: $('f-event').value
    };
    let rows;
    try { rows = await GiftDB.list(lastFilter); }
    catch (e) { showToast('查询失败：' + (e.message || e), true); return; }
    renderList(rows);
  }

  function renderList(rows) {
    const body = $('list-body');
    body.innerHTML = '';
    let sumIn = 0, sumOut = 0;
    rows.forEach(r => {
      const tr = document.createElement('tr');
      const amtClass = r.type === 'in' ? 'in' : 'out';
      tr.innerHTML =
        `<td>${r.recordDate}</td>` +
        `<td><span class="tag ${amtClass}">${r.type === 'in' ? '收礼' : '送礼'}</span></td>` +
        `<td>${escapeHtml(r.person)}</td>` +
        `<td>${escapeHtml(r.eventType)}</td>` +
        `<td class="num ${amtClass}">${Stats.money(r.amount)}</td>` +
        `<td>${escapeHtml(r.note || '')}</td>` +
        `<td class="row-actions"><button data-edit="${r.id}">编辑</button><button class="del" data-del="${r.id}">删除</button></td>`;
      body.appendChild(tr);
      if (r.type === 'in') sumIn += Number(r.amount); else sumOut += Number(r.amount);
    });
    $('list-empty').classList.toggle('hidden', rows.length > 0);
    $('list-summary').innerHTML =
      `共 <b>${rows.length}</b> 笔 ｜ 收礼 <b style="color:var(--in)">${Stats.money(sumIn)}</b> ｜ ` +
      `送礼 <b style="color:var(--out)">${Stats.money(sumOut)}</b> ｜ 净额 <b>${Stats.money(sumIn - sumOut)}</b>`;

    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const rec = currentRows.find(r => r.id === b.dataset.edit);
      if (rec) startEdit(rec);
    });
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('确定删除这条记录？')) return;
      try { await GiftDB.remove(b.dataset.del); showToast('已删除'); refreshAll(); }
      catch (e) { showToast('删除失败：' + (e.message || e), true); }
    });
    currentRows = rows;
  }
  let currentRows = [];

  // ---------------- 统计 ----------------
  async function refreshStats() {
    let rows;
    try { rows = await GiftDB.exportAll(); }
    catch (e) { showToast('统计失败：' + (e.message || e), true); return; }
    const s = Stats.compute(rows);
    $('st-in').textContent = Stats.money(s.totalIn);
    $('st-out').textContent = Stats.money(s.totalOut);
    $('st-net').textContent = Stats.money(s.net);
    $('st-count').textContent = s.count;
    $('stats-empty').classList.toggle('hidden', s.personList.length > 0);

    // 人情账本表
    const pb = $('stats-person-body'); pb.innerHTML = '';
    s.personList.forEach(p => {
      const tr = document.createElement('tr');
      const netColor = p.net > 0 ? 'var(--in)' : (p.net < 0 ? 'var(--out)' : 'var(--text)');
      tr.innerHTML =
        `<td>${escapeHtml(p.person)}</td>` +
        `<td class="num" style="color:var(--in)">${Stats.money(p.in)}</td>` +
        `<td class="num" style="color:var(--out)">${Stats.money(p.out)}</td>` +
        `<td class="num" style="color:${netColor};font-weight:600">${Stats.money(p.net)}</td>` +
        `<td>${p.status}</td><td>${p.lastDate}</td>`;
      pb.appendChild(tr);
    });

    // 图表
    if (window.Chart) {
      drawMonthChart(s.monthList);
      drawPersonChart(s.personList);
    }
  }

  function drawMonthChart(months) {
    const ctx = $('chart-month').getContext('2d');
    if (charts.month) charts.month.destroy();
    charts.month = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map(m => m.month),
        datasets: [
          { label: '收礼', data: months.map(m => m.in), backgroundColor: '#16a34a' },
          { label: '送礼', data: months.map(m => m.out), backgroundColor: '#dc2626' }
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }
  function drawPersonChart(people) {
    const top = people.slice(0, 10);
    const ctx = $('chart-person').getContext('2d');
    if (charts.person) charts.person.destroy();
    charts.person = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top.map(p => p.person),
        datasets: [{
          label: '净额',
          data: top.map(p => p.net),
          backgroundColor: top.map(p => p.net >= 0 ? '#16a34a' : '#dc2626')
        }]
      },
      options: { indexAxis: 'y', responsive: true, scales: { x: { beginAtZero: true } } }
    });
  }

  // ---------------- 设置 ----------------
  function bindSettings() {
    $('cfg-url').value = APP_CONFIG.supabaseUrl;
    $('cfg-key').value = APP_CONFIG.supabaseKey;
    $('btn-save-cfg').onclick = async () => {
      APP_CONFIG.saveSupabase($('cfg-url').value, $('cfg-key').value);
      $('cfg-msg').textContent = '正在连接云端验证…';
      try {
        await Auth.reinit();
        if (Auth.isCloudReady()) {
          $('cfg-msg').textContent = '✅ 已成功连接到 Supabase 云端，刷新页面即可用邮箱登录。';
          showToast('云端连接成功');
          renderLogin();
        } else {
          $('cfg-msg').textContent = '⚠ 配置已保存，但云端连接失败：' + (Auth.getCloudError() || '未知错误') + '。仍可先用本地模式，或检查 URL/anon key。';
        }
      } catch (e) {
        $('cfg-msg').textContent = '⚠ 配置已保存，但云端连接失败：' + (e.message || e);
      }
    };
    $('btn-clear-cfg').onclick = () => {
      APP_CONFIG.clearSupabase();
      $('cfg-url').value = ''; $('cfg-key').value = '';
      $('cfg-msg').textContent = '已清除云端配置，恢复为本地模式。';
    };
    $('btn-export').onclick = exportJson;
    $('file-import').onchange = importJson;
    $('btn-sample').onclick = loadSample;
    $('btn-clear').onclick = async () => {
      if (!confirm('将清空当前账号全部数据，且无法恢复（建议先导出备份）。确定？')) return;
      try { await GiftDB.clearAll(); showToast('已清空'); refreshAll(); }
      catch (e) { showToast('清空失败：' + (e.message || e), true); }
    };
  }

  async function exportJson() {
    const rows = await GiftDB.exportAll();
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const u = Auth.getCurrent();
    a.href = URL.createObjectURL(blob);
    a.download = `礼金记录_${u ? u.name : 'backup'}_${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('已导出 ' + rows.length + ' 条');
  }

  async function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('导入将覆盖当前账号的全部数据，确定继续？')) { e.target.value = ''; return; }
    try {
      const text = await file.text();
      const rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error('文件格式不正确');
      await GiftDB.importAll(rows);
      showToast('已导入 ' + rows.length + ' 条');
      refreshAll();
    } catch (err) { showToast('导入失败：' + (err.message || err), true); }
    e.target.value = '';
  }

  async function loadSample() {
    const sample = [
      { type: 'in', person: '李雷', eventType: '结婚', amount: 600, recordDate: '2025-05-01', note: '同学' },
      { type: 'out', person: '李雷', eventType: '满月/百日', amount: 400, recordDate: '2025-11-12', note: '回礼' },
      { type: 'in', person: '韩梅梅', eventType: '乔迁', amount: 800, recordDate: '2025-08-20', note: '' },
      { type: 'out', person: '王芳', eventType: '结婚', amount: 500, recordDate: '2026-01-10', note: '同事' },
      { type: 'in', person: '张伟', eventType: '白事/奠仪', amount: 300, recordDate: '2026-03-05', note: '' }
    ];
    try { for (const r of sample) await GiftDB.add(r); showToast('已载入示例数据'); refreshAll(); }
    catch (e) { showToast('载入失败：' + (e.message || e), true); }
  }

  // ---------------- 公共 ----------------
  async function refreshAll() {
    // 更新往来人下拉
    try {
      const all = await GiftDB.exportAll();
      const set = [...new Set(all.map(r => r.person))];
      $('person-list').innerHTML = set.map(p => `<option value="${escapeHtml(p)}">`).join('');
    } catch (e) {}
    if ($('tab-list').classList.contains('active')) refreshList();
    if ($('tab-stats').classList.contains('active')) refreshStats();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------- 启动 ----------------
  async function start() {
    bindLogin(); bindTabs(); bindForm(); bindList(); bindSettings();
    $('btn-logout').onclick = () => Auth.logout();

    Auth.onChange(user => { if (user) renderApp(user); else renderLoggedOut(); });

    try {
      const user = await Auth.init();
      if (user) renderApp(user); else renderLoggedOut();
    } catch (e) {
      console.error(e);
      renderLoggedOut();
    }
  }

  document.addEventListener('DOMContentLoaded', start);
})();
