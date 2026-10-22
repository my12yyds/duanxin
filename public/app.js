(() => {
  'use strict';

  const KEY = 'message-guard-workspace-v2';
  const now = () => new Date().toISOString();
  const day = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const uid = () => globalThis.crypto?.randomUUID?.() || `mg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function starterState() {
    const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
    return {
      version: 2,
      contacts: [
        { id: 'c-01', name: '林小满', alias: '演示号码 · 0001', consent: true, consentAt: ago(35), updatedAt: ago(2), lastRun: null, dailyRunDate: null, dailyRuns: 0 },
        { id: 'c-02', name: '陈雨', alias: '演示号码 · 0002', consent: true, consentAt: ago(28), updatedAt: ago(3), lastRun: null, dailyRunDate: null, dailyRuns: 0 },
        { id: 'c-03', name: '周可', alias: '演示号码 · 0003', consent: true, consentAt: ago(21), updatedAt: ago(1), lastRun: null, dailyRunDate: null, dailyRuns: 0 },
        { id: 'c-04', name: '许安', alias: '演示号码 · 0004', consent: false, consentAt: ago(43), updatedAt: ago(8), lastRun: null, dailyRunDate: null, dailyRuns: 0 },
        { id: 'c-05', name: '苏禾', alias: '演示号码 · 0005', consent: true, consentAt: ago(14), updatedAt: ago(4), lastRun: null, dailyRunDate: null, dailyRuns: 0 },
        { id: 'c-06', name: '叶青', alias: '演示号码 · 0006', consent: true, consentAt: ago(11), updatedAt: ago(2), lastRun: null, dailyRunDate: null, dailyRuns: 0 },
        { id: 'c-07', name: '唐果', alias: '演示号码 · 0007', consent: true, consentAt: ago(6), updatedAt: ago(1), lastRun: null, dailyRunDate: null, dailyRuns: 0 },
        { id: 'c-08', name: '顾言', alias: '演示号码 · 0008', consent: false, consentAt: ago(55), updatedAt: ago(12), lastRun: null, dailyRunDate: null, dailyRuns: 0 }
      ],
      templates: [
        { id: 't-01', name: '订单状态提醒', category: '服务通知', body: '你好，{name}。你的订单状态已更新，请登录服务页面查看详情。回复 TD 可停止此类通知。', updatedAt: ago(3) },
        { id: 't-02', name: '预约时间确认', category: '服务通知', body: '{name}，这是你主动预约的时间确认提醒。如需调整，请通过官方服务入口操作。回复 TD 可退订。', updatedAt: ago(2) },
        { id: 't-03', name: '账户安全提示', category: '安全提醒', body: '{name}，检测到账户安全设置有更新。如非本人操作，请从官方应用检查账户。我们不会在短信中索取密码。', updatedAt: ago(1) }
      ],
      campaigns: [
        { id: 'a-01', name: '订单提醒流程演练', templateId: 't-01', status: '已完成演练', eligible: 6, suppressed: 2, createdAt: ago(1), simulatedAt: ago(1) },
        { id: 'a-02', name: '预约通知规则检查', templateId: 't-02', status: '草稿', eligible: 0, suppressed: 0, createdAt: ago(3), simulatedAt: null }
      ],
      audit: [
        { id: uid(), type: '规则', detail: '创建本地演示工作区', at: ago(2) },
        { id: uid(), type: '演练', detail: '完成「订单提醒流程演练」的本地资格检查', at: ago(1) }
      ],
      settings: { dailyLimit: 2, quietStart: '21:00', quietEnd: '08:00' }
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (parsed?.version === 2 && Array.isArray(parsed.contacts) && Array.isArray(parsed.templates) && Array.isArray(parsed.campaigns) && Array.isArray(parsed.audit)) return parsed;
    } catch { /* Start with the safe demo dataset when local storage is unavailable. */ }
    return starterState();
  }

  let state = loadState();
  let contactQuery = '';
  let templateQuery = '';
  const view = document.querySelector('#view');
  const modal = document.querySelector('#modal');
  const modalContent = document.querySelector('#modal-content');
  const toastRegion = document.querySelector('#toast-region');
  const TITLES = { dashboard: '总览', contacts: '联系人', templates: '通知模板', campaigns: '活动演练', suppression: '退订名单', audit: '操作审计', settings: '规则与数据' };

  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const fmtDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
  const relative = (value) => {
    if (!value) return '从未演练';
    const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
    return days === 0 ? '今天' : `${days} 天前`;
  };
  const consentLabel = (contact) => contact.consent ? '<span class="status status-good"><i></i>已授权</span>' : '<span class="status status-muted"><i></i>已退订</span>';
  const empty = (icon, title, text, action = '') => `<div class="empty-state"><span class="empty-icon">${icon}</span><strong>${title}</strong><p>${text}</p>${action}</div>`;
  const button = (label, action, cls = 'button button-small') => `<button type="button" class="${cls}" data-action="${action}">${label}</button>`;

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { toast('浏览器存储不可用，本次更改不会在刷新后保留。'); }
  }

  function log(type, detail) {
    state.audit.unshift({ id: uid(), type, detail, at: now() });
    state.audit = state.audit.slice(0, 250);
    persist();
  }

  function toast(message) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    toastRegion.append(node);
    setTimeout(() => node.remove(), 3200);
  }

  function go(route) {
    const safeRoute = TITLES[route] ? route : 'dashboard';
    if (location.hash.slice(1) !== safeRoute) location.hash = safeRoute;
    render(safeRoute);
    document.querySelector('#sidebar').classList.remove('mobile-open');
    document.querySelector('#mobile-menu').setAttribute('aria-expanded', 'false');
  }

  function render(route = location.hash.slice(1) || 'dashboard') {
    document.querySelector('#page-title').textContent = TITLES[route] || TITLES.dashboard;
    document.querySelectorAll('[data-route]').forEach((link) => {
      link.classList.toggle('active', link.dataset.route === (TITLES[route] ? route : 'dashboard'));
    });
    document.querySelector('#nav-contact-count').textContent = String(state.contacts.length);
    const pages = { dashboard: renderDashboard, contacts: renderContacts, templates: renderTemplates, campaigns: renderCampaigns, suppression: renderSuppression, audit: renderAudit, settings: renderSettings };
    view.innerHTML = (pages[route] || renderDashboard)();
    view.focus({ preventScroll: true });
  }

  function pageHead(eyebrow, title, desc, action = '') {
    return `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-description">${desc}</p></div>${action}</div>`;
  }

  function renderDashboard() {
    const active = state.contacts.filter((item) => item.consent).length;
    const optedOut = state.contacts.length - active;
    const completed = state.campaigns.filter((item) => item.status === '已完成演练').length;
    const audits = state.audit.slice(0, 5);
    const recentCampaigns = state.campaigns.slice(0, 4);
    return `${pageHead('工作区概览', '早上好，欢迎回来。', '查看授权状态、通知规则和最近的本地演练。', '<span class="read-only-badge"><span></span>本地演示数据</span>')}
      <div class="notice-banner"><span class="notice-symbol">i</span><div><strong>演示环境已启用</strong><p>所有操作只更新当前浏览器中的示例数据，不会连接服务商，也不会发送消息。</p></div><a href="#settings" data-route="settings">管理本地数据 <span>→</span></a></div>
      <section class="metric-grid" aria-label="关键指标">
        <article class="metric-card"><div class="metric-top"><span>联系人</span><span class="metric-icon green">◎</span></div><strong>${state.contacts.length}</strong><small>演示资料条目</small><div class="metric-bottom">全部使用虚构号码别名</div></article>
        <article class="metric-card"><div class="metric-top"><span>有效同意</span><span class="metric-icon blue">✓</span></div><strong>${active}</strong><small>当前可参与资格演练</small><div class="metric-bottom"><span class="tiny-dot good"></span>需能证明用户主动订阅</div></article>
        <article class="metric-card"><div class="metric-top"><span>已退订</span><span class="metric-icon orange">⊘</span></div><strong>${optedOut}</strong><small>已从演练对象中抑制</small><div class="metric-bottom"><span class="tiny-dot muted"></span>退订后必须停止触达</div></article>
        <article class="metric-card"><div class="metric-top"><span>完成演练</span><span class="metric-icon purple">◷</span></div><strong>${completed}</strong><small>本地资格检查次数</small><div class="metric-bottom">不产生真实发送</div></article>
      </section>
      <div class="dashboard-grid"><section class="panel campaign-panel"><div class="panel-heading"><div><h2>最近的活动演练</h2><p>只做资格和规则检查，不会发送</p></div><a href="#campaigns" data-route="campaigns" class="panel-link">查看全部 <span>→</span></a></div>
        ${recentCampaigns.length ? `<div class="table-wrap"><table><thead><tr><th>活动名称</th><th>模板</th><th>符合条件</th><th>状态</th><th>时间</th></tr></thead><tbody>${recentCampaigns.map((campaign) => {
          const template = state.templates.find((item) => item.id === campaign.templateId);
          return `<tr><td><strong>${esc(campaign.name)}</strong><small class="cell-sub">${esc(campaign.id)}</small></td><td>${esc(template?.name || '模板已删除')}</td><td>${campaign.status === '已完成演练' ? campaign.eligible : '—'}</td><td><span class="pill ${campaign.status === '已完成演练' ? 'pill-green' : 'pill-sand'}">${esc(campaign.status)}</span></td><td>${relative(campaign.simulatedAt || campaign.createdAt)}</td></tr>`;
        }).join('')}</tbody></table></div>` : empty('◷', '还没有演练记录', '新建一次本地演练，检查授权和频率规则。', button('创建演练', 'new-campaign', 'button button-primary button-small'))}
      </section>
      <section class="panel rules-panel"><div class="panel-heading"><div><h2>当前保护规则</h2><p>本地演示采用的资格门槛</p></div><a href="#settings" data-route="settings" class="panel-link">编辑 <span>→</span></a></div>
        <div class="rule-row"><span class="rule-icon">✓</span><div><strong>必须有明确同意</strong><small>只统计有效授权联系人</small></div><span class="rule-on">开启</span></div>
        <div class="rule-row"><span class="rule-icon orange-bg">⊘</span><div><strong>排除已退订联系人</strong><small>退订状态优先且持续生效</small></div><span class="rule-on">开启</span></div>
        <div class="rule-row"><span class="rule-icon blue-bg">◷</span><div><strong>单日演练频率上限</strong><small>每位联系人最多 ${state.settings.dailyLimit} 次</small></div><span class="rule-on">开启</span></div>
        <div class="rule-row"><span class="rule-icon purple-bg">☾</span><div><strong>安静时段</strong><small>${esc(state.settings.quietStart)} — ${esc(state.settings.quietEnd)}</small></div><span class="rule-on">开启</span></div>
      </section></div>
      <section class="panel audit-preview"><div class="panel-heading"><div><h2>最近操作</h2><p>保留本地规则和演练变更记录</p></div><a href="#audit" data-route="audit" class="panel-link">审计日志 <span>→</span></a></div>
        ${audits.length ? `<div class="audit-list">${audits.map((item) => `<div class="audit-row"><span class="audit-dot"></span><span class="audit-type">${esc(item.type)}</span><strong>${esc(item.detail)}</strong><time>${fmtDate(item.at)}</time></div>`).join('')}</div>` : empty('≋', '暂无操作记录', '你的本地操作会显示在这里。')}
      </section>`;
  }

  function renderContacts() {
    const query = contactQuery.trim().toLowerCase();
    const contacts = state.contacts.filter((item) => `${item.name} ${item.alias}`.toLowerCase().includes(query));
    return `${pageHead('对象与授权', '联系人', '管理演示联系人和授权状态。请勿输入真实手机号或个人敏感信息。', button('＋ 添加演示联系人', 'new-contact', 'button button-primary'))}
      <div class="notice-banner compact-banner"><span class="notice-symbol">i</span><div><strong>隐私保护</strong><p>示例只使用虚构号码别名；联系人数据保存在本机浏览器。</p></div></div>
      <section class="panel table-panel"><div class="table-toolbar"><div><strong>${state.contacts.length} 位联系人</strong><span class="toolbar-hint">· 授权状态会决定是否进入演练资格统计</span></div><label class="search-box"><span aria-hidden="true">⌕</span><input id="contact-search" type="search" value="${esc(contactQuery)}" placeholder="搜索姓名或别名" aria-label="搜索联系人"></label></div>
      ${contacts.length ? `<div class="table-wrap"><table><thead><tr><th>联系人</th><th>号码别名</th><th>授权状态</th><th>同意记录</th><th>最近演练</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>${contacts.map((item) => `<tr><td><div class="person-cell"><span class="person-avatar tone-${item.name.charCodeAt(0) % 5}">${esc(item.name.slice(0, 1))}</span><strong>${esc(item.name)}</strong></div></td><td class="muted-cell">${esc(item.alias)}</td><td>${consentLabel(item)}</td><td>${item.consent ? fmtDate(item.consentAt) : `<span class="muted-cell">已于 ${fmtDate(item.updatedAt)} 退订</span>`}</td><td>${relative(item.lastRun)}</td><td class="row-actions">${item.consent ? button('退订', `unsubscribe:${item.id}`, 'text-button danger-text') : button('重新授权', `resubscribe:${item.id}`, 'text-button')}${button('删除', `delete-contact:${item.id}`, 'text-button danger-text')}</td></tr>`).join('')}</tbody></table></div>` : empty('⌕', '没有匹配的联系人', query ? '换个关键词试试。' : '添加一位虚构联系人，体验授权管理。', query ? '' : button('添加联系人', 'new-contact', 'button button-primary button-small'))}
      </section>`;
  }

  function renderTemplates() {
    const query = templateQuery.trim().toLowerCase();
    const templates = state.templates.filter((item) => `${item.name} ${item.category} ${item.body}`.toLowerCase().includes(query));
    return `${pageHead('内容与规范', '通知模板', '维护用途明确、内容克制的消息文案。模板只用于本地预览。', button('＋ 新建模板', 'new-template', 'button button-primary'))}
      <div class="template-guidance"><span>✳</span><p><strong>模板建议</strong>标明发送方和通知目的；避免索取密码、验证码等敏感信息；提供清楚的退订方式。</p></div>
      <label class="search-box template-search"><span aria-hidden="true">⌕</span><input id="template-search" type="search" value="${esc(templateQuery)}" placeholder="搜索模板" aria-label="搜索模板"></label>
      ${templates.length ? `<div class="template-grid">${templates.map((item) => `<article class="template-card"><div class="template-card-top"><span class="template-category">${esc(item.category)}</span><div class="dots-menu">${button('⋯', `template-menu:${item.id}`, 'icon-button')}</div></div><h2>${esc(item.name)}</h2><p class="template-body">${esc(item.body)}</p><div class="template-card-footer"><span>更新于 ${relative(item.updatedAt)}</span><div>${button('预览', `preview-template:${item.id}`, 'text-button')}${button('编辑', `edit-template:${item.id}`, 'text-button')}</div></div></article>`).join('')}</div>` : empty('▤', '没有找到模板', query ? '换个关键词试试。' : '创建第一条合规通知模板。', button('新建模板', 'new-template', 'button button-primary button-small'))}`;
  }

  function renderCampaigns() {
    return `${pageHead('规则验证', '活动演练', '选择模板后进行本地资格检查。此功能只模拟规则结果，不会安排或发送短信。', button('＋ 新建演练', 'new-campaign', 'button button-primary'))}
      <div class="notice-banner compact-banner"><span class="notice-symbol">✓</span><div><strong>安全边界已启用</strong><p>退订联系人会自动排除；频率限制和安静时段会参与资格检查；无任何外部发送请求。</p></div></div>
      <section class="panel table-panel"><div class="table-toolbar"><div><strong>演练记录</strong><span class="toolbar-hint">· ${state.campaigns.length} 条</span></div><span class="run-mode">本地模拟</span></div>
      ${state.campaigns.length ? `<div class="table-wrap"><table><thead><tr><th>演练名称</th><th>使用模板</th><th>符合规则</th><th>被规则排除</th><th>状态</th><th>更新时间</th><th></th></tr></thead><tbody>${state.campaigns.map((item) => { const template = state.templates.find((entry) => entry.id === item.templateId); return `<tr><td><strong>${esc(item.name)}</strong><small class="cell-sub">${esc(item.id)}</small></td><td>${esc(template?.name || '模板已删除')}</td><td>${item.status === '已完成演练' ? item.eligible : '—'}</td><td>${item.status === '已完成演练' ? item.suppressed : '—'}</td><td><span class="pill ${item.status === '已完成演练' ? 'pill-green' : 'pill-sand'}">${esc(item.status)}</span></td><td>${fmtDate(item.simulatedAt || item.createdAt)}</td><td>${item.status === '草稿' ? button('开始演练', `simulate:${item.id}`, 'text-button') : button('再次演练', `simulate:${item.id}`, 'text-button')}${button('删除', `delete-campaign:${item.id}`, 'text-button danger-text')}</td></tr>`; }).join('')}</tbody></table></div>` : empty('◷', '还没有活动演练', '新建演练，查看同意状态和频率限制如何影响资格。', button('新建演练', 'new-campaign', 'button button-primary button-small'))}
      </section><p class="page-footnote">“符合规则”仅表示通过本地演示条件，不代表法律合规结论，也不会触发真实消息。</p>`;
  }

  function renderSuppression() {
    const optedOut = state.contacts.filter((item) => !item.consent);
    return `${pageHead('用户选择', '退订名单', '已退订联系人会在所有本地演练中自动排除。重新订阅必须记录新的明确同意。', '<span class="counter-chip">当前抑制 <strong>' + optedOut.length + '</strong></span>')}
      <div class="notice-banner compact-banner"><span class="notice-symbol orange-symbol">⊘</span><div><strong>退订状态优先</strong><p>退订记录不会因活动、模板或规则调整而自动恢复。</p></div></div>
      <section class="panel table-panel"><div class="table-toolbar"><div><strong>已退订联系人</strong><span class="toolbar-hint">· 不会进入活动演练</span></div></div>
      ${optedOut.length ? `<div class="table-wrap"><table><thead><tr><th>联系人</th><th>号码别名</th><th>状态</th><th>退订时间</th><th>操作</th></tr></thead><tbody>${optedOut.map((item) => `<tr><td><div class="person-cell"><span class="person-avatar tone-${item.name.charCodeAt(0) % 5}">${esc(item.name.slice(0, 1))}</span><strong>${esc(item.name)}</strong></div></td><td class="muted-cell">${esc(item.alias)}</td><td>${consentLabel(item)}</td><td>${fmtDate(item.updatedAt)}</td><td>${button('记录重新授权', `resubscribe:${item.id}`, 'text-button')}</td></tr>`).join('')}</tbody></table></div>` : empty('✓', '目前没有退订记录', '当联系人退订后，会在这里持续显示。')}
      </section>`;
  }

  function renderAudit() {
    return `${pageHead('透明与追溯', '操作审计', '本地记录联系人状态、模板和演练变更。日志最多保留最近 250 条。', button('导出记录', 'export-data', 'button button-secondary'))}
      <div class="notice-banner compact-banner"><span class="notice-symbol">≋</span><div><strong>最小化记录</strong><p>演示日志只记操作类型和摘要，不记录消息收件信息或正文内容。</p></div></div>
      <section class="panel table-panel"><div class="table-toolbar"><div><strong>全部操作</strong><span class="toolbar-hint">· ${state.audit.length} 条</span></div></div>
      ${state.audit.length ? `<div class="table-wrap"><table><thead><tr><th>操作类型</th><th>操作摘要</th><th>时间</th></tr></thead><tbody>${state.audit.map((item) => `<tr><td><span class="audit-type-chip">${esc(item.type)}</span></td><td><strong class="audit-detail">${esc(item.detail)}</strong></td><td class="muted-cell">${fmtDate(item.at)}</td></tr>`).join('')}</tbody></table></div>` : empty('≋', '暂无操作记录', '本地变更会自动记录在这里。')}
      </section>`;
  }

  function renderSettings() {
    return `${pageHead('工作区偏好', '规则与数据', '调整本地演练使用的规则，或导出、清除当前浏览器中的演示数据。', '')}
      <div class="settings-grid"><section class="panel settings-panel"><div class="panel-heading"><div><h2>演练保护规则</h2><p>只影响本地资格计算，不配置真实发送</p></div></div>
        <form id="settings-form" class="settings-form"><label class="field"><span>单人每日演练次数上限</span><small>达到上限后，该联系人会从当天后续演练中排除。</small><div class="input-suffix"><input name="dailyLimit" type="number" min="1" max="10" value="${Number(state.settings.dailyLimit) || 1}" required><span>次 / 天</span></div></label>
          <div class="field"><span>安静时段</span><small>时段内的演练结果会显示提醒，不安排消息。</small><div class="time-fields"><label>开始 <input name="quietStart" type="time" value="${esc(state.settings.quietStart)}" required></label><label>结束 <input name="quietEnd" type="time" value="${esc(state.settings.quietEnd)}" required></label></div></div>
          <div class="settings-note"><span>✓</span><p>同意检查和退订抑制始终开启，不能在此关闭。</p></div><button class="button button-primary" type="submit">保存本地规则</button>
        </form></section>
        <section class="panel settings-panel"><div class="panel-heading"><div><h2>数据管理</h2><p>资料保存在当前浏览器的本地存储中</p></div></div>
          <div class="data-action"><div><strong>导出本地备份</strong><small>下载联系人别名、模板、演练和审计数据的 JSON 文件。</small></div>${button('导出 JSON', 'export-data', 'button button-secondary button-small')}</div>
          <div class="data-action"><div><strong>恢复初始演示数据</strong><small>清空本地更改并重新加载虚构示例。</small></div>${button('恢复示例', 'reset-data', 'button button-danger button-small')}</div>
          <div class="storage-note"><span>ⓘ</span>请勿在公共设备中录入真实个人信息。本地存储不提供账号隔离或云端备份。</div>
        </section></div>
      <section class="panel boundaries-panel"><div class="boundary-mark">i</div><div><strong>演示版本边界</strong><p>这是本地规则演示应用。没有短信供应商连接、后台服务、登录认证或消息发送功能。真实通知系统需要独立的服务端、用户授权核验、退订同步、凭据管理和合规审查。</p></div></section>`;
  }

  function showModal(content) {
    modalContent.innerHTML = content;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    modal.querySelector('input,select,textarea,button:not(.icon-button)')?.focus();
  }

  function hideModal() {
    if (modal.open && typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  }

  function newContactForm() {
    showModal(`<div class="modal-heading"><p class="eyebrow">虚构数据</p><h2>添加演示联系人</h2><p>只填写姓名和虚构别名，不要填写真实手机号。</p></div><form id="contact-form" class="modal-form">
      <label class="field"><span>姓名或代号</span><input name="name" maxlength="30" placeholder="例如：林小满" required></label>
      <label class="field"><span>号码别名</span><input name="alias" maxlength="40" placeholder="例如：演示号码 · 0009" required></label>
      <label class="consent-check"><input name="consent" type="checkbox"><span>已在现实流程中获得该联系人对指定通知的明确同意（仅演示记录）</span></label>
      <div class="modal-actions"><button type="button" class="button button-secondary" data-action="close-modal">取消</button><button class="button button-primary" type="submit">保存联系人</button></div>
    </form>`);
  }

  function newTemplateForm(existing = null) {
    const item = existing || { name: '', category: '服务通知', body: '' };
    showModal(`<div class="modal-heading"><p class="eyebrow">通知文案</p><h2>${existing ? '编辑模板' : '新建模板'}</h2><p>使用 {name} 作为联系人姓名占位符。内容仅用于本地预览。</p></div><form id="template-form" class="modal-form" data-id="${esc(existing?.id || '')}">
      <label class="field"><span>模板名称</span><input name="name" maxlength="40" value="${esc(item.name)}" placeholder="例如：服务状态提醒" required></label>
      <label class="field"><span>通知类别</span><select name="category"><option ${item.category === '服务通知' ? 'selected' : ''}>服务通知</option><option ${item.category === '安全提醒' ? 'selected' : ''}>安全提醒</option><option ${item.category === '预约提醒' ? 'selected' : ''}>预约提醒</option></select></label>
      <label class="field"><span>文案内容</span><textarea name="body" rows="5" maxlength="500" placeholder="写清楚发送方和通知目的……" required>${esc(item.body)}</textarea><small>避免索取密码、验证码等敏感信息；说明退订方法。</small></label>
      <div class="template-preview-hint"><span>✓</span>保存后可用虚构姓名预览，不会发送。</div>
      <div class="modal-actions"><button type="button" class="button button-secondary" data-action="close-modal">取消</button><button class="button button-primary" type="submit">保存模板</button></div>
    </form>`);
  }

  function previewTemplate(id) {
    const template = state.templates.find((item) => item.id === id);
    if (!template) return;
    const rendered = template.body.replaceAll('{name}', '林小满');
    showModal(`<div class="modal-heading"><p class="eyebrow">本地预览</p><h2>${esc(template.name)}</h2><p>${esc(template.category)} · 使用虚构联系人展示变量替换结果</p></div><div class="preview-message"><span class="preview-label">示例内容</span><p>${esc(rendered)}</p></div><div class="modal-actions"><button class="button button-secondary" data-action="close-modal">关闭</button><button class="button button-primary" data-action="edit-template:${esc(id)}">编辑模板</button></div><p class="page-footnote modal-footnote">此预览不会连接服务或发送消息。</p>`);
  }

  function newCampaignForm() {
    if (!state.templates.length) { toast('请先创建一个通知模板。'); go('templates'); return; }
    showModal(`<div class="modal-heading"><p class="eyebrow">只在本机运行</p><h2>新建活动演练</h2><p>检查模板、授权、退订抑制和频率规则。</p></div><form id="campaign-form" class="modal-form">
      <label class="field"><span>演练名称</span><input name="name" maxlength="50" placeholder="例如：订单提醒规则检查" required></label>
      <label class="field"><span>选择通知模板</span><select name="templateId" required>${state.templates.map((item) => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.category)}</option>`).join('')}</select></label>
      <div class="simulation-warning"><strong>演练流程</strong><p>系统只统计明确授权且未退订的虚构联系人，并应用每日次数上限。不会创建发送任务，也不会访问网络。</p></div>
      <div class="modal-actions"><button type="button" class="button button-secondary" data-action="close-modal">取消</button><button class="button button-primary" type="submit">创建本地演练</button></div>
    </form>`);
  }

  function simulateCampaign(id) {
    const item = state.campaigns.find((campaign) => campaign.id === id);
    if (!item) return;
    const [startHour, startMinute] = state.settings.quietStart.split(':').map(Number);
    const [endHour, endMinute] = state.settings.quietEnd.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    const current = new Date().getHours() * 60 + new Date().getMinutes();
    const quietNow = start < end ? current >= start && current < end : current >= start || current < end;
    const dailyLimit = Math.max(1, Math.min(10, Number(state.settings.dailyLimit) || 1));
    const eligible = quietNow ? [] : state.contacts.filter((contact) => {
      const usedToday = contact.dailyRunDate === day() ? Number(contact.dailyRuns || 0) : 0;
      return contact.consent && usedToday < dailyLimit;
    });
    const suppressed = state.contacts.length - eligible.length;
    item.status = '已完成演练';
    item.eligible = eligible.length;
    item.suppressed = suppressed;
    item.simulatedAt = now();
    eligible.forEach((contact) => {
      const usedToday = contact.dailyRunDate === day() ? Number(contact.dailyRuns || 0) : 0;
      contact.dailyRuns = usedToday + 1;
      contact.dailyRunDate = day();
      contact.lastRun = item.simulatedAt;
    });
    log('演练', `完成「${item.name}」的本地资格检查：${eligible.length} 位符合，${suppressed} 位被排除${quietNow ? '；当前处于安静时段' : ''}`);
    persist();
    render('campaigns');
    showModal(`<div class="result-icon">${quietNow ? '☾' : '✓'}</div><div class="modal-heading centered"><p class="eyebrow">本地演练完成</p><h2>${quietNow ? '当前处于安静时段' : '规则检查已完成'}</h2><p>${quietNow ? '根据你设置的安静时段，所有联系人均从本次演练结果中排除。' : '演练仅更新了本地示例状态，没有发送或安排任何消息。'}</p></div><div class="result-stats"><div><strong>${eligible.length}</strong><span>符合演练规则</span></div><div><strong>${suppressed}</strong><span>${quietNow ? '安静时段内已排除' : '被退订或频率规则排除'}</span></div></div><div class="modal-actions"><button class="button button-primary" data-action="close-modal">知道了</button></div>`);
  }

  function setConsent(id, consent) {
    const contact = state.contacts.find((item) => item.id === id);
    if (!contact) return;
    if (consent) {
      showModal(`<div class="modal-heading"><p class="eyebrow">需要新的明确同意</p><h2>重新授权 ${esc(contact.name)}？</h2><p>只有在现实流程中再次取得有效订阅同意后，才应更新此状态。</p></div><form id="consent-form" data-id="${esc(id)}"><label class="consent-check"><input name="confirmed" type="checkbox" required><span>我已通过独立、明确的用户操作重新取得同意，并记录了同意来源。</span></label><div class="modal-actions"><button type="button" class="button button-secondary" data-action="close-modal">取消</button><button class="button button-primary" type="submit">确认记录同意</button></div></form>`);
      return;
    }
    contact.consent = false;
    contact.updatedAt = now();
    log('退订', `已将联系人「${contact.name}」加入本地抑制名单`);
    persist();
    render(location.hash.slice(1) || 'contacts');
    toast('退订状态已记录，并会从后续演练中排除。');
  }

  function exportData() {
    log('数据', '导出了本地演示工作区备份');
    const backup = { exportedAt: now(), format: 'message-guard-local-demo-v2', data: state };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `message-guard-backup-${day()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('备份文件已下载。');
  }

  function resetData() {
    showModal(`<div class="modal-heading"><p class="eyebrow">清除本机数据</p><h2>恢复初始演示数据？</h2><p>当前浏览器中的联系人、模板、规则和审计记录将被示例数据替换。此操作无法撤销。</p></div><div class="modal-actions"><button class="button button-secondary" data-action="close-modal">取消</button><button class="button button-danger" data-action="confirm-reset">恢复示例</button></div>`);
  }

  function confirmDelete(kind, id) {
    const collection = { contact: 'contacts', template: 'templates', campaign: 'campaigns' }[kind];
    const item = state[collection]?.find((entry) => entry.id === id);
    if (!item) return;
    const label = { contact: '联系人', template: '模板', campaign: '演练' }[kind];
    const name = item.name;
    showModal(`<div class="modal-heading"><p class="eyebrow">删除本地记录</p><h2>删除${label}「${esc(name)}」？</h2><p>此记录会从当前浏览器的数据中移除。审计日志会保留这次删除操作。</p></div><div class="modal-actions"><button class="button button-secondary" data-action="close-modal">取消</button><button class="button button-danger" data-action="confirm-delete:${kind}:${esc(id)}">确认删除</button></div>`);
  }

  function deleteRecord(kind, id) {
    const collection = { contact: 'contacts', template: 'templates', campaign: 'campaigns' }[kind];
    const item = state[collection]?.find((entry) => entry.id === id);
    if (!item) return;
    state[collection] = state[collection].filter((entry) => entry.id !== id);
    log({ contact: '联系人', template: '模板', campaign: '演练' }[kind], `删除${{ contact: '联系人', template: '模板', campaign: '演练' }[kind]}「${item.name}」`);
    persist(); hideModal(); render(location.hash.slice(1) || 'dashboard'); toast('记录已删除。');
  }

  document.addEventListener('click', (event) => {
    const routeLink = event.target.closest('[data-route]');
    if (routeLink) { event.preventDefault(); go(routeLink.dataset.route); return; }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === 'new-contact') newContactForm();
    else if (action === 'new-template') newTemplateForm();
    else if (action === 'new-campaign') newCampaignForm();
    else if (action === 'close-modal') hideModal();
    else if (action === 'export-data') exportData();
    else if (action === 'reset-data') resetData();
    else if (action === 'confirm-reset') { state = starterState(); persist(); hideModal(); contactQuery = ''; templateQuery = ''; render('dashboard'); toast('已恢复初始示例数据。'); }
    else if (action.startsWith('unsubscribe:')) setConsent(action.split(':')[1], false);
    else if (action.startsWith('resubscribe:')) setConsent(action.split(':')[1], true);
    else if (action.startsWith('simulate:')) simulateCampaign(action.split(':')[1]);
    else if (action.startsWith('preview-template:')) previewTemplate(action.split(':')[1]);
    else if (action.startsWith('edit-template:')) { const id = action.split(':')[1]; hideModal(); newTemplateForm(state.templates.find((item) => item.id === id)); }
    else if (action.startsWith('template-menu:')) {
      const id = action.split(':')[1];
      showModal(`<div class="modal-heading"><p class="eyebrow">模板操作</p><h2>管理此模板</h2></div><div class="modal-action-stack"><button class="button button-secondary" data-action="edit-template:${esc(id)}">编辑模板</button><button class="button button-danger" data-action="delete-template:${esc(id)}">删除模板</button></div>`);
    }
    else if (action.startsWith('delete-template:')) confirmDelete('template', action.split(':')[1]);
    else if (action.startsWith('delete-contact:')) confirmDelete('contact', action.split(':')[1]);
    else if (action.startsWith('delete-campaign:')) confirmDelete('campaign', action.split(':')[1]);
    else if (action.startsWith('confirm-delete:')) { const [, kind, id] = action.split(':'); deleteRecord(kind, id); }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'contact-search') { contactQuery = event.target.value; const cursor = event.target.selectionStart; render('contacts'); const replacement = document.querySelector('#contact-search'); replacement.focus(); replacement.setSelectionRange(cursor, cursor); }
    if (event.target.id === 'template-search') { templateQuery = event.target.value; const cursor = event.target.selectionStart; render('templates'); const replacement = document.querySelector('#template-search'); replacement.focus(); replacement.setSelectionRange(cursor, cursor); }
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.id === 'contact-form') {
      event.preventDefault(); const data = new FormData(form); const name = String(data.get('name')).trim(); const alias = String(data.get('alias')).trim();
      if (!name || !alias) return;
      const contact = { id: uid(), name, alias, consent: data.get('consent') === 'on', consentAt: data.get('consent') === 'on' ? now() : null, updatedAt: now(), lastRun: null, dailyRunDate: null, dailyRuns: 0 };
      state.contacts.unshift(contact); log('联系人', `添加演示联系人「${name}」${contact.consent ? '并记录同意' : ''}`); persist(); hideModal(); render('contacts'); toast('演示联系人已添加。');
    }
    if (form.id === 'template-form') {
      event.preventDefault(); const data = new FormData(form); const id = form.dataset.id; const existing = state.templates.find((item) => item.id === id);
      const template = { id: existing?.id || uid(), name: String(data.get('name')).trim(), category: String(data.get('category')), body: String(data.get('body')).trim(), updatedAt: now() };
      if (existing) Object.assign(existing, template); else state.templates.unshift(template);
      log('模板', `${existing ? '更新' : '创建'}模板「${template.name}」`); persist(); hideModal(); render('templates'); toast('模板已保存。');
    }
    if (form.id === 'campaign-form') {
      event.preventDefault(); const data = new FormData(form); const campaign = { id: uid(), name: String(data.get('name')).trim(), templateId: String(data.get('templateId')), status: '草稿', eligible: 0, suppressed: 0, createdAt: now(), simulatedAt: null };
      state.campaigns.unshift(campaign); log('演练', `创建本地演练「${campaign.name}」`); persist(); hideModal(); go('campaigns'); toast('演练已创建，可检查资格结果。');
    }
    if (form.id === 'consent-form') {
      event.preventDefault(); const contact = state.contacts.find((item) => item.id === form.dataset.id); if (!contact || !new FormData(form).has('confirmed')) return;
      contact.consent = true; contact.consentAt = now(); contact.updatedAt = now(); log('同意', `记录联系人「${contact.name}」重新授权`); persist(); hideModal(); render(location.hash.slice(1) || 'contacts'); toast('新的同意记录已保存。');
    }
    if (form.id === 'settings-form') {
      event.preventDefault(); const data = new FormData(form); const quietStart = String(data.get('quietStart')); const quietEnd = String(data.get('quietEnd'));
      if (quietStart === quietEnd) { toast('安静时段的开始和结束时间不能相同。'); return; }
      state.settings = { dailyLimit: Math.max(1, Math.min(10, Number(data.get('dailyLimit')) || 1)), quietStart, quietEnd };
      log('规则', `更新本地演练规则：每日上限 ${state.settings.dailyLimit} 次，安静时段 ${state.settings.quietStart} 至 ${state.settings.quietEnd}`); persist(); render('settings'); toast('本地规则已保存。');
    }
  });

  document.querySelector('#mobile-menu').addEventListener('click', (event) => {
    const opened = document.querySelector('#sidebar').classList.toggle('mobile-open');
    event.currentTarget.setAttribute('aria-expanded', String(opened));
  });
  document.querySelector('#user-menu').addEventListener('click', () => toast('这是本地演示工作区，无账号登录功能。'));
  window.addEventListener('hashchange', () => render());
  window.addEventListener('storage', (event) => { if (event.key === KEY) { state = loadState(); render(); toast('检测到其他标签页更新了本地演示数据。'); } });

  render();
})();
