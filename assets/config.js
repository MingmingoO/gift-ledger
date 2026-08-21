/* ============================================================
 * 配置层
 * - 云端模式：从 localStorage 读取用户填入的 Supabase 地址与密钥
 * - 本地模式：未配置时，使用浏览器 localStorage 作为降级存储
 * ============================================================ */
(function () {
  window.APP_CONFIG = {
    // 首次进入「设置」填入后，会保存到浏览器，下次自动连接云端
    supabaseUrl: localStorage.getItem('gift_supabase_url') || '',
    supabaseKey: localStorage.getItem('gift_supabase_key') || '',

    get useSupabase() {
      return !!(this.supabaseUrl && this.supabaseKey);
    },

    saveSupabase(url, key) {
      // 去掉首尾空白与结尾斜杠，避免常见的「多打一个 /」导致 REST 路径错位
      this.supabaseUrl = (url || '').trim().replace(/\/+$/, '');
      this.supabaseKey = (key || '').trim();
      localStorage.setItem('gift_supabase_url', this.supabaseUrl);
      localStorage.setItem('gift_supabase_key', this.supabaseKey);
    },

    clearSupabase() {
      this.supabaseUrl = '';
      this.supabaseKey = '';
      localStorage.removeItem('gift_supabase_url');
      localStorage.removeItem('gift_supabase_key');
    }
  };
})();
