/*!
 * 생활 계산소 — 출산·육아지원금 · 퇴직금/연차수당 · 실업급여 계산기
 * 기준일: 2026-11-15 (대한민국)
 *
 * 모든 계산 함수는 DOM과 분리되어 있어 tests/test.html 이나 tests/run.py 에서 그대로 검증합니다.
 * 근거 법령·고시는 about.html 의 '계산 기준' 표를 참고하세요.
 */
(function (global) {
  'use strict';

  var MAN = 10000;
  var EOK = 100000000;

  /* ------------------------------------------------------------------ *
   * 0. 공통 유틸
   * ------------------------------------------------------------------ */

  function toNum(value, fallback) {
    var f = (fallback === undefined) ? 0 : fallback;
    if (value === null || value === undefined || value === '') return f;
    var n = Number(String(value).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : f;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /** 천 단위 쉼표 */
  function comma(n) {
    var v = Math.round(n);
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 원 → "1,234만 5,000원" 형태의 읽기용 표기 */
  function koWon(won) {
    var v = Math.round(won);
    if (v === 0) return '0원';
    var sign = v < 0 ? '-' : '';
    v = Math.abs(v);
    var eok = Math.floor(v / EOK);
    var man = Math.floor((v % EOK) / MAN);
    var rest = v % MAN;
    var out = [];
    if (eok > 0) out.push(eok + '억');
    if (man > 0) out.push(comma(man) + '만');
    if (rest > 0) out.push(comma(rest));
    return sign + out.join(' ') + '원';
  }

  /** 원 → "1,234만원" (만 단위 반올림, 요약용) */
  function manWon(won) {
    var v = Math.round(won / MAN);
    if (v === 0) return '0원';
    return comma(v) + '만원';
  }

  /* ------------------------------------------------------------------ *
   * 1. 2026년 기준 상수 (법령·고시 원문 확인)
   * ------------------------------------------------------------------ */

  var C = {
    year: 2026,
    /* 첫만남이용권: 2024.1.1 이후 출생아, 첫째 200만 / 둘째 이상 300만 */
    firstMeet: { 1: 2000000, 2: 3000000, 3: 3000000 },
    /* 부모급여: 0세 월 100만 / 1세 월 50만 (만 2세 미만, 24개월) */
    parentBenefit: { 0: 1000000, 1: 500000 },
    /* 어린이집 이용 시 기본보육료(바우처) — 부모급여에서 차감 */
    daycareFee: { 0: 584000, 1: 515000 },
    /* 아동수당: 만 9세 미만, 월 10만 + 지역 추가 */
    childAllowance: {
      metro: 100000, nonmetro: 105000, depopPref: 110000, depopSpec: 120000
    },
    voucherBonus: 10000,
    childAllowanceMonths: 24,
    /* 육아휴직급여 상한(월) */
    leave: {
      generalCaps: [2500000, 2500000, 2500000, 2000000, 2000000, 2000000, 1600000],
      generalRates: [1, 1, 1, 1, 1, 1, 0.8],
      togetherCaps: [2500000, 2500000, 3000000, 3500000, 4000000, 4500000],
      floor: 700000,
      singleParentCap: 3000000
    },
    /* 2026년 최저임금(시급) — 실업급여 하한·연차수당 참고 */
    minWage: 10320,
    minWage2027: 10700,
    /* 구직급여: 2026.1.1 이후 이직자 */
    ui: { cap: 68100, baseCap: 113500, rate: 0.6, floorRate: 0.8 },
    /* 2027 개편 정부안(국회 심의 전) */
    plan2027: {
      grant: { 1: 10000000, 2: 12000000, 3: 15000000 },
      grantPrefBonus: 5000000,
      childBasic: 200000,
      prefBonus: 100000,
      homeCareBonus: 300000
    }
  };

  /* ------------------------------------------------------------------ *
   * 2. 출산·육아 지원금
   * ------------------------------------------------------------------ */

  /** 출생 순위별 첫만남이용권 금액 */
  function firstMeetAmount(order) {
    var o = clamp(Math.round(toNum(order, 1)), 1, 3);
    return C.firstMeet[o];
  }

  /** 지역별 아동수당 월액 (상품권 수령 시 인구감소지역만 +1만) */
  function childAllowanceMonthly(region, voucher) {
    var base = C.childAllowance[region];
    if (base === undefined) base = C.childAllowance.metro;
    var depop = (region === 'depopPref' || region === 'depopSpec');
    return base + (voucher && depop ? C.voucherBonus : 0);
  }

  /** 부모급여 월 현금액 (0세/1세, 가정양육 또는 어린이집) */
  function parentBenefitMonthly(age, care) {
    var a = (Math.round(toNum(age, 0)) === 0) ? 0 : 1;
    var gross = C.parentBenefit[a];
    if (care === 'daycare') {
      return Math.max(0, gross - C.daycareFee[a]);
    }
    return gross;
  }

  /** 부모급여 24개월 합계 */
  function parentBenefitTotal(care) {
    return parentBenefitMonthly(0, care) * 12 + parentBenefitMonthly(1, care) * 12;
  }

  /**
   * 육아휴직급여 한 달치
   * @param {number} wage 월 통상임금
   * @param {number} month 1부터 시작하는 사용 월
   * @param {string} mode 'general' | 'together'
   */
  function leavePayMonth(wage, month, mode) {
    var m = Math.max(1, Math.round(toNum(month, 1)));
    var rate, cap;
    if (mode === 'together' && m <= 6) {
      rate = 1;
      cap = C.leave.togetherCaps[m - 1];
    } else {
      var idx = Math.min(m, 7) - 1;
      rate = C.leave.generalRates[idx];
      cap = C.leave.generalCaps[idx];
    }
    var raw = Math.round(wage * rate);
    return Math.min(cap, Math.max(C.leave.floor, raw));
  }

  /** 육아휴직급여 합계 (mode: general | together, together 는 앞 6개월 특례) */
  function leavePayTotal(wage, months, mode) {
    var n = clamp(Math.round(toNum(months)), 0, 18);
    var sum = 0;
    for (var i = 1; i <= n; i++) sum += leavePayMonth(wage, i, mode);
    return sum;
  }

  /** 부모 함께(6+6) 특례를 앞 togetherMonths 만큼 적용하고 나머지는 일반 기준 */
  function leavePayMixed(wage, months, togetherMonths) {
    var n = clamp(Math.round(toNum(months)), 0, 18);
    var t = clamp(Math.round(toNum(togetherMonths)), 0, 6);
    var sum = 0;
    for (var i = 1; i <= n; i++) {
      sum += leavePayMonth(wage, i, i <= t ? 'together' : 'general');
    }
    return sum;
  }

  /**
   * 출산·육아 지원금 통합 계산
   * @param {{order:number, region:string, voucher:boolean, care:string,
   *          wageA:number, wageB:number, leaveType:string,
   *          monthsA:number, monthsB:number}} o
   */
  function calcChildbirth(o) {
    o = o || {};
    var order = clamp(Math.round(toNum(o.order, 1)), 1, 3);
    var region = o.region || 'metro';
    var care = o.care === 'daycare' ? 'daycare' : 'home';
    var leaveType = o.leaveType || 'together';

    var firstMeet = firstMeetAmount(order);
    var childMonthly = childAllowanceMonthly(region, !!o.voucher);
    var childTotal = childMonthly * C.childAllowanceMonths;
    var parentTotal = parentBenefitTotal(care);
    var cashTotal = firstMeet + parentTotal + childTotal;

    var wageA = Math.max(0, toNum(o.wageA));
    var wageB = Math.max(0, toNum(o.wageB));
    var monthsA = clamp(Math.round(toNum(o.monthsA)), 0, 18);
    var monthsB = clamp(Math.round(toNum(o.monthsB)), 0, 18);
    var common = 0;
    var leaveA = 0, leaveB = 0;

    if (leaveType === 'general') {
      leaveA = leavePayTotal(wageA, monthsA, 'general');
      leaveB = leavePayTotal(wageB, monthsB, 'general');
    } else if (leaveType === 'together') {
      common = Math.min(monthsA, monthsB, 6);
      leaveA = leavePayMixed(wageA, monthsA, common);
      leaveB = leavePayMixed(wageB, monthsB, common);
    }
    var leaveTotal = leaveA + leaveB;

    return {
      order: order,
      firstMeet: firstMeet,
      parentMonthly: [parentBenefitMonthly(0, care), parentBenefitMonthly(1, care)],
      parentTotal: parentTotal,
      childMonthly: childMonthly,
      childTotal: childTotal,
      cashTotal: cashTotal,
      leaveA: leaveA,
      leaveB: leaveB,
      leaveTotal: leaveTotal,
      grandTotal: cashTotal + leaveTotal,
      commonMonths: common,
      care: care,
      region: region
    };
  }

  /** 2027년 개편 정부안(아이맞이지원금 + 아동기본수당) 24개월 환산 */
  function preview2027(o) {
    o = o || {};
    var order = clamp(Math.round(toNum(o.order, 1)), 1, 3);
    var pref = !!o.pref;
    var home = o.care !== 'daycare';
    var P = C.plan2027;
    var grant = P.grant[order] + (pref ? P.grantPrefBonus : 0);
    var monthly = P.childBasic + (pref ? P.prefBonus : 0) + (home ? P.homeCareBonus : 0);
    return {
      grant: grant,
      monthly: monthly,
      childTotal24: monthly * 24,
      total24: grant + monthly * 24
    };
  }

  /* ------------------------------------------------------------------ *
   * 3. 퇴직금 · 연차수당
   * ------------------------------------------------------------------ */

  function parseDate(str) {
    if (!str) return null;
    var m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function utc(d) {
    return Date.UTC(d.y, d.m - 1, d.d);
  }

  function addDays(d, n) {
    var t = new Date(utc(d) + n * 86400000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  /** 개월 이동(말일 보정) */
  function addMonths(d, n) {
    var total = (d.y * 12 + (d.m - 1)) + n;
    var y = Math.floor(total / 12);
    var m = total % 12;
    if (m < 0) { m += 12; y -= 1; }
    m += 1;
    var day = Math.min(d.d, daysInMonth(y, m));
    return { y: y, m: m, d: day };
  }

  /** 두 날짜 사이 일수 (b - a) */
  function diffDays(a, b) {
    return Math.round((utc(b) - utc(a)) / 86400000);
  }

  /** 재직일수: 입사일 ~ 마지막 근무일 (양 끝 포함) */
  function serviceDays(hire, last) {
    return diffDays(hire, last) + 1;
  }

  /** 퇴직 전 3개월의 총 일수 (마지막 근무일 기준, 양 끝 포함) */
  function last3MonthsDays(last) {
    var start = addDays(addMonths(last, -3), 1);
    return diffDays(start, last) + 1;
  }

  /** 만 근속 연수 / 개월 */
  function serviceBreakdown(hire, last) {
    var months = (last.y - hire.y) * 12 + (last.m - hire.m);
    if (last.d < hire.d) months -= 1;
    if (months < 0) months = 0;
    return { months: months, years: Math.floor(months / 12), days: serviceDays(hire, last) };
  }

  /** 월 소정근로시간 (주 40시간 → 209시간) */
  function monthlyHours(weeklyHours) {
    var h = clamp(toNum(weeklyHours, 40), 1, 68);
    return Math.round((h + h / 5) * 365 / 12 / 7);
  }

  /** 1일 통상임금 */
  function dailyOrdinaryWage(monthlyWage, weeklyHours) {
    var hours = monthlyHours(weeklyHours);
    return Math.floor(toNum(monthlyWage) / hours * 8);
  }

  /** 근속에 따른 연차 발생일수 (근로기준법 제60조) */
  function accruedLeaveDays(serviceMonths, serviceYears) {
    var y = Math.max(0, Math.floor(toNum(serviceYears, 0)));
    var mo = Math.max(0, Math.floor(toNum(serviceMonths, 0)));
    if (y < 1) return Math.min(11, mo);
    var extra = (y >= 3) ? Math.floor((y - 1) / 2) : 0;
    return Math.min(25, 15 + extra);
  }

  /**
   * 퇴직금·연차수당 계산
   * @param {{hire:string,last:string,base:number,fixed:number,variable:number,
   *          bonus:number,leavePay:number,ordinary:number,weeklyHours:number,
   *          unusedDays:number}} o
   */
  function calcSeverance(o) {
    o = o || {};
    var hire = parseDate(o.hire);
    var last = parseDate(o.last);
    var weeklyHours = clamp(toNum(o.weeklyHours, 40), 1, 68);

    var base = Math.max(0, toNum(o.base));
    var fixed = Math.max(0, toNum(o.fixed));
    var variable = Math.max(0, toNum(o.variable));
    var bonus = Math.max(0, toNum(o.bonus));
    var leavePay = Math.max(0, toNum(o.leavePay));
    var ordinary = Math.max(0, toNum(o.ordinary));
    var unusedDays = clamp(toNum(o.unusedDays), 0, 60);

    var days = 0, months = 0, years = 0, d3 = 0;
    if (hire && last && diffDays(hire, last) >= 0) {
      var sb = serviceBreakdown(hire, last);
      days = sb.days;
      months = sb.months;
      years = sb.years;
      d3 = last3MonthsDays(last);
    }

    var wage3m = (base + fixed) * 3 + variable;
    var bonusPart = bonus * 3 / 12;
    var leavePart = leavePay * 3 / 12;
    var avgSum = wage3m + bonusPart + leavePart;
    var dayAvg = d3 > 0 ? Math.floor(avgSum / d3) : 0;
    var dailyOrd = dailyOrdinaryWage(ordinary, weeklyHours);
    var applied = Math.max(dayAvg, dailyOrd);
    var basis = (dailyOrd > dayAvg) ? '통상임금' : '평균임금';

    var eligible = days >= 365;
    var severance = eligible ? Math.round(applied * 30 * days / 365) : 0;
    var leaveAllowance = Math.floor(dailyOrd * unusedDays);
    var accrued = accruedLeaveDays(months, years);

    return {
      serviceDays: days,
      serviceMonths: months,
      serviceYears: years,
      months3: d3,
      wage3m: wage3m,
      bonusPart: Math.round(bonusPart),
      leavePart: Math.round(leavePart),
      avgSum: Math.round(avgSum),
      dayAvg: dayAvg,
      dailyOrdinary: dailyOrd,
      applied: applied,
      basis: basis,
      eligible: eligible,
      severance: severance,
      leaveAllowance: leaveAllowance,
      accruedDays: accrued,
      unusedDays: unusedDays,
      total: severance + leaveAllowance,
      weeklyHours: weeklyHours,
      monthlyHours: monthlyHours(weeklyHours)
    };
  }

  /* ------------------------------------------------------------------ *
   * 4. 실업급여(구직급여)
   * ------------------------------------------------------------------ */

  /** 소정급여일수 (고용보험법 별표 1) */
  function benefitDays(age, insMonths, disabled) {
    var a = Math.max(0, Math.round(toNum(age)));
    var m = Math.max(0, toNum(insMonths));
    var senior = (a >= 50) || !!disabled;
    if (m < 12) return 120;
    if (m < 36) return senior ? 180 : 150;
    if (m < 60) return senior ? 210 : 180;
    if (m < 120) return senior ? 240 : 210;
    return senior ? 270 : 240;
  }

  /**
   * 구직급여 계산 (2026.1.1 이후 이직자)
   * @param {{age:number, disabled:boolean, insYears:number, insMonths:number,
   *          wage3m:number, days3m:number, hours:number}} o
   */
  function calcUnemployment(o) {
    o = o || {};
    var age = Math.max(0, Math.round(toNum(o.age)));
    var insMonthsTotal = Math.max(0, toNum(o.insYears)) * 12 + Math.max(0, toNum(o.insMonths));
    var wage3m = Math.max(0, toNum(o.wage3m));
    var d3 = clamp(Math.round(toNum(o.days3m, 91)), 28, 93);
    var hours = clamp(toNum(o.hours, 8), 1, 8);

    var baseDaily = d3 > 0 ? wage3m / d3 : 0;
    var raw60 = baseDaily * C.ui.rate;
    var floorPay = Math.floor(C.minWage * C.ui.floorRate * hours);
    var cap = C.ui.cap;
    var daily = Math.floor(Math.min(cap, Math.max(floorPay, raw60)));
    var applied;
    if (raw60 > cap) applied = '상한액';
    else if (raw60 < floorPay) applied = '하한액';
    else applied = '평균임금 60%';

    var days = benefitDays(age, insMonthsTotal, o.disabled);
    return {
      baseDaily: Math.floor(baseDaily),
      raw60: Math.floor(raw60),
      floorPay: floorPay,
      cap: cap,
      daily: daily,
      applied: applied,
      days: days,
      total: daily * days,
      monthly: daily * 30,
      insMonths: insMonthsTotal,
      senior: (age >= 50) || !!o.disabled
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. 화면 (DOM)
   * ------------------------------------------------------------------ */

  var lastResults = {};

  function $(id) { return document.getElementById(id); }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function setHTML(id, html) {
    var el = $(id);
    if (el) el.innerHTML = html;
  }

  function setBadge(id, text, tone) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'badge ' + (tone || 'badge-neutral');
  }

  function radioValue(name, fallback) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : fallback;
  }

  function checkValue(id) {
    var el = $(id);
    return !!(el && el.checked);
  }

  function val(id, fallback) {
    var el = $(id);
    return el ? toNum(el.value, fallback) : fallback;
  }

  function dateVal(id) {
    var el = $(id);
    return el && el.value ? el.value : '';
  }

  function renderChildbirth() {
    var r = calcChildbirth({
      order: radioValue('cb-order', '1'),
      region: radioValue('cb-region', 'metro'),
      voucher: checkValue('cb-voucher'),
      care: radioValue('cb-care', 'home'),
      wageA: val('cb-wage-a', 3000000),
      wageB: val('cb-wage-b', 3000000),
      leaveType: radioValue('cb-leave-type', 'together'),
      monthsA: val('cb-months-a', 6),
      monthsB: val('cb-months-b', 6)
    });
    lastResults.childbirth = r;

    setText('cb-total', comma(r.cashTotal) + '원');
    setText('cb-total-ko', manWon(r.cashTotal) + ' · 육아휴직급여 별도');
    setText('cb-first-meet', comma(r.firstMeet) + '원');
    setText('cb-parent-total', comma(r.parentTotal) + '원');
    setText('cb-child-monthly', comma(r.childMonthly) + '원');
    setText('cb-child-total', comma(r.childTotal) + '원');
    setText('cb-parent-0', comma(r.parentMonthly[0]) + '원');
    setText('cb-parent-1', comma(r.parentMonthly[1]) + '원');
    setText('cb-leave-total', comma(r.leaveTotal) + '원');
    setText('cb-leave-a', comma(r.leaveA) + '원');
    setText('cb-leave-b', comma(r.leaveB) + '원');
    setText('cb-grand-total', comma(r.grandTotal) + '원');

    var careTxt = (r.care === 'daycare') ? '어린이집' : '가정양육';
    setBadge('cb-badge', '2026년 기준 · ' + careTxt, 'badge-ok');

    var type = radioValue('cb-leave-type', 'together');
    var note;
    if (type === 'together') {
      note = '부모 함께 육아휴직제(6+6)는 자녀 생후 18개월 이내에 부모가 모두 육아휴직을 쓸 때 첫 6개월 상한이 250만~450만원으로 올라갑니다. 두 사람이 함께 쓴 기간을 기준으로 하므로 공통 사용 개월 ' + r.commonMonths + '개월에 특례 상한을 적용했습니다.';
    } else if (type === 'general') {
      note = '일반 육아휴직급여는 1~3개월 통상임금 100%(상한 250만원), 4~6개월 100%(상한 200만원), 7개월 이후 80%(상한 160만원)이고 월 하한은 70만원입니다.';
    } else {
      note = '육아휴직을 쓰지 않는 것으로 계산했습니다. 부모급여·아동수당·첫만남이용권만 합산한 금액입니다.';
    }
    setText('cb-note', note);

    /* 월별 표 */
    var rows = '';
    if (type !== 'none') {
      var mA = clamp(val('cb-months-a', 6), 0, 18);
      var mB = clamp(val('cb-months-b', 6), 0, 18);
      var n = Math.max(mA, mB);
      for (var i = 1; i <= n; i++) {
        var a = i <= mA ? comma(leavePayMonth(val('cb-wage-a', 3000000), i, (type === 'together' && i <= r.commonMonths) ? 'together' : 'general')) + '원' : '—';
        var b = i <= mB ? comma(leavePayMonth(val('cb-wage-b', 3000000), i, (type === 'together' && i <= r.commonMonths) ? 'together' : 'general')) + '원' : '—';
        rows += '<tr><td>' + i + '개월</td><td class="num">' + a + '</td><td class="num">' + b + '</td></tr>';
      }
    }
    setHTML('cb-leave-rows', rows);

    /* 2027 미리보기 */
    var p = preview2027({
      order: radioValue('cb-order', '1'),
      pref: checkValue('cb-voucher'),
      care: radioValue('cb-care', 'home')
    });
    setText('cb-27-grant', manWon(p.grant));
    setText('cb-27-monthly', manWon(p.monthly));
    setText('cb-27-total', manWon(p.total24));
    setText('cb-27-diff', (p.total24 - r.cashTotal >= 0 ? '+' : '−') + manWon(Math.abs(p.total24 - r.cashTotal)));
  }

  function renderSeverance() {
    var r = calcSeverance({
      hire: dateVal('sv-hire'),
      last: dateVal('sv-last'),
      base: val('sv-base', 0),
      fixed: val('sv-fixed', 0),
      variable: val('sv-variable', 0),
      bonus: val('sv-bonus', 0),
      leavePay: val('sv-leave-pay', 0),
      ordinary: val('sv-ordinary', 0),
      weeklyHours: val('sv-hours', 40),
      unusedDays: val('sv-days', 0)
    });
    lastResults.severance = r;

    setText('sv-total', comma(r.total) + '원');
    setText('sv-total-ko', manWon(r.total) + ' (퇴직금 + 연차수당)');
    setText('sv-severance', comma(r.severance) + '원');
    setText('sv-leave-allowance', comma(r.leaveAllowance) + '원');
    setText('sv-day-avg', comma(r.dayAvg) + '원');
    setText('sv-day-ordinary', comma(r.dailyOrdinary) + '원');
    setText('sv-applied', comma(r.applied) + '원');
    setText('sv-service', comma(r.serviceDays) + '일');
    setText('sv-service-years', r.serviceYears + '년 ' + (r.serviceMonths % 12) + '개월');
    setText('sv-months3', r.months3 + '일');
    setText('sv-accrued', r.accruedDays + '일');
    setText('sv-accrued-2', r.accruedDays + '일');
    setText('sv-monthly-hours', r.monthlyHours);
    setText('sv-basis', r.basis + ' 기준');

    if (!r.eligible) {
      setBadge('sv-badge', '1년 미만 · 퇴직금 대상 아님', 'badge-warn');
    } else if (r.basis === '통상임금') {
      setBadge('sv-badge', '통상임금이 더 높아 통상임금 적용', 'badge-neutral');
    } else {
      setBadge('sv-badge', '평균임금 기준 산정', 'badge-ok');
    }

    var rows = ''
      + '<tr><td>퇴직 전 3개월 임금</td><td class="num">' + comma(r.wage3m) + '원</td></tr>'
      + '<tr><td>+ 정기 상여금 × 3/12</td><td class="num">' + comma(r.bonusPart) + '원</td></tr>'
      + '<tr><td>+ 연차수당 × 3/12</td><td class="num">' + comma(r.leavePart) + '원</td></tr>'
      + '<tr><td>= 산정 임금총액</td><td class="num">' + comma(r.avgSum) + '원</td></tr>'
      + '<tr><td>÷ 3개월 총일수</td><td class="num">' + r.months3 + '일</td></tr>'
      + '<tr class="is-total"><td>1일 평균임금</td><td class="num">' + comma(r.dayAvg) + '원</td></tr>';
    setHTML('sv-rows', rows);
  }

  function renderUnemployment() {
    var r = calcUnemployment({
      age: val('ui-age', 0),
      disabled: checkValue('ui-disabled'),
      insYears: val('ui-years', 0),
      insMonths: val('ui-months', 0),
      wage3m: val('ui-wage3m', 0),
      days3m: val('ui-days3m', 91),
      hours: val('ui-hours', 8)
    });
    lastResults.unemployment = r;

    setText('ui-total', comma(r.total) + '원');
    setText('ui-total-ko', manWon(r.total) + ' · ' + r.days + '일 기준');
    setText('ui-daily', comma(r.daily) + '원');
    setText('ui-daily-2', comma(r.daily) + '원');
    setText('ui-daily-3', comma(r.daily) + '원');
    setText('ui-monthly', comma(r.monthly) + '원');
    setText('ui-base', comma(r.baseDaily) + '원');
    setText('ui-raw60', comma(r.raw60) + '원');
    setText('ui-floor', comma(r.floorPay) + '원');
    setText('ui-cap', comma(r.cap) + '원');
    setText('ui-days', r.days + '일');
    setText('ui-ins', r.insMonths + '개월');
    setText('ui-applied', r.applied);

    setBadge('ui-badge', r.applied + ' 적용', 'badge-ok');

    var msg;
    if (r.applied === '상한액') {
      msg = '계산된 1일 급여가 상한액을 넘어 상한액 68,100원을 적용했습니다. 2026년에는 월급(세전)이 약 340만원을 넘으면 상한에 걸리는 경우가 많습니다.';
    } else if (r.applied === '하한액') {
      msg = '계산된 1일 급여가 하한액보다 낮아 하한액을 적용했습니다. 하한액은 2026년 최저임금 10,320원 × 80% × 1일 소정근로시간(' + val('ui-hours', 8) + '시간)입니다.';
    } else {
      msg = '계산된 1일 급여가 상·하한 사이에 있어 평균임금의 60%가 그대로 적용됩니다.';
    }
    setText('ui-note', msg);
  }

  function renderAll() {
    renderChildbirth();
    renderSeverance();
    renderUnemployment();
  }

  /* ---------- 탭 ---------- */

  function activateTab(key) {
    var tabs = document.querySelectorAll('[data-tab]');
    var i;
    for (i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var on = (t.getAttribute('data-tab') === key);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      if (t.classList) {
        if (on) t.classList.add('is-active'); else t.classList.remove('is-active');
      }
    }
    var panels = document.querySelectorAll('[data-panel]');
    for (i = 0; i < panels.length; i++) {
      var p = panels[i];
      p.hidden = (p.getAttribute('data-panel') !== key);
    }
  }

  function init() {
    var tabs = document.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          activateTab(tab.getAttribute('data-tab'));
          var isLink = (tab.tagName === 'A' || tab.getAttribute('href'));
          if (isLink) {
            var target = $( 'calculators' );
            if (target && target.scrollIntoView) {
              try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
            }
          }
        });
      })(tabs[i]);
    }

    var forms = ['cb-form', 'sv-form', 'ui-form'];
    for (var f = 0; f < forms.length; f++) {
      var form = $(forms[f]);
      if (!form || !form.addEventListener) continue;
      form.addEventListener('input', renderAll);
      form.addEventListener('change', renderAll);
    }

    var chips = document.querySelectorAll('.chip[data-set]');
    for (var c = 0; c < chips.length; c++) {
      (function (chip) {
        chip.addEventListener('click', function () {
          var raw = chip.getAttribute('data-set');
          if (!raw) return;
          var obj;
          try { obj = JSON.parse(raw); } catch (e) { return; }
          Object.keys(obj).forEach(function (k) {
            var el = $(k);
            if (el) el.value = obj[k];
          });
          renderAll();
        });
      })(chips[c]);
    }

    var copies = document.querySelectorAll('[data-copy]');
    for (var k = 0; k < copies.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-copy');
          var res = lastResults[key];
          if (!res) return;
          var lines = [];
          if (key === 'childbirth') {
            lines.push('[2026 출산·육아 지원금]');
            lines.push('첫만남이용권: ' + comma(res.firstMeet) + '원');
            lines.push('부모급여 24개월: ' + comma(res.parentTotal) + '원');
            lines.push('아동수당 24개월: ' + comma(res.childTotal) + '원');
            lines.push('현금성 합계: ' + comma(res.cashTotal) + '원');
            lines.push('육아휴직급여: ' + comma(res.leaveTotal) + '원');
          } else if (key === 'severance') {
            lines.push('[퇴직금·연차수당]');
            lines.push('재직일수: ' + res.serviceDays + '일');
            lines.push('1일 평균임금: ' + comma(res.dayAvg) + '원');
            lines.push('퇴직금: ' + comma(res.severance) + '원');
            lines.push('연차수당: ' + comma(res.leaveAllowance) + '원');
          } else {
            lines.push('[실업급여]');
            lines.push('1일 구직급여: ' + comma(res.daily) + '원');
            lines.push('소정급여일수: ' + res.days + '일');
            lines.push('총 예상액: ' + comma(res.total) + '원');
          }
          lines.push('— 생활 계산소');
          var text = lines.join('\n');
          if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
              var p = navigator.clipboard.writeText(text);
              if (p && p.catch) p.catch(function () {});
            } catch (e) { /* 클립보드 권한이 없으면 조용히 넘어간다 */ }
          } else if (document.createElement) {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            if (document.execCommand) document.execCommand('copy');
            document.body.removeChild(ta);
          }
          var old = btn.textContent;
          btn.textContent = '복사됨';
          setTimeout(function () { btn.textContent = old; }, 1400);
        });
      })(copies[k]);
    }

    var hash = (global.location && global.location.hash || '').replace('#', '');
    if (hash === 'severance' || hash === 'unemployment' || hash === 'childbirth') activateTab(hash);

    renderAll();
  }

  /* ------------------------------------------------------------------ *
   * 6. 노출
   * ------------------------------------------------------------------ */

  global.LHC = {
    C: C,
    comma: comma,
    koWon: koWon,
    manWon: manWon,
    firstMeetAmount: firstMeetAmount,
    childAllowanceMonthly: childAllowanceMonthly,
    parentBenefitMonthly: parentBenefitMonthly,
    parentBenefitTotal: parentBenefitTotal,
    leavePayMonth: leavePayMonth,
    leavePayTotal: leavePayTotal,
    leavePayMixed: leavePayMixed,
    calcChildbirth: calcChildbirth,
    preview2027: preview2027,
    serviceDays: serviceDays,
    last3MonthsDays: last3MonthsDays,
    serviceBreakdown: serviceBreakdown,
    monthlyHours: monthlyHours,
    dailyOrdinaryWage: dailyOrdinaryWage,
    accruedLeaveDays: accruedLeaveDays,
    calcSeverance: calcSeverance,
    benefitDays: benefitDays,
    calcUnemployment: calcUnemployment,
    renderAll: renderAll,
    activateTab: activateTab,
    init: init
  };

  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    init();
  } else if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', init);
  }
})(typeof window !== 'undefined' ? window : globalThis);
