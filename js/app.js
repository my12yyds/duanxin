/**
 * 页面交互逻辑
 * ---------------------------------------------------------------
 * 职责：Tab 切换、弹窗、输入校验、倒计时、防重复提交、结果反馈、本地记录
 * 不直接接触网络，全部通过 window.Api 调用
 * ---------------------------------------------------------------
 */
(function () {
  'use strict';

  /* ------------------------------ 常量 ------------------------------ */

  var PHONE_RE = /^1[3-9]\d{9}$/;
  var CODE_RE = /^\d{6}$/;
  var DEFAULT_COOLDOWN = 60;
  var CD_KEY = 'sms_cooldown_v1';
  var HISTORY_KEY = 'verify_history_v1';
  var ANNOUNCE_KEY = 'announce_seen_v1';
  var HISTORY_MAX = 5;

  /* ------------------------------ DOM ------------------------------ */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  var els = {
    card: $('#card'),
    form: $('#verifyForm'),
    formSection: $('#formSection'),
    fieldPhone: $('#fieldPhone'),
    fieldCode: $('#fieldCode'),
    phone: $('#phone'),
    phoneErr: $('#phoneErr'),
    phoneClear: $('#phoneClear'),
    code: $('#code'),
    codeErr: $('#codeErr'),
    codeBtn: $('#codeBtn'),
    submitBtn: $('#submitBtn'),
    resetBtn: $('#resetBtn'),
    result: $('#result'),
    resultIcon: $('#resultIcon'),
    resultTitle: $('#resultTitle'),
    resultDesc: $('#resultDesc'),
    resultMeta: $('#resultMeta'),
    resultBack: $('#resultBack'),
    toast: $('#toast'),
    modeHint: $('#modeHint'),
    modeDot: $('.card__foot .dot'),
    steps: $('#steps'),
    recordList: $('#recordList'),
    clearHistoryBtn: $('#clearHistoryBtn'),
    aboutMode: $('#aboutMode'),
    copyLinkBtn: $('#copyLinkBtn'),
    shareBtn: $('#shareBtn'),
    feedbackText: $('#feedbackText'),
    feedbackCount: $('#feedbackCount'),
    feedbackSubmit: $('#feedbackSubmit')
  };

  /* ------------------------------ 状态 ------------------------------ */

  var state = {
    submitting: false,
    sendingCode: false,
    verified: false,
    cdPhone: '',
    cdUntil: 0,
    timer: null,
    toastTimer: null,
    lastFocus: null
  };

  /* ------------------------------ 工具 ------------------------------ */

  function onlyDigits(str, max) {
    var v = String(str || '').replace(/\D/g, '');
    return max ? v.slice(0, max) : v;
  }

  function maskPhone(phone) {
    return phone.slice(0, 3) + ' **** ' + phone.slice(-4);
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatTime(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function makeRequestId() {
    var rnd = Math.random().toString(36).slice(2, 10);
    return 'rq_' + Date.now().toString(36) + '_' + rnd;
  }

  function toast(message, type) {
    var el = els.toast;
    el.textContent = message;
    el.className = 'toast is-show' + (type === 'ok' ? ' is-ok' : type === 'fail' ? ' is-fail' : '');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      el.className = 'toast';
    }, 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  /* ------------------------------ 校验提示 ------------------------------ */

  function setError(fieldEl, errEl, message) {
    fieldEl.classList.add('is-invalid');
    errEl.textContent = message;
    fieldEl.classList.remove('shake');
    void fieldEl.offsetWidth;
    fieldEl.classList.add('shake');
  }

  function clearError(fieldEl, errEl) {
    fieldEl.classList.remove('is-invalid', 'shake');
    errEl.textContent = '';
  }

  function validatePhone(silent) {
    var v = els.phone.value.trim();
    if (!v) {
      if (!silent) setError(els.fieldPhone, els.phoneErr, '请输入手机号');
      return false;
    }
    if (!PHONE_RE.test(v)) {
      if (!silent) setError(els.fieldPhone, els.phoneErr, '请输入正确的 11 位手机号');
      return false;
    }
    clearError(els.fieldPhone, els.phoneErr);
    return true;
  }

  function validateCode(silent) {
    var v = els.code.value.trim();
    if (!v) {
      if (!silent) setError(els.fieldCode, els.codeErr, '请输入验证码');
      return false;
    }
    if (!CODE_RE.test(v)) {
      if (!silent) setError(els.fieldCode, els.codeErr, '验证码为 6 位数字');
      return false;
    }
    clearError(els.fieldCode, els.codeErr);
    return true;
  }

  /* ------------------------------ 步骤进度 ------------------------------ */

  function setStep(index, status) {
    if (!els.steps) return;
    var li = els.steps.querySelector('[data-step="' + index + '"]');
    if (!li) return;
    li.classList.remove('is-active', 'is-done');
    if (status === 'active') li.classList.add('is-active');
    if (status === 'done') li.classList.add('is-done');
  }

  function renderSteps() {
    var phoneOk = PHONE_RE.test(els.phone.value.trim());
    var codeOk = CODE_RE.test(els.code.value.trim());

    if (state.verified) {
      setStep(1, 'done');
      setStep(2, 'done');
      setStep(3, 'done');
      return;
    }

    setStep(1, phoneOk ? 'done' : 'active');

    if (!phoneOk) {
      setStep(2, 'idle');
      setStep(3, 'idle');
      return;
    }

    setStep(2, codeOk ? 'done' : 'active');
    setStep(3, codeOk ? 'active' : 'idle');
  }

  /* ------------------------------ 倒计时 ------------------------------ */

  function readCooldown() {
    try {
      var raw = localStorage.getItem(CD_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.until) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function writeCooldown(phone, until) {
    try {
      localStorage.setItem(CD_KEY, JSON.stringify({ phone: phone, until: until }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function clearCooldown() {
    try { localStorage.removeItem(CD_KEY); } catch (e) { /* ignore */ }
  }

  function remainingSeconds() {
    if (!state.cdUntil) return 0;
    return Math.max(0, Math.ceil((state.cdUntil - Date.now()) / 1000));
  }

  function renderCodeBtn() {
    var btn = els.codeBtn;
    var phone = els.phone.value.trim();
    var left = state.cdPhone === phone ? remainingSeconds() : 0;

    btn.classList.remove('is-counting');

    if (state.sendingCode) {
      btn.disabled = true;
      btn.textContent = '发送中…';
      return;
    }

    if (left > 0) {
      btn.disabled = true;
      btn.classList.add('is-counting');
      btn.textContent = left + 's 后重发';
      return;
    }

    btn.textContent = '获取验证码';
    btn.disabled = !PHONE_RE.test(phone);
  }

  function startCountdown(phone, seconds) {
    state.cdPhone = phone;
    state.cdUntil = Date.now() + seconds * 1000;
    writeCooldown(phone, state.cdUntil);

    clearInterval(state.timer);
    state.timer = setInterval(function () {
      if (remainingSeconds() <= 0) {
        clearInterval(state.timer);
        state.timer = null;
        state.cdUntil = 0;
        state.cdPhone = '';
        clearCooldown();
      }
      renderCodeBtn();
    }, 250);

    renderCodeBtn();
  }

  function restoreCountdown() {
    var cd = readCooldown();
    if (!cd) return;
    if (cd.until <= Date.now()) {
      clearCooldown();
      return;
    }
    state.cdPhone = cd.phone || '';
    state.cdUntil = cd.until;
    if (cd.phone && !els.phone.value) {
      els.phone.value = cd.phone;
      els.phoneClear.hidden = false;
    }
    startCountdown(state.cdPhone, Math.ceil((cd.until - Date.now()) / 1000));
  }

  /* ------------------------------ 发送验证码 ------------------------------ */

  function handleSendCode() {
    if (state.sendingCode) return;
    if (!validatePhone()) {
      els.phone.focus();
      return;
    }

    var phone = els.phone.value.trim();
    state.sendingCode = true;
    renderCodeBtn();

    window.Api.sendCode({ phone: phone })
      .then(function (data) {
        var seconds = (data && data.cooldown) || DEFAULT_COOLDOWN;
        startCountdown(phone, seconds);
        renderSteps();
        toast('验证码已发送，请查收短信', 'ok');
        els.code.focus();
      })
      .catch(function (err) {
        toast((err && err.message) || '发送失败，请稍后重试', 'fail');
        if (err && err.code === 'RATE_LIMIT') {
          startCountdown(phone, DEFAULT_COOLDOWN);
        }
      })
      .then(function () {
        state.sendingCode = false;
        renderCodeBtn();
      });
  }

  /* ------------------------------ 本地记录 ------------------------------ */

  function readHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeHistory(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    } catch (e) { /* ignore */ }
  }

  function addHistory(phone) {
    var list = readHistory();
    list.unshift({ phone: maskPhone(phone), time: formatTime(), status: '成功' });
    writeHistory(list);
    renderHistory();
  }

  function renderHistory() {
    if (!els.recordList) return;
    var list = readHistory();

    if (!list.length) {
      els.recordList.innerHTML = '<li class="records__empty">暂无验证记录</li>';
      return;
    }

    els.recordList.innerHTML = list.map(function (item) {
      return '<li>' +
        '<span class="r-phone">' + item.phone + '</span>' +
        '<span class="r-time">' + item.time + '</span>' +
        '<span class="r-badge">' + (item.status || '成功') + '</span>' +
        '</li>';
    }).join('');
  }

  /* ------------------------------ 结果反馈 ------------------------------ */

  var ICONS = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4.5 4.5L19 7"/></svg>',
    fail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>'
  };

  function metaRow(label, value) {
    var row = document.createElement('div');
    var dt = document.createElement('dt');
    var dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.appendChild(dt);
    row.appendChild(dd);
    return row;
  }

  function showSuccess(data, phone) {
    state.verified = true;

    els.result.className = 'result result--ok';
    els.resultIcon.innerHTML = ICONS.ok;
    els.resultTitle.textContent = '验证成功';
    els.resultDesc.textContent = '手机号已完成验证，你可以关闭本页面。';

    els.resultMeta.innerHTML = '';
    els.resultMeta.appendChild(metaRow('手机号', maskPhone(phone)));
    els.resultMeta.appendChild(metaRow('验证时间', formatTime(data && data.verifiedAt)));
    if (data && data.orderId) {
      els.resultMeta.appendChild(metaRow('流水号', data.orderId));
    }

    els.formSection.hidden = true;
    els.result.hidden = false;
    els.card.classList.add('is-done');
    els.resultBack.focus();

    renderSteps();
    addHistory(phone);
    toast('验证成功', 'ok');
  }

  /* ------------------------------ 提交 ------------------------------ */

  function setSubmitting(on) {
    state.submitting = on;
    els.submitBtn.disabled = on;
    els.submitBtn.classList.toggle('is-loading', on);
    els.submitBtn.querySelector('.submit__text').textContent = on ? '正在验证…' : '提交验证';
    els.phone.disabled = on;
    els.code.disabled = on;
    if (on) els.codeBtn.disabled = true;
  }

  function handleSubmit(e) {
    if (e) e.preventDefault();

    // 防重复提交：状态锁 + 按钮禁用双重保障
    if (state.submitting) return;

    var phoneOk = validatePhone();
    var codeOk = validateCode();

    if (!phoneOk || !codeOk) {
      var target = phoneOk ? els.code : els.phone;
      target.focus();
      return;
    }

    var phone = els.phone.value.trim();
    var code = els.code.value.trim();

    setSubmitting(true);

    window.Api.verify({ phone: phone, code: code, requestId: makeRequestId() })
      .then(function (data) {
        showSuccess(data, phone);
      })
      .catch(function (err) {
        var msg = (err && err.message) || '验证失败，请稍后重试';
        // 验证码类错误定位到验证码输入框，其余用 toast 提示
        if (err && /CODE_/.test(err.code || '')) {
          setError(els.fieldCode, els.codeErr, msg);
          els.code.focus();
          els.code.select();
        } else {
          toast(msg, 'fail');
        }
      })
      .then(function () {
        setSubmitting(false);
        renderCodeBtn();
      });
  }

  /* ------------------------------ Tab ------------------------------ */

  function switchTab(name) {
    $$('.tab').forEach(function (btn) {
      var on = btn.dataset.tab === name;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.panel').forEach(function (panel) {
      var on = panel.id === 'panel-' + name;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
    // 切页时回到顶部，避免停留在上一页的滚动位置
    if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function initTabs() {
    $$('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.dataset.tab);
      });
    });
  }

  /* ------------------------------ 弹窗 ------------------------------ */

  function openModal(name) {
    var modal = $('#modal-' + name);
    if (!modal) return;
    state.lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');

    var dlg = modal.querySelector('.modal__dialog');
    if (dlg) {
      if (!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex', '-1');
      dlg.focus({ preventScroll: true });
    }

    if (name === 'feedback') {
      var ta = els.feedbackText;
      if (ta) {
        els.feedbackCount.textContent = ta.value.length + ' / 300';
      }
    }
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    if (!$$('.modal:not([hidden])').length) {
      document.body.classList.remove('modal-open');
    }
    if (state.lastFocus && state.lastFocus.focus) {
      state.lastFocus.focus({ preventScroll: true });
    }
  }

  function initModals() {
    $$('[data-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal(btn.dataset.modal);
      });
    });

    $$('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]')) closeModal(modal);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var opened = $$('.modal:not([hidden])');
      if (opened.length) closeModal(opened[opened.length - 1]);
    });
  }

  /* ------------------------------ 关注本站 / 更多功能 ------------------------------ */

  function initFollow() {
    if (els.copyLinkBtn) {
      els.copyLinkBtn.addEventListener('click', function () {
        copyText(location.href).then(function () {
          toast('链接已复制', 'ok');
        }).catch(function () {
          toast('复制失败，请手动复制地址栏链接', 'fail');
        });
      });
    }

    if (els.shareBtn) {
      els.shareBtn.addEventListener('click', function () {
        var payload = {
          title: document.title,
          text: '手机号验证',
          url: location.href
        };
        if (navigator.share) {
          navigator.share(payload).catch(function () { /* 用户取消 */ });
        } else {
          copyText(location.href).then(function () {
            toast('当前浏览器不支持分享，链接已复制', 'ok');
          }).catch(function () {
            toast('请手动复制地址栏链接', 'fail');
          });
        }
      });
    }
  }

  function initMore() {
    renderHistory();

    if (els.clearHistoryBtn) {
      els.clearHistoryBtn.addEventListener('click', function () {
        if (!readHistory().length) {
          toast('暂无记录可清除');
          return;
        }
        try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* ignore */ }
        renderHistory();
        toast('本地记录已清除', 'ok');
      });
    }
  }

  function initFeedback() {
    if (!els.feedbackText) return;

    els.feedbackText.addEventListener('input', function () {
      els.feedbackCount.textContent = els.feedbackText.value.length + ' / 300';
    });

    els.feedbackSubmit.addEventListener('click', function () {
      var text = els.feedbackText.value.trim();
      if (!text) {
        toast('请先填写留言内容', 'fail');
        els.feedbackText.focus();
        return;
      }
      // 无后端时仅保存在本地，接入接口后可替换为真实提交
      try {
        var list = JSON.parse(localStorage.getItem('feedback_v1') || '[]');
        list.unshift({ text: text, time: formatTime() });
        localStorage.setItem('feedback_v1', JSON.stringify(list.slice(0, 20)));
      } catch (e) { /* ignore */ }

      els.feedbackText.value = '';
      els.feedbackCount.textContent = '0 / 300';
      closeModal($('#modal-feedback'));
      toast('留言已保存，感谢反馈', 'ok');
    });
  }

  /* ------------------------------ 重置 ------------------------------ */

  function resetForm() {
    els.phone.value = '';
    els.code.value = '';
    els.phoneClear.hidden = true;
    clearError(els.fieldPhone, els.phoneErr);
    clearError(els.fieldCode, els.codeErr);

    clearInterval(state.timer);
    state.timer = null;
    state.cdUntil = 0;
    state.cdPhone = '';
    state.verified = false;
    clearCooldown();

    els.result.hidden = true;
    els.formSection.hidden = false;
    els.card.classList.remove('is-done');

    renderCodeBtn();
    renderSteps();
    els.phone.focus();
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  function bindEvents() {
    // 手机号：只允许数字，实时清理
    els.phone.addEventListener('input', function () {
      var cleaned = onlyDigits(els.phone.value, 11);
      if (cleaned !== els.phone.value) els.phone.value = cleaned;
      els.phoneClear.hidden = cleaned.length === 0;

      if (els.fieldPhone.classList.contains('is-invalid') && PHONE_RE.test(cleaned)) {
        clearError(els.fieldPhone, els.phoneErr);
      }
      // 号码变化后同步倒计时状态
      if (state.cdPhone && cleaned !== state.cdPhone) {
        clearInterval(state.timer);
        state.timer = null;
        state.cdUntil = 0;
        state.cdPhone = '';
      }
      renderCodeBtn();
      renderSteps();
    });

    els.phone.addEventListener('blur', function () {
      if (els.phone.value.trim()) validatePhone();
    });

    els.phoneClear.addEventListener('click', function () {
      els.phone.value = '';
      els.phoneClear.hidden = true;
      clearError(els.fieldPhone, els.phoneErr);
      renderCodeBtn();
      renderSteps();
      els.phone.focus();
    });

    // 验证码
    els.code.addEventListener('input', function () {
      var cleaned = onlyDigits(els.code.value, 6);
      if (cleaned !== els.code.value) els.code.value = cleaned;
      if (els.fieldCode.classList.contains('is-invalid')) {
        clearError(els.fieldCode, els.codeErr);
      }
      renderSteps();
    });

    els.code.addEventListener('blur', function () {
      if (els.code.value.trim()) validateCode();
    });

    // 粘贴时去掉空格等非数字
    els.code.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text') || '';
      var digits = onlyDigits(text, 6);
      if (digits) {
        e.preventDefault();
        els.code.value = digits;
        els.code.dispatchEvent(new Event('input'));
        if (digits.length === 6) els.code.blur();
      }
    });

    els.codeBtn.addEventListener('click', handleSendCode);
    els.form.addEventListener('submit', handleSubmit);
    els.resetBtn.addEventListener('click', resetForm);

    els.resultBack.addEventListener('click', function () {
      state.verified = false;
      els.result.hidden = true;
      els.formSection.hidden = false;
      els.card.classList.remove('is-done');
      els.code.value = '';
      clearError(els.fieldCode, els.codeErr);
      renderSteps();
      els.code.focus();
    });

    // 客服邮箱复制
    $$('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = $(btn.dataset.copy);
        if (!target) return;
        copyText(target.textContent.trim()).then(function () {
          toast('已复制', 'ok');
        }).catch(function () {
          toast('复制失败，请手动选择', 'fail');
        });
      });
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */

  function init() {
    bindEvents();
    initTabs();
    initModals();
    initFollow();
    initMore();
    initFeedback();
    restoreCountdown();
    renderCodeBtn();
    renderSteps();

    // 展示当前运行模式
    var isMock = window.Api && window.Api.isMock;
    if (isMock) {
      els.modeHint.textContent = '演示模式 · 验证码填 123456';
      if (els.aboutMode) els.aboutMode.textContent = '演示模式（本地 mock）';
    } else {
      els.modeHint.textContent = '已连接服务端接口';
      els.modeDot.classList.add('is-live');
      if (els.aboutMode) els.aboutMode.textContent = '已连接接口';
    }

    // 首次访问自动弹出公告
    var seen = false;
    try { seen = localStorage.getItem(ANNOUNCE_KEY) === '1'; } catch (e) { seen = false; }
    if (!seen) {
      setTimeout(function () {
        openModal('announce');
        try { localStorage.setItem(ANNOUNCE_KEY, '1'); } catch (e) { /* ignore */ }
      }, 500);
    }

    // 仅在精确指针设备上自动聚焦，避免移动端弹出键盘
    if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      els.phone.focus({ preventScroll: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
