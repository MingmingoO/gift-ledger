/* ============================================================
 * 登录层 Auth
 * 云端模式：Supabase 邮箱 + 密码（注册 / 登录 / 退出）
 * 本地模式：仅输入一个「账号名」即可进入，数据按账号名隔离
 * ============================================================ */
(function () {
  let supabase = null;
  let current = null; // {mode, id, name}
  let listeners = [];
  let cloudReady = false;
  let cloudError = '';

  function emit() { listeners.forEach(fn => fn(current)); }
  function onChange(fn) { listeners.push(fn); }
  function isCloudReady() { return cloudReady; }
  function getCloudError() { return cloudError; }

  async function init() {
    cloudReady = false; cloudError = '';
    if (APP_CONFIG.useSupabase) {
      try {
        supabase = await GiftDB.initSupabase();
        cloudReady = true;
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          current = { mode: 'cloud', id: data.session.user.id, name: data.session.user.email };
          GiftDB.setContext({ mode: 'cloud', userId: current.id });
        }
        supabase.auth.onAuthStateChange((_e, session) => {
          if (session) {
            current = { mode: 'cloud', id: session.user.id, name: session.user.email };
            GiftDB.setContext({ mode: 'cloud', userId: current.id });
          } else {
            current = null;
            GiftDB.setContext({ mode: 'local', userId: null });
          }
          emit();
        });
      } catch (e) {
        // 云端不可用：降级为「可进入但提示用户」的状态，绝不裸崩
        cloudReady = false;
        cloudError = e.message || '云端初始化失败';
        supabase = null;
        GiftDB.setContext({ mode: 'local', account: null });
        console.warn('[Auth] 云端初始化失败，已降级：', cloudError);
      }
    } else {
      // 本地模式：恢复上次账号
      const acc = localStorage.getItem('gift_local_account');
      if (acc) {
        current = { mode: 'local', id: acc, name: acc };
        GiftDB.setContext({ mode: 'local', account: acc });
      }
    }
    return current;
  }

  // 设置保存后重新初始化云端（用于即时验证连接）
  async function reinit() {
    return await init();
  }

  // 云端：注册
  async function signUp(email, password) {
    if (!supabase || !cloudReady) {
      throw new Error('云端未连接：请先在「设置」中正确填写 Supabase 的 Project URL 和 anon key，保存后刷新页面。或直接使用本地账号进入。');
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user && data.session) {
      current = { mode: 'cloud', id: data.user.id, name: data.user.email };
    } else {
      // 需要邮箱验证时，session 为空
      throw new Error('注册成功，请先到邮箱完成验证，再回来登录。');
    }
    return current;
  }

  // 云端：登录
  async function signIn(email, password) {
    if (!supabase || !cloudReady) {
      throw new Error('云端未连接：请先在「设置」中正确填写 Supabase 的 Project URL 和 anon key，保存后刷新页面。或直接使用本地账号进入。');
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    current = { mode: 'cloud', id: data.user.id, name: data.user.email };
    return current;
  }

  // 本地：用账号名进入
  function loginLocal(account) {
    account = String(account || '').trim();
    if (!account) throw new Error('请输入账号名');
    localStorage.setItem('gift_local_account', account);
    current = { mode: 'local', id: account, name: account };
    GiftDB.setContext({ mode: 'local', account });
    emit();
    return current;
  }

  async function logout() {
    if (current && current.mode === 'cloud' && supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('gift_local_account');
      GiftDB.setContext({ mode: 'local', account: null });
    }
    current = null;
    emit();
  }

  function getCurrent() { return current; }

  window.Auth = {
    init, onChange, reinit, signUp, signIn, loginLocal, logout, getCurrent,
    isCloudReady, getCloudError
  };
})();
