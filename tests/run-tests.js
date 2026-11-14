/* 계산 엔진 자동 검증 (QuickJS · 브라우저 공용)
   실행: python3 tests/run.py  또는 브라우저에서 tests/test.html
   모든 기대값은 법령·고시 원문과 고용노동부 계산 예제로 확인한 값입니다. */
(function () {
  var log = (typeof console !== 'undefined' && console.log) ? console.log : print;
  var L = (typeof window !== 'undefined' ? window : globalThis).LHC;
  if (!L) {
    log('FAIL: LHC 를 찾을 수 없습니다. app.js 를 먼저 실행하세요.');
    return;
  }

  var pass = 0, fail = 0, failures = [];
  var results = [];

  function check(name, actual, expected, tol) {
    var ok;
    if (typeof expected === 'number' && typeof actual === 'number') {
      if (tol !== undefined) ok = Math.abs(actual - expected) <= Math.abs(expected) * tol;
      else ok = Math.abs(actual - expected) < 1e-6;
    } else {
      ok = actual === expected;
    }
    if (ok) pass++;
    else {
      fail++;
      failures.push(name + ' | 기대 ' + expected + ' / 실제 ' + actual);
    }
    results.push({ name: name, actual: actual, expected: expected, ok: ok });
    return ok;
  }

  /* ---------------- 0. 표기 유틸 ---------------- */
  check('comma(0)', L.comma(0), '0');
  check('comma(1234567)', L.comma(1234567), '1,234,567');
  check('koWon(56,400,000)', L.koWon(56400000), '5,640만원');
  check('koWon(102,500,000)', L.koWon(102500000), '1억 250만원');
  check('koWon(21,600,000)', L.koWon(21600000), '2,160만원');
  check('manWon(22,400,000)', L.manWon(22400000), '2,240만원');
  check('manWon(500,000)', L.manWon(500000), '50만원');

  /* ---------------- 1. 첫만남이용권 ---------------- */
  check('첫만남 첫째', L.firstMeetAmount(1), 2000000);
  check('첫만남 둘째', L.firstMeetAmount(2), 3000000);
  check('첫만남 셋째', L.firstMeetAmount(3), 3000000);
  check('첫만남 범위 밖(5) → 300만', L.firstMeetAmount(5), 3000000);
  check('첫만남 문자열 "2"', L.firstMeetAmount('2'), 3000000);

  /* ---------------- 2. 아동수당 ---------------- */
  check('아동수당 수도권', L.childAllowanceMonthly('metro', false), 100000);
  check('아동수당 비수도권', L.childAllowanceMonthly('nonmetro', false), 105000);
  check('아동수당 인구감소 우대', L.childAllowanceMonthly('depopPref', false), 110000);
  check('아동수당 인구감소 특별', L.childAllowanceMonthly('depopSpec', false), 120000);
  check('아동수당 특별+상품권', L.childAllowanceMonthly('depopSpec', true), 130000);
  check('아동수당 우대+상품권', L.childAllowanceMonthly('depopPref', true), 120000);
  check('아동수당 수도권+상품권(가산 없음)', L.childAllowanceMonthly('metro', true), 100000);
  check('아동수당 알 수 없는 지역 → 수도권', L.childAllowanceMonthly('x', false), 100000);

  /* ---------------- 3. 부모급여 ---------------- */
  check('부모급여 0세 가정양육', L.parentBenefitMonthly(0, 'home'), 1000000);
  check('부모급여 1세 가정양육', L.parentBenefitMonthly(1, 'home'), 500000);
  check('부모급여 0세 어린이집 차액', L.parentBenefitMonthly(0, 'daycare'), 416000);
  check('부모급여 1세 어린이집 차액', L.parentBenefitMonthly(1, 'daycare'), 0);
  check('부모급여 24개월 가정양육', L.parentBenefitTotal('home'), 18000000);
  check('부모급여 24개월 어린이집', L.parentBenefitTotal('daycare'), 4992000);

  /* ---------------- 4. 육아휴직급여 ---------------- */
  check('일반 1개월 상한 250만', L.leavePayMonth(3000000, 1, 'general'), 2500000);
  check('일반 3개월 상한 250만', L.leavePayMonth(3000000, 3, 'general'), 2500000);
  check('일반 4개월 상한 200만', L.leavePayMonth(3000000, 4, 'general'), 2000000);
  check('일반 6개월 상한 200만', L.leavePayMonth(3000000, 6, 'general'), 2000000);
  check('일반 7개월 80%·상한 160만', L.leavePayMonth(3000000, 7, 'general'), 1600000);
  check('일반 12개월도 160만', L.leavePayMonth(3000000, 12, 'general'), 1600000);
  check('통상임금 200만 · 7개월 80%', L.leavePayMonth(2000000, 7, 'general'), 1600000);
  check('통상임금 150만 · 7개월 80%', L.leavePayMonth(1500000, 7, 'general'), 1200000);
  check('통상임금 60만 → 하한 70만', L.leavePayMonth(600000, 1, 'general'), 700000);
  check('6+6 1개월 상한 250만', L.leavePayMonth(3000000, 1, 'together'), 2500000);
  check('6+6 3개월 상한 300만', L.leavePayMonth(3000000, 3, 'together'), 3000000);
  check('6+6 5개월 상한 400만', L.leavePayMonth(3000000, 5, 'together'), 3000000);
  check('6+6 6개월 상한 450만', L.leavePayMonth(5000000, 6, 'together'), 4500000);
  check('6+6 7개월은 일반 160만', L.leavePayMonth(5000000, 7, 'together'), 1600000);

  check('일반 12개월 합계 2,310만', L.leavePayTotal(3000000, 12, 'general'), 23100000);
  check('일반 12개월 200만 → 2,160만', L.leavePayTotal(2000000, 12, 'general'), 21600000);
  check('일반 12개월 하한만 → 840만', L.leavePayTotal(600000, 12, 'general'), 8400000);
  check('일반 0개월 → 0', L.leavePayTotal(3000000, 0, 'general'), 0);
  check('일반 18개월 상한', L.leavePayTotal(3000000, 20, 'general'), 32700000);
  check('6+6 6개월 300만 → 1,700만', L.leavePayTotal(3000000, 6, 'together'), 17000000);
  check('6+6 6개월 500만 → 2,000만', L.leavePayTotal(5000000, 6, 'together'), 20000000);
  check('6+6 6개월 + 일반 6개월', L.leavePayMixed(5000000, 12, 6), 29600000);
  check('특례 0개월 = 일반 12개월', L.leavePayMixed(3000000, 12, 0), 23100000);

  /* ---------------- 5. 통합 계산 ---------------- */
  var c1 = L.calcChildbirth({
    order: 1, region: 'metro', care: 'home',
    wageA: 3000000, wageB: 3000000, leaveType: 'together', monthsA: 6, monthsB: 6
  });
  check('기본 첫만남 200만', c1.firstMeet, 2000000);
  check('기본 부모급여 1,800만', c1.parentTotal, 18000000);
  check('기본 아동수당 240만', c1.childTotal, 2400000);
  check('기본 현금 합계 2,240만', c1.cashTotal, 22400000);
  check('기본 공통 사용 6개월', c1.commonMonths, 6);
  check('기본 본인 육아휴직 1,700만', c1.leaveA, 17000000);
  check('기본 배우자 육아휴직 1,700만', c1.leaveB, 17000000);
  check('기본 육아휴직 합계 3,400만', c1.leaveTotal, 34000000);
  check('기본 총합 5,640만', c1.grandTotal, 56400000);

  var c2 = L.calcChildbirth({ order: 2, region: 'nonmetro', care: 'daycare', leaveType: 'none' });
  check('둘째 첫만남 300만', c2.firstMeet, 3000000);
  check('어린이집 부모급여 499.2만', c2.parentTotal, 4992000);
  check('비수도권 아동수당 252만', c2.childTotal, 2520000);
  check('둘째·어린이집 현금 1,051.2만', c2.cashTotal, 10512000);
  check('육아휴직 미사용 → 0', c2.leaveTotal, 0);
  check('미사용 시 총합 = 현금', c2.grandTotal, 10512000);

  var c3 = L.calcChildbirth({
    order: 1, region: 'depopSpec', voucher: true, care: 'home',
    wageA: 5000000, wageB: 3000000, leaveType: 'general', monthsA: 12, monthsB: 0
  });
  check('특별+상품권 아동수당 월 13만', c3.childMonthly, 130000);
  check('특별+상품권 24개월 312만', c3.childTotal, 3120000);
  check('일반 12개월 본인 2,310만', c3.leaveA, 23100000);
  check('배우자 미사용 0', c3.leaveB, 0);
  check('일반형 공통 사용 0', c3.commonMonths, 0);

  var c4 = L.calcChildbirth({
    order: 3, region: 'metro', care: 'home',
    wageA: 3000000, wageB: 3000000, leaveType: 'together', monthsA: 12, monthsB: 6
  });
  check('12+6개월 공통 6개월', c4.commonMonths, 6);
  check('본인 12개월 = 6+6 + 일반 6', c4.leaveA, 26600000);
  check('배우자 6개월 1,700만', c4.leaveB, 17000000);

  /* ---------------- 6. 2027 개편안 미리보기 ---------------- */
  var p1 = L.preview2027({ order: 1, pref: false, care: 'home' });
  check('2027 첫째 아이맞이 1,000만', p1.grant, 10000000);
  check('2027 아동기본수당 50만(가정보육)', p1.monthly, 500000);
  check('2027 24개월 2,200만', p1.total24, 22000000);
  var p2 = L.preview2027({ order: 3, pref: true, care: 'home' });
  check('2027 셋째 우대 아이맞이 2,000만', p2.grant, 20000000);
  check('2027 우대 가정보육 월 60만', p2.monthly, 600000);
  check('2027 셋째 우대 24개월 3,440만', p2.total24, 34400000);
  var p3 = L.preview2027({ order: 2, pref: false, care: 'daycare' });
  check('2027 어린이집 월 20만', p3.monthly, 200000);
  check('2027 둘째 어린이집 24개월 1,680만', p3.total24, 16800000);

  /* ---------------- 7. 근속·기간 ---------------- */
  function d(y, m, dd) {
    var s = '' + y + '-' + (m < 10 ? '0' + m : m) + '-' + (dd < 10 ? '0' + dd : dd);
    return s;
  }
  check('재직일수 2014-10-02~2017-09-15', L.serviceDays({ y: 2014, m: 10, d: 2 }, { y: 2017, m: 9, d: 15 }), 1080);
  check('3개월 총일수 2017-09-15', L.last3MonthsDays({ y: 2017, m: 9, d: 15 }), 92);
  check('3개월 총일수 2026-11-14', L.last3MonthsDays({ y: 2026, m: 11, d: 14 }), 92);
  check('3개월 총일수 2026-03-01(윤년)', L.last3MonthsDays({ y: 2026, m: 3, d: 1 }), 90);
  check('3개월 총일수 2026-05-31(말일 보정)', L.last3MonthsDays({ y: 2026, m: 5, d: 31 }), 92);

  var sb = L.serviceBreakdown({ y: 2019, m: 3, d: 4 }, { y: 2026, m: 11, d: 14 });
  check('근속 개월 92', sb.months, 92);
  check('근속 연수 7', sb.years, 7);
  check('근속 일수 2,813', sb.days, 2813);

  check('월 소정근로시간 40h → 209', L.monthlyHours(40), 209);
  check('월 소정근로시간 35h → 183', L.monthlyHours(35), 183);
  check('월 소정근로시간 20h → 104', L.monthlyHours(20), 104);
  check('1일 통상임금 300만', L.dailyOrdinaryWage(3000000, 40), 114832);
  check('1일 통상임금 200만', L.dailyOrdinaryWage(2000000, 40), 76555);

  /* ---------------- 8. 연차 발생일수 ---------------- */
  check('연차 6개월 → 6일', L.accruedLeaveDays(6, 0), 6);
  check('연차 11개월 → 11일', L.accruedLeaveDays(11, 0), 11);
  check('연차 1년 → 15일', L.accruedLeaveDays(12, 1), 15);
  check('연차 2년 → 15일', L.accruedLeaveDays(24, 2), 15);
  check('연차 3년 → 16일', L.accruedLeaveDays(36, 3), 16);
  check('연차 5년 → 17일', L.accruedLeaveDays(60, 5), 17);
  check('연차 10년 → 19일', L.accruedLeaveDays(120, 10), 19);
  check('연차 20년 → 24일', L.accruedLeaveDays(240, 20), 24);
  check('연차 25년 → 25일 상한', L.accruedLeaveDays(300, 25), 25);

  /* ---------------- 9. 퇴직금 ---------------- */
  var s1 = L.calcSeverance({
    hire: '2014-10-02', last: '2017-09-15',
    base: 2000000, fixed: 360000, variable: 0,
    bonus: 4000000, leavePay: 300000, ordinary: 1567500, weeklyHours: 40, unusedDays: 5
  });
  check('예제 재직일수 1,080', s1.serviceDays, 1080);
  check('예제 3개월 임금 708만', s1.wage3m, 7080000);
  check('예제 상여 3/12 = 100만', s1.bonusPart, 1000000);
  check('예제 연차수당 3/12 = 7.5만', s1.leavePart, 75000);
  check('예제 1일 평균임금 88,641', s1.dayAvg, 88641);
  check('예제 1일 통상임금 60,000', s1.dailyOrdinary, 60000);
  check('예제 적용 임금 88,641', s1.applied, 88641);
  check('예제 퇴직금 7,868,407', s1.severance, 7868407);
  check('예제 연차수당 30만', s1.leaveAllowance, 300000);
  check('예제 합계 8,168,407', s1.total, 8168407);
  check('예제 평균임금 기준', s1.basis, '평균임금');

  var s2 = L.calcSeverance({
    hire: '2019-03-04', last: '2026-11-14',
    base: 2500000, fixed: 400000, variable: 0,
    bonus: 3000000, leavePay: 0, ordinary: 2900000, weeklyHours: 40, unusedDays: 8
  });
  check('기본 재직일수 2,813', s2.serviceDays, 2813);
  check('기본 3개월 임금 870만', s2.wage3m, 8700000);
  check('기본 1일 평균임금 102,717', s2.dayAvg, 102717);
  check('기본 1일 통상임금 111,004', s2.dailyOrdinary, 111004);
  check('기본 통상임금이 더 높음', s2.basis, '통상임금');
  check('기본 퇴직금 25,664,733', s2.severance, 25664733);
  check('기본 연차수당 888,032', s2.leaveAllowance, 888032);
  check('기본 합계 26,552,765', s2.total, 26552765);
  check('기본 근속 7년 8개월', s2.serviceMonths, 92);
  check('기본 연차 발생 18일', s2.accruedDays, 18);

  var s3 = L.calcSeverance({
    hire: '2026-05-01', last: '2026-11-14',
    base: 2500000, fixed: 0, variable: 0,
    bonus: 0, leavePay: 0, ordinary: 2500000, weeklyHours: 40, unusedDays: 2
  });
  check('1년 미만 재직일수', s3.serviceDays, 198);
  check('1년 미만 퇴직금 0', s3.severance, 0);
  check('1년 미만 대상 아님', s3.eligible, false);
  check('1년 미만 연차 6일', s3.accruedDays, 6);
  check('1년 미만 연차수당만 지급', s3.total, 191386);

  var s4 = L.calcSeverance({
    hire: '2020-01-01', last: '2024-01-01',
    base: 2000000, fixed: 0, variable: 0,
    bonus: 0, leavePay: 1200000, ordinary: 2000000, weeklyHours: 40, unusedDays: 0
  });
  check('연차수당 3/12 = 30만', s4.leavePart, 300000);
  check('4년 재직일수', s4.serviceDays, 1462);
  check('4년 퇴직금', s4.severance, 9199184);

  var s5 = L.calcSeverance({ hire: '', last: '' });
  check('날짜 없으면 재직일수 0', s5.serviceDays, 0);
  check('날짜 없으면 퇴직금 0', s5.severance, 0);

  /* ---------------- 10. 소정급여일수 ---------------- */
  check('50세 미만 1년 미만 → 120', L.benefitDays(38, 11, false), 120);
  check('50세 미만 1~3년 → 150', L.benefitDays(38, 24, false), 150);
  check('50세 미만 3~5년 → 180', L.benefitDays(38, 48, false), 180);
  check('50세 미만 5~10년 → 210', L.benefitDays(38, 60, false), 210);
  check('50세 미만 10년 이상 → 240', L.benefitDays(38, 121, false), 240);
  check('50세 이상 1~3년 → 180', L.benefitDays(55, 24, false), 180);
  check('50세 이상 3~5년 → 210', L.benefitDays(55, 48, false), 210);
  check('50세 이상 5~10년 → 240', L.benefitDays(55, 60, false), 240);
  check('50세 이상 10년 이상 → 270', L.benefitDays(55, 132, false), 270);
  check('만 50세 정확히 → 장년', L.benefitDays(50, 48, false), 210);
  check('장애인 30세 4년 → 210', L.benefitDays(30, 48, true), 210);
  check('장애인 10년 이상 → 270', L.benefitDays(30, 120, true), 270);

  /* ---------------- 11. 실업급여 ---------------- */
  var u1 = L.calcUnemployment({ age: 38, insYears: 4, insMonths: 0, wage3m: 12000000, days3m: 91, hours: 8 });
  check('기초일액 131,868', u1.baseDaily, 131868);
  check('60% 79,120', u1.raw60, 79120);
  check('하한 66,048', u1.floorPay, 66048);
  check('상한 68,100', u1.cap, 68100);
  check('상한 적용', u1.applied, '상한액');
  check('1일 68,100', u1.daily, 68100);
  check('소정급여 180일', u1.days, 180);
  check('총액 12,258,000', u1.total, 12258000);
  check('월 환산 2,043,000', u1.monthly, 2043000);

  var u2 = L.calcUnemployment({ age: 55, insYears: 4, insMonths: 0, wage3m: 12000000, days3m: 91, hours: 8 });
  check('55세 210일', u2.days, 210);
  check('55세 총액 14,301,000', u2.total, 14301000);

  var u3 = L.calcUnemployment({ age: 30, insYears: 2, insMonths: 0, wage3m: 9000000, days3m: 91, hours: 8 });
  check('저소득 하한 적용', u3.applied, '하한액');
  check('저소득 1일 66,048', u3.daily, 66048);
  check('저소득 150일 총액', u3.total, 9907200);

  var u4 = L.calcUnemployment({ age: 40, insYears: 1, insMonths: 0, wage3m: 10100000, days3m: 91, hours: 8 });
  check('중간 구간 60% 적용', u4.applied, '평균임금 60%');
  check('중간 구간 1일 66,593', u4.daily, 66593);
  check('중간 구간 150일 총액', u4.total, 9988950);
  check('중간 구간 150일', u4.days, 150);

  var u5 = L.calcUnemployment({ age: 40, insYears: 4, insMonths: 0, wage3m: 12000000, days3m: 91, hours: 4 });
  check('4시간 하한 33,024', u5.floorPay, 33024);
  check('4시간이어도 상한 적용', u5.daily, 68100);

  var u6 = L.calcUnemployment({ age: 45, insYears: 6, insMonths: 3, wage3m: 12000000, days3m: 92, hours: 8 });
  check('6년 3개월 → 75개월', u6.insMonths, 75);
  check('6년 3개월 → 210일', u6.days, 210);

  /* ---------------- 결과 ---------------- */
  if (fail && failures.length) {
    log('');
    failures.forEach(function (f) { log('  FAIL ' + f); });
  }
  log('');
  log('=== 계산 엔진: PASS ' + pass + ' / FAIL ' + fail + ' (총 ' + (pass + fail) + ') ===');
  if (typeof globalThis !== 'undefined') {
    globalThis.__RESULT = { pass: pass, fail: fail, results: results };
  }
})();
