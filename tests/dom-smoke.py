#!/usr/bin/env python3
"""UI 렌더링 스모크 테스트.

브라우저가 없는 환경에서 index.html 의 실제 input 기본값을 그대로 재현한
최소 DOM 스텁을 만들고, app.js 의 init() 을 실행해 세 계산기의 결과가
기대값으로 렌더링되는지 확인합니다.

사용법: python3 tests/dom-smoke.py
"""
import json
import pathlib
import sys
from html.parser import HTMLParser

try:
    import quickjs
except ImportError:
    sys.exit("quickjs 가 필요합니다: pip install quickjs")

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
app_js = (ROOT / "app.js").read_text(encoding="utf-8")


class Collector(HTMLParser):
    """index.html 의 요소를 (tag, attrs) 로 수집."""

    def __init__(self):
        super().__init__()
        self.items = []

    def handle_starttag(self, tag, attrs):
        self.items.append((tag, dict(attrs)))

    def handle_startendtag(self, tag, attrs):
        self.items.append((tag, dict(attrs)))


c = Collector()
c.feed(html)

ids = {}
elements = []
for tag, a in c.items:
    clean = {k: v for k, v in a.items() if v is not None}
    elements.append({"tag": tag, **clean})
    if "id" in clean:
        el = {"tag": tag}
        if clean.get("value") is not None:
            el["value"] = clean["value"]
        if "checked" in clean:
            el["checked"] = True
        if clean.get("type") == "date":
            el["value"] = clean.get("value") or ""
        if clean.get("type") == "checkbox" and "checked" not in clean:
            el["checked"] = False
        ids[clean["id"]] = el

elements_json = json.dumps(elements)
ids_json = json.dumps(ids)

stub = r"""
(function () {
  var ELEMENTS = __ELEMENTS__;
  var IDS = __IDS__;

  function matches(el, selector) {
    var m = selector.match(/^([a-zA-Z]*)(?:\[([\w-]+)(?:="([^"]*)")?\])?(:[\w-]+)?$/);
    if (!m) return false;
    var tag = m[1], attr = m[2], val = m[3], pseudo = m[4];
    if (tag && el.tag !== tag) return false;
    if (attr) {
      if (!(attr in el)) return false;
      if (val !== undefined && String(el[attr]) !== val) return false;
    }
    if (pseudo === ':checked' && el.checked !== true) return false;
    return true;
  }

  function selectAll(selector) {
    var parts = selector.split(',').map(function (s) { return s.trim(); });
    var out = [];
    parts.forEach(function (sel) {
      ELEMENTS.forEach(function (el) {
        if (matches(el, sel) && out.indexOf(el) < 0) out.push(el);
      });
    });
    return out;
  }

  function makeNode(id) {
    var spec = IDS[id] || { tag: 'div' };
    var node = {
      id: id,
      tagName: (spec.tag || 'div').toUpperCase(),
      value: spec.value !== undefined ? spec.value : '',
      checked: !!spec.checked,
      textContent: '',
      innerHTML: '',
      hidden: false,
      className: '',
      style: {},
      tabIndex: 0,
      attrs: {},
      _listeners: {},
      classList: {
        add: function (c) {
          if (node.className.split(' ').indexOf(c) < 0) node.className = (node.className + ' ' + c).trim();
        },
        remove: function (c) {
          node.className = node.className.split(' ').filter(function (x) { return x !== c; }).join(' ');
        },
        toggle: function (c, on) { if (on) this.add(c); else this.remove(c); },
        contains: function (c) { return node.className.split(' ').indexOf(c) >= 0; }
      },
      addEventListener: function (ev, fn) {
        (node._listeners[ev] = node._listeners[ev] || []).push(fn);
      },
      setAttribute: function (k, v) { node.attrs[k] = v; },
      getAttribute: function (k) { return node.attrs[k] !== undefined ? node.attrs[k] : null; },
      focus: function () {},
      querySelectorAll: function () { return []; },
      appendChild: function () {},
      removeChild: function () {}
    };
    return node;
  }

  var BY_ID = {};
  Object.keys(IDS).forEach(function (id) { BY_ID[id] = makeNode(id); });

  var CHIPS = [];
  var TABS = [];
  var PANELS = [];
  var COPIES = [];
  var RADIOS = {};

  ELEMENTS.forEach(function (spec) {
    var node = spec.id && BY_ID[spec.id] ? BY_ID[spec.id] : makeNode(spec.id || ('anon-' + Math.random()));
    Object.keys(spec).forEach(function (k) {
      if (k === 'tag') return;
      if (k === 'data-set' || k === 'data-tab' || k === 'data-panel' || k === 'data-copy') node.attrs[k] = spec[k];
      if (k === 'value') { node.value = spec.value; node.attrs.value = spec.value; }
      if (k === 'checked') node.checked = true;
      if (k === 'name') node.attrs.name = spec.name;
      if (k === 'type') node.attrs.type = spec.type;
      if (k === 'role') node.attrs.role = spec.role;
    });
    if (spec['data-set']) CHIPS.push(node);
    if (spec['data-tab']) TABS.push(node);
    if (spec['data-panel']) PANELS.push(node);
    if (spec['data-copy']) COPIES.push(node);
    if (spec.tag === 'input' && spec.name) {
      RADIOS[spec.name] = RADIOS[spec.name] || [];
      RADIOS[spec.name].push(node);
    }
  });

  var document = {
    readyState: 'complete',
    getElementById: function (id) { return BY_ID[id] || NULL_NODE; },
    querySelector: function (sel) {
      if (sel.indexOf('input[name=') >= 0 && sel.indexOf(':checked') >= 0) {
        var name = sel.match(/name="([^"]+)"/)[1];
        var list = RADIOS[name] || [];
        var picked = list.filter(function (n) { return n.checked; });
        if (!picked.length && list.length) { list[0].checked = true; picked = [list[0]]; }
        return picked.length ? picked[0] : null;
      }
      var r = selectAll(sel);
      return r.length ? r[0] : null;
    },
    querySelectorAll: function (sel) {
      if (sel === '[data-tab]') return TABS;
      if (sel === '[data-panel]') return PANELS;
      if (sel.indexOf('[data-set]') >= 0) return CHIPS;
      if (sel.indexOf('[data-copy]') >= 0) return COPIES;
      if (sel.indexOf('input[name=') >= 0 && sel.indexOf(':checked') >= 0) {
        var name = sel.match(/name="([^"]+)"/)[1];
        var list = RADIOS[name] || [];
        var picked = list.filter(function (n) { return n.checked; });
        if (!picked.length && list.length) { list[0].checked = true; picked = [list[0]]; }
        return picked.length ? picked[0] : null;
      }
      return [];
    },
    addEventListener: function () {},
    createElement: function () {
      return { style: {}, setAttribute: function () {}, select: function () {}, value: '' };
    },
    body: { appendChild: function () {}, removeChild: function () {} },
    execCommand: function () { return true; },
    title: ''
  };

  var NULL_NODE = { value: '', checked: false, textContent: '', innerHTML: '', style: {}, hidden: false,
    addEventListener: function () {}, classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } },
    setAttribute: function () {}, getAttribute: function () { return null; }, querySelectorAll: function () { return []; } };

  var window = {
    document: document,
    addEventListener: function () {},
    history: { replaceState: function () {} },
    location: { hash: '' },
    navigator: { clipboard: null },
    setTimeout: function () {},
    Date: Date
  };

  globalThis.window = window;
  globalThis.document = document;
  globalThis.history = window.history;
  globalThis.location = window.location;
  globalThis.navigator = window.navigator;
  globalThis.setTimeout = function () {};

  globalThis.__BY_ID = BY_ID;
  globalThis.__TABS = TABS;
  globalThis.__PANELS = PANELS;
  globalThis.__RADIOS = RADIOS;
})();
"""

stub = stub.replace("__ELEMENTS__", elements_json).replace("__IDS__", ids_json)

ctx = quickjs.Context()
ctx.add_callable("__log", lambda s: print(s))
ctx.eval("globalThis.console = { log: function (s) { __log(String(s)); } };")

try:
    ctx.eval(stub)
    ctx.eval(app_js)
except Exception as exc:  # noqa: BLE001
    print("JS 실행 오류:", exc)
    sys.exit(1)


def text(el_id):
    return ctx.eval(f"__BY_ID['{el_id}'].textContent")


def js(expr):
    return ctx.eval(expr)


checks = []
checks.append(("출산·육아 현금 합계", text("cb-total"), "22,400,000원"))
checks.append(("출산·육아 한글 표기", text("cb-total-ko"), "2,240만원 · 육아휴직급여 별도"))
checks.append(("첫만남이용권", text("cb-first-meet"), "2,000,000원"))
checks.append(("부모급여 24개월", text("cb-parent-total"), "18,000,000원"))
checks.append(("아동수당 월액", text("cb-child-monthly"), "100,000원"))
checks.append(("아동수당 24개월", text("cb-child-total"), "2,400,000원"))
checks.append(("본인 육아휴직급여", text("cb-leave-a"), "17,000,000원"))
checks.append(("육아휴직급여 합계", text("cb-leave-total"), "34,000,000원"))
checks.append(("현금+휴직 합계", text("cb-grand-total"), "56,400,000원"))
checks.append(("출산 배지", text("cb-badge"), "2026년 기준 · 가정양육"))
checks.append(("2027 24개월 합계", text("cb-27-total"), "2,200만원"))
checks.append(("2027 비교 차액", text("cb-27-diff"), "−40만원"))

checks.append(("퇴직금 합계", text("sv-total"), "26,552,765원"))
checks.append(("법정 퇴직금", text("sv-severance"), "25,664,733원"))
checks.append(("미사용 연차수당", text("sv-leave-allowance"), "888,032원"))
checks.append(("1일 평균임금", text("sv-day-avg"), "102,717원"))
checks.append(("1일 통상임금", text("sv-day-ordinary"), "111,004원"))
checks.append(("재직일수", text("sv-service"), "2,813일"))
checks.append(("근속 연월", text("sv-service-years"), "7년 8개월"))
checks.append(("3개월 총일수", text("sv-months3"), "92일"))
checks.append(("연차 발생일수", text("sv-accrued"), "18일"))
checks.append(("적용 임금", text("sv-applied"), "111,004원"))
checks.append(("산정 기준", text("sv-basis"), "통상임금 기준"))
checks.append(("퇴직금 배지", text("sv-badge"), "통상임금이 더 높아 통상임금 적용"))

checks.append(("실업급여 총액", text("ui-total"), "12,258,000원"))
checks.append(("1일 구직급여", text("ui-daily"), "68,100원"))
checks.append(("1일 구직급여(중복표기)", text("ui-daily-2"), "68,100원"))
checks.append(("소정급여일수", text("ui-days"), "180일"))
checks.append(("월 환산", text("ui-monthly"), "2,043,000원"))
checks.append(("기초일액", text("ui-base"), "131,868원"))
checks.append(("평균임금 60%", text("ui-raw60"), "79,120원"))
checks.append(("적용 기준", text("ui-applied"), "상한액"))
checks.append(("실업급여 배지", text("ui-badge"), "상한액 적용"))
checks.append(("가입기간 표시", text("ui-ins"), "48개월"))

# 상호작용: 미사용 연차일수를 0일로 바꾸면 연차수당이 0원이 된다
js("__BY_ID['sv-days'].value = '0'; window.LHC.renderAll();")
checks.append(("연차 0일 → 수당 0원", text("sv-leave-allowance"), "0원"))
checks.append(("연차 0일 → 합계는 퇴직금", text("sv-total"), "25,664,733원"))

# 상호작용: 이직 전 3개월 임금을 낮추면 하한액이 적용된다
js("__BY_ID['ui-wage3m'].value = '9000000'; window.LHC.renderAll();")
checks.append(("저소득 → 하한액", text("ui-applied"), "하한액"))
checks.append(("저소득 1일 66,048", text("ui-daily"), "66,048원"))

# 상호작용: 둘째·어린이집으로 바꾸면 부모급여가 차액으로 바뀐다
js("""
(function () {
  var list = __RADIOS['cb-order'] || [];
  list.forEach(function (n) { n.checked = (n.attrs.value === '2' || n.value === '2'); });
  var care = __RADIOS['cb-care'] || [];
  care.forEach(function (n) { n.checked = (n.attrs.value === 'daycare' || n.value === 'daycare'); });
  window.LHC.renderAll();
})();
""")
checks.append(("둘째 첫만남 300만", text("cb-first-meet"), "3,000,000원"))
checks.append(("어린이집 부모급여", text("cb-parent-total"), "4,992,000원"))
checks.append(("아동수당은 그대로", text("cb-child-total"), "2,400,000원"))

# 탭 전환: data-tab 클릭 없이 activateTab 호출
js("window.LHC.activateTab('unemployment');")
checks.append(("탭 전환: 실업급여 패널 열림", js("__BY_ID['panel-unemployment'].hidden"), False))
checks.append(("탭 전환: 출산 패널 닫힘", js("__BY_ID['panel-childbirth'].hidden"), True))

fail = 0
for name, actual, expected in checks:
    ok = str(actual) == str(expected)
    if not ok:
        fail += 1
    print(("PASS " if ok else "FAIL ") + name + " | 기대 " + str(expected) + " / 실제 " + str(actual))

print()
print(f"=== UI 스모크: PASS {len(checks) - fail} / FAIL {fail} (총 {len(checks)}) ===")
sys.exit(1 if fail else 0)
