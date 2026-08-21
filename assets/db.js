/* ============================================================
 * 数据层 GiftDB
 * 统一接口，自动选择「云端 Supabase」或「本地 localStorage」模式。
 * 字段统一为：{id, type, person, eventType, amount, recordDate, note, createdAt}
 *   type: 'in'=收礼(别人给我)  'out'=送礼(我给别人)
 * ============================================================ */
(function () {
  let supabase = null;
  let context = { mode: 'local', userId: null, account: null };

  // 依次尝试多个 CDN，提高国内网络下的加载成功率
  const SUPABASE_CDN_LIST = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2',
    'https://esm.sh/@supabase/supabase-js@2?bundle'
  ];
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('脚本加载失败: ' + src));
      document.head.appendChild(s);
    });
  }
  async function loadSupabaseSdk() {
    if (window.supabase) return true;
    let lastErr;
    for (const src of SUPABASE_CDN_LIST) {
      try { await loadScript(src); if (window.supabase) return true; }
      catch (e) { lastErr = e; }
    }
    throw new Error('Supabase 脚本加载失败（已尝试 jsdelivr、unpkg、esm.sh 多个 CDN）。可能是网络无法访问这些站点，建议改用本地模式，或确认浏览器能联网后再试。');
  }

  async function initSupabase() {
    if (!APP_CONFIG.useSupabase) return null;
    await loadSupabaseSdk();
    const url = (APP_CONFIG.supabaseUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Supabase Project URL 格式不正确：必须以 http(s):// 开头，形如 https://xxxx.supabase.co。' +
        '请到 Supabase 控制台 → 你的项目 → Project Settings → API 里复制「Project URL」，不要填控制台网页地址（supabase.com/dashboard/...）。');
    }
    try {
      supabase = window.supabase.createClient(url, APP_CONFIG.supabaseKey);
    } catch (e) {
      throw new Error('创建 Supabase 客户端失败：' + (e.message || e) +
        '。请检查「设置」中的 Project URL 是否为完整地址（形如 https://xxxx.supabase.co），以及 anon key 是否正确。');
    }
    return supabase;
  }

  function setContext(ctx) {
    context = Object.assign({}, context, ctx);
  }

  // ---------------- 本地模式 ----------------
  function localKey() {
    return 'gift_records_' + (context.account || 'default');
  }
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(localKey()) || '[]'); }
    catch (e) { return []; }
  }
  function writeLocal(arr) {
    localStorage.setItem(localKey(), JSON.stringify(arr));
  }
  function genId() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      ('id_' + Date.now() + '_' + Math.random().toString(36).slice(2));
  }

  // ---------------- 查询 ----------------
  async function list(filter) {
    filter = filter || {};
    if (context.mode === 'cloud' && supabase) {
      let q = supabase.from('gift_records').select('*');
      if (filter.person) q = q.ilike('person', '%' + filter.person + '%');
      if (filter.type) q = q.eq('type', filter.type);
      if (filter.eventType) q = q.eq('event_type', filter.eventType);
      if (filter.dateFrom) q = q.gte('record_date', filter.dateFrom);
      if (filter.dateTo) q = q.lte('record_date', filter.dateTo);
      q = q.order('record_date', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(rowToRecord);
    } else {
      let arr = readLocal();
      if (filter.person) arr = arr.filter(r => r.person.includes(filter.person));
      if (filter.type) arr = arr.filter(r => r.type === filter.type);
      if (filter.eventType) arr = arr.filter(r => r.eventType === filter.eventType);
      if (filter.dateFrom) arr = arr.filter(r => r.recordDate >= filter.dateFrom);
      if (filter.dateTo) arr = arr.filter(r => r.recordDate <= filter.dateTo);
      arr.sort((a, b) => (a.recordDate < b.recordDate ? 1 : a.recordDate > b.recordDate ? -1 : 0));
      return arr;
    }
  }

  // ---------------- 增删改 ----------------
  async function add(rec) {
    const record = normalize(rec);
    if (context.mode === 'cloud' && supabase) {
      const { data, error } = await supabase.from('gift_records').insert({
        user_id: context.userId,
        type: record.type,
        person: record.person,
        event_type: record.eventType,
        amount: record.amount,
        record_date: record.recordDate,
        note: record.note
      }).select().single();
      if (error) throw error;
      return rowToRecord(data);
    } else {
      const arr = readLocal();
      record.id = genId();
      record.createdAt = new Date().toISOString();
      arr.push(record);
      writeLocal(arr);
      return record;
    }
  }

  async function update(rec) {
    const record = normalize(rec);
    if (context.mode === 'cloud' && supabase) {
      const { error } = await supabase.from('gift_records').update({
        type: record.type,
        person: record.person,
        event_type: record.eventType,
        amount: record.amount,
        record_date: record.recordDate,
        note: record.note
      }).eq('id', record.id);
      if (error) throw error;
      return record;
    } else {
      const arr = readLocal();
      const i = arr.findIndex(r => r.id === record.id);
      if (i >= 0) { arr[i] = Object.assign({}, arr[i], record); writeLocal(arr); }
      return record;
    }
  }

  async function remove(id) {
    if (context.mode === 'cloud' && supabase) {
      const { error } = await supabase.from('gift_records').delete().eq('id', id);
      if (error) throw error;
    } else {
      const arr = readLocal().filter(r => r.id !== id);
      writeLocal(arr);
    }
  }

  // ---------------- 备份 / 恢复 ----------------
  async function exportAll() {
    if (context.mode === 'cloud' && supabase) {
      const { data, error } = await supabase.from('gift_records').select('*').order('record_date');
      if (error) throw error;
      return (data || []).map(rowToRecord);
    }
    return readLocal();
  }

  async function importAll(records) {
    const clean = (records || []).map(normalize);
    if (context.mode === 'cloud' && supabase) {
      // 先清空再批量写入（导入即覆盖）
      await supabase.from('gift_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (clean.length) {
        const rows = clean.map(r => ({
          user_id: context.userId, type: r.type, person: r.person,
          event_type: r.eventType, amount: r.amount, record_date: r.recordDate, note: r.note
        }));
        const { error } = await supabase.from('gift_records').insert(rows);
        if (error) throw error;
      }
    } else {
      writeLocal(clean);
    }
  }

  async function clearAll() {
    if (context.mode === 'cloud' && supabase) {
      await supabase.from('gift_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      writeLocal([]);
    }
  }

  // ---------------- 工具 ----------------
  function normalize(r) {
    return {
      id: r.id || null,
      type: r.type === 'out' ? 'out' : 'in',
      person: String(r.person || '').trim(),
      eventType: String(r.eventType || '其他').trim(),
      amount: Math.max(0, Number(r.amount) || 0),
      recordDate: r.recordDate || new Date().toISOString().slice(0, 10),
      note: String(r.note || ''),
      createdAt: r.createdAt || new Date().toISOString()
    };
  }
  function rowToRecord(row) {
    return {
      id: row.id,
      type: row.type,
      person: row.person,
      eventType: row.event_type,
      amount: Number(row.amount),
      recordDate: row.record_date,
      note: row.note || '',
      createdAt: row.created_at
    };
  }

  window.GiftDB = {
    initSupabase, setContext, list, add, update, remove,
    exportAll, importAll, clearAll
  };
})();
