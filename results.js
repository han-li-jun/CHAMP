(() => {
  'use strict';
  const root = document.querySelector('#results-chart');
  const data = window.CHAMP_RESULTS;
  if (!root || !data) return;
  const NS = 'http://www.w3.org/2000/svg';
  const scroll = root.querySelector('.results-chart-scroll');
  const svg = root.querySelector('svg');
  const tooltip = root.querySelector('.results-tooltip');
  const legend = root.querySelector('.results-legend');
  const note = root.querySelector('.results-chart-note');
  const colors = ['#8da9a8', '#536c80', '#889eb4', '#aebdbc', '#ced6d7', '#a7b0bf', '#ff5125'];
  const labels = {pi05: 'π₀.₅', psi0: 'Ψ₀'};
  let selectedMethod = null, hoveredMethod = null, selectedTask = null, bars = [], taskButtons = [], lastWidth = 0;

  function node(tag, attrs, parent = svg, value) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, val));
    if (value !== undefined) el.textContent = value;
    parent.append(el);
    return el;
  }
  function label(x, y, value, className, parent = svg, anchor = 'middle') {
    return node('text', {x, y, class: className, 'text-anchor': anchor}, parent, value);
  }
  function hideTooltip() { tooltip.hidden = true; }
  function showTooltip(entry) {
    const name = labels[entry.method.id] || entry.method.name;
    tooltip.querySelector('strong').textContent = name + ' · ' + entry.task;
    tooltip.querySelector('span').textContent = entry.rate + '% · ' + entry.count + '/' + entry.total + ' successful trials';
    tooltip.hidden = false;
    const host = root.getBoundingClientRect(), box = entry.hit.getBoundingClientRect();
    const x = Math.max(10, Math.min(root.clientWidth - tooltip.offsetWidth - 10, box.x - host.x + box.width / 2 - tooltip.offsetWidth / 2));
    const y = Math.max(8, box.y - host.y - tooltip.offsetHeight - 10);
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  function emphasize() {
    const active = hoveredMethod || selectedMethod;
    const task = active ? null : selectedTask;
    root.dataset.highlight = active || 'all';
    root.dataset.highlightTask = task || 'all';
    root.querySelector('.results-overall-band').style.opacity = task && task !== 'Overall' ? .25 : 1;
    bars.forEach(entry => {
      const matches = (!active || entry.method.id === active) && (!task || entry.task === task);
      entry.group.classList.toggle('is-dim', !matches);
      entry.group.classList.toggle('show-value', matches && (task || entry.method.id === (active || 'champ')));
      entry.value.setAttribute('y', entry.valueY);
      entry.value.style.fontSize = task ? '9px' : entry.task === 'Overall' ? '12px' : '11px';
      entry.guide.setAttribute('opacity', 0);
    });
    if (task) {
      // Keep equal-height bars readable when all seven task values are revealed.
      const placed = [];
      bars.filter(entry => entry.task === task).forEach(entry => {
        const w = String(entry.rate).length * 5.7 + 9;
        let y = entry.valueY;
        while (placed.some(box => Math.abs(box.x - entry.center) < (box.w + w) / 2 + 2 && Math.abs(box.y - y) < 12)) y -= 13;
        entry.value.setAttribute('y', y);
        if (y !== entry.valueY) { entry.guide.setAttribute('y2', y + 3); entry.guide.setAttribute('opacity', .5); }
        placed.push({x: entry.center, y, w});
      });
    }
    taskButtons.forEach(entry => {
      entry.button.setAttribute('aria-pressed', String(entry.task === selectedTask));
      entry.button.classList.toggle('is-dim', !!task && entry.task !== task);
      entry.band.classList.toggle('is-selected', entry.task === task);
    });
    [...legend.children].forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.resultMethod === selectedMethod));
      button.classList.toggle('is-dim', !!active && button.dataset.resultMethod !== active);
    });
  }
  function chooseTask(task) {
    selectedTask = selectedTask === task ? null : task;
    selectedMethod = null; hoveredMethod = null;
    hideTooltip(); emphasize();
  }
  data.methods.forEach((method, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.resultMethod = method.id;
    button.style.setProperty('--method-color', colors[i]);
    button.textContent = labels[method.id] || method.name;
    button.setAttribute('aria-label', 'Highlight ' + method.name + '; select again to show all methods');
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      selectedMethod = selectedMethod === method.id ? null : method.id;
      hoveredMethod = null; selectedTask = null;
      hideTooltip(); emphasize();
    });
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hoveredMethod = method.id; emphasize(); } });
    button.addEventListener('pointerleave', () => { hoveredMethod = null; emphasize(); });
    legend.append(button);
  });

  function render() {
    hideTooltip(); bars = []; taskButtons = []; svg.replaceChildren();
    const width = Math.max(960, scroll.clientWidth);
    const height = 404, left = 38;
    const right = 20, top = 52, bottom = 328, plotHeight = bottom - top;
    const plotWidth = width - left - right;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width); svg.setAttribute('height', height);
    svg.setAttribute('aria-label', 'Overall and seven task success rates for all seven methods, together on a zero to one hundred percent scale');
    root.dataset.view = 'combined';
    const taskWidth = (plotWidth - 24) / 8.2;
    const overallWidth = taskWidth * 1.2;
    node('rect', {x: left - 9, y: top - 29, width: overallWidth + 18, height: bottom - top + 89, rx: 10, class: 'results-overall-band', 'aria-hidden': 'true'});
    const grid = node('g', {'aria-hidden': 'true'});
    label(left, 18, 'Success rate (%)', 'results-axis-title', grid, 'start');
    [0, 25, 50, 75, 100].forEach(tick => {
      const y = bottom - tick / 100 * plotHeight;
      node('line', {x1: left, x2: width - right, y1: y, y2: y, class: tick ? 'results-gridline' : 'results-baseline'}, grid);
      label(left - 10, y + 3, String(tick), 'results-tick', grid, 'end');
    });
    const tasks = ['Overall', ...data.tasks];
    tasks.forEach((task, taskIndex) => {
      const overall = taskIndex === 0;
      const groupWidth = overall ? overallWidth : taskWidth;
      const groupLeft = overall ? left : left + overallWidth + 24 + (taskIndex - 1) * taskWidth;
      const slotWidth = groupWidth * .76 / data.methods.length;
      const bandLeft = groupLeft + groupWidth * .12;
      const band = node('rect', {x: groupLeft + 2, y: top - 30, width: groupWidth - 4, height: bottom - top + 30, rx: 7, class: 'results-task-band', 'pointer-events': 'none', 'aria-hidden': 'true'});
      data.methods.forEach((method, methodIndex) => {
        const rate = overall ? method.rate : method.counts[taskIndex - 1] / data.trialsPerTask * 100;
        const total = overall ? data.tasks.length * data.trialsPerTask : data.trialsPerTask;
        const count = overall ? method.total : method.counts[taskIndex - 1];
        const center = bandLeft + (methodIndex + .5) * slotWidth;
        const barWidth = Math.min(9, taskWidth * .76 / data.methods.length * .8);
        const barHeight = rate / 100 * plotHeight, y = bottom - barHeight;
        const group = node('g', {class: 'results-bar' + (method.id === 'champ' ? ' is-champ' : ''), 'data-method': method.id, 'data-task': task, 'data-rate': rate, 'data-count': count, 'data-total': total});
        const hit = node('rect', {x: center - slotWidth / 2, y: Math.min(y, bottom - 18), width: slotWidth, height: Math.max(barHeight, 18), fill: 'transparent', class: 'results-bar-hit', tabindex: bars.length ? -1 : 0, role: 'button', 'aria-label': `${method.name}, ${task}: ${rate} percent, ${count} of ${total} successful trials`}, group);
        node('rect', {x: center - barWidth / 2, y, width: barWidth, height: barHeight, rx: 1.8, fill: colors[methodIndex], class: 'results-bar-fill', 'pointer-events': 'none'}, group);
        if (rate === 0) node('line', {x1: center - barWidth / 2, x2: center + barWidth / 2, y1: bottom, y2: bottom, stroke: colors[methodIndex], 'stroke-width': 2, 'pointer-events': 'none'}, group);
        const value = label(center, y - 10, rate + '%', 'results-bar-value', group);
        value.style.fontSize = overall ? '12px' : '11px';
        value.setAttribute('pointer-events', 'none');
        const guide = node('line', {x1: center, x2: center, y1: y - 3, y2: y - 7, stroke: colors[methodIndex], 'stroke-width': .8, opacity: 0, 'pointer-events': 'none'}, group);
        const entry = {group, hit, method, task, rate, count, total, value, guide, center, valueY: y - 10};
        bars.push(entry);
        hit.addEventListener('pointerenter', () => showTooltip(entry));
        hit.addEventListener('pointerleave', hideTooltip);
        hit.addEventListener('click', () => { if (selectedTask !== task) chooseTask(task); showTooltip(entry); });
        hit.addEventListener('focus', () => showTooltip(entry));
        hit.addEventListener('blur', hideTooltip);
        hit.addEventListener('keydown', event => {
          if (event.key === 'Escape') { hideTooltip(); return; }
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          if (['Enter', ' '].includes(event.key)) { if (selectedTask !== task) chooseTask(task); showTooltip(entry); return; }
          const index = bars.indexOf(entry);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? bars.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + bars.length) % bars.length;
          bars.forEach((bar, i) => bar.hit.setAttribute('tabindex', i === next ? 0 : -1));
          bars[next].hit.focus();
        });
      });
      const button = node('g', {class: 'results-task-button', role: 'button', tabindex: 0, 'aria-pressed': 'false', 'aria-label': `Highlight ${task} success rates; select again to show all tasks`, 'data-result-task': task});
      node('rect', {x: groupLeft + 3, y: bottom + 9, width: groupWidth - 6, height: 45, rx: 6, class: 'results-task-button-bg'}, button);
      const caption = overall ? ['Overall', '70 trials'] : task.split(' ');
      caption.forEach((word, i) => label(groupLeft + groupWidth / 2, bottom + 27 + i * 15, word, overall ? (i ? 'results-overall-detail' : 'results-overall-label') : 'results-task-label', button));
      button.addEventListener('click', () => chooseTask(task));
      button.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); chooseTask(task); }
        if (event.key === 'Escape') { selectedTask = null; hideTooltip(); emphasize(); }
      });
      taskButtons.push({task, button, band});
    });
    note.textContent = '10 trials per task · 70 trials overall';
    root.querySelector('.results-chart-scroll-hint').hidden = scroll.clientWidth >= width;
    emphasize();
  }
  scroll.addEventListener('scroll', hideTooltip, {passive: true});
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) hideTooltip(); });
  new ResizeObserver(() => {
    const width = Math.round(scroll.clientWidth);
    if (width !== lastWidth) { lastWidth = width; render(); }
  }).observe(scroll);
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) { root.classList.add('is-revealed'); observer.disconnect(); }
  }, {threshold: .15});
  observer.observe(root);
  render();
})();
