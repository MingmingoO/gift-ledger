/* ============================================================
 * 统计计算 Stats
 * 输入：记录数组；输出：概览 / 按人 / 按月 / 人情账本
 * ============================================================ */
(function () {
  function compute(records) {
    records = records || [];
    let totalIn = 0, totalOut = 0;
    const byPerson = {};   // person -> {in, out, count, lastDate}
    const byMonth = {};    // 'YYYY-MM' -> {in, out}

    records.forEach(r => {
      const amt = Number(r.amount) || 0;
      if (r.type === 'in') totalIn += amt; else totalOut += amt;

      if (!byPerson[r.person]) byPerson[r.person] = { person: r.person, in: 0, out: 0, count: 0, lastDate: '' };
      const p = byPerson[r.person];
      if (r.type === 'in') p.in += amt; else p.out += amt;
      p.count += 1;
      if (r.recordDate > p.lastDate) p.lastDate = r.recordDate;

      const month = (r.recordDate || '').slice(0, 7);
      if (month) {
        if (!byMonth[month]) byMonth[month] = { month, in: 0, out: 0 };
        if (r.type === 'in') byMonth[month].in += amt; else byMonth[month].out += amt;
      }
    });

    const personList = Object.values(byPerson).map(p => {
      p.net = p.in - p.out;            // >0 别人给我多(我欠人情)  <0 我给别人多(欠我人情)
      p.status = p.net > 0 ? '我欠人情' : (p.net < 0 ? '欠我人情' : '已平');
      return p;
    }).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    const monthList = Object.values(byMonth).sort((a, b) => a.month < b.month ? -1 : 1);

    return {
      totalIn, totalOut, net: totalIn - totalOut, count: records.length,
      personList, monthList
    };
  }

  // 货币格式化
  function money(n) {
    return '¥' + (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  window.Stats = { compute, money };
})();
