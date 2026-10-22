(() => {
  const storageKey = 'message-guard-checklist-v1';
  const checkboxes = [...document.querySelectorAll('[data-check]')];
  const count = document.querySelector('#progress-count');
  const fill = document.querySelector('#progress-fill');
  const caption = document.querySelector('#progress-caption');
  const progress = document.querySelector('[role="progressbar"]');

  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch {
    saved = {};
  }

  function update() {
    const complete = checkboxes.filter((box) => box.checked).length;
    const total = checkboxes.length;
    count.textContent = `${complete} / ${total}`;
    fill.style.width = `${(complete / total) * 100}%`;
    progress.setAttribute('aria-valuenow', String(complete));
    caption.textContent = complete === total
      ? '检查完成，可以继续完善你的流程。'
      : complete === 0
        ? '先从同意管理开始'
        : `已完成 ${complete} 项，继续检查剩余项目`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(
        Object.fromEntries(checkboxes.map((box) => [box.dataset.check, box.checked]))
      ));
    } catch {
      caption.textContent = '浏览器未保存进度；当前勾选仍可使用。';
    }
  }

  checkboxes.forEach((box) => {
    box.checked = saved[box.dataset.check] === true;
    box.addEventListener('change', update);
  });
  document.querySelector('#reset-checklist').addEventListener('click', () => {
    checkboxes.forEach((box) => { box.checked = false; });
    try { localStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
    update();
    checkboxes[0].focus();
  });
  update();
})();
