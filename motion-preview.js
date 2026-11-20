(() => {
  'use strict';
  const root = document.querySelector('#motion-preview');
  const data = window.CHAMP_MOTION;
  if (!root || !data) return;
  const $ = s => root.querySelector(s);
  const svgNS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const svgEl = (tag, attrs, parent) => {
    const el = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.append(el);
    return el;
  };
  const timeLabel = i => i ? `+${data.poses[i].time.toFixed(1)} s` : 't';
  root.innerHTML = `
    <div class="motion-heading"><div class="motion-legend" aria-label="Motion targets"><span class="motion-body">Body</span><span class="motion-fingers">Fingertips</span><span class="motion-root">Root</span></div><div class="motion-tools"><button id="motion-overlay" type="button" aria-pressed="true">Skeleton on</button><button id="motion-expand" type="button" aria-label="Expand future motion viewer">⤢ Expand</button></div></div>
    <div class="motion-viewport" tabindex="0" aria-label="Future motion sequence; scroll horizontally on smaller screens"><svg class="motion-scene" viewBox="0 0 1300 640" role="img" aria-label="Integrated motion pretraining: input to VLM to five future body and hand states, with available-target supervision"></svg></div>
    <p class="motion-scroll-hint">Swipe to follow the complete flow →</p>
    <div class="motion-details"><div class="motion-hand-pair"><figure><svg class="motion-hand" data-hand="0" role="img" aria-label="Left hand at the selected future state"></svg><figcaption>Left hand</figcaption></figure><figure><svg class="motion-hand" data-hand="1" role="img" aria-label="Right hand at the selected future state"></svg><figcaption>Right hand</figcaption></figure><span>Coordinated<br>body &amp; hand motion</span></div><div class="motion-frame"><span id="motion-frame-count">Frame 00 / 05</span><strong id="motion-time">Current state</strong></div></div>
    <div class="motion-controls"><button id="motion-play" type="button" aria-label="Pause future motion animation"></button><div class="motion-timeline"><input id="motion-scrubber" type="range" min="0" max="5" step="1" value="0" aria-label="Select a future motion frame"><div class="motion-ticks" role="group" aria-label="Future time offsets"></div></div><button id="motion-replay" type="button" aria-label="Replay future motion animation">↻</button></div>`;

  const scene = $('.motion-scene');
  const defs = svgEl('defs', {}, scene);
  const gradient = svgEl('radialGradient', {id: 'motion-shadow'}, defs);
  svgEl('stop', {offset: '0%', 'stop-color': '#223039', 'stop-opacity': '.19'}, gradient);
  svgEl('stop', {offset: '100%', 'stop-color': '#223039', 'stop-opacity': '0'}, gradient);
  svgEl('path', {d: 'M470 430 H1270', stroke: '#e3eaf0', 'stroke-width': 1}, scene);
  const [cropX, cropY, cropW, cropH] = data.crop;

  const slots = [], handViews = [], ticks = [];

  // Inputs, model, decoded poses and supervision share one coordinate system.
  function text(x,y,value,cls='motion-diagram-label',parent=scene) {
    const el=svgEl('text',{x,y,class:cls},parent);el.textContent=value;return el;
  }
  function box(x,y,w,h,tone='plain') {
    const g=svgEl('g',{class:`motion-diagram-node motion-diagram-${tone}`},scene);
    svgEl('rect',{x,y,width:w,height:h,rx:10},g);return g;
  }
  const marker=svgEl('marker',{id:'motion-arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:5,markerHeight:5,orient:'auto'},defs);
  svgEl('path',{d:'M0 0 L8 4 L0 8 Z',fill:'#8ea6b9'},marker);
  const returnMarker=svgEl('marker',{id:'motion-return',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:5,markerHeight:5,orient:'auto'},defs);
  svgEl('path',{d:'M0 0 L8 4 L0 8 Z',fill:'#a68bb2'},returnMarker);
  function path(d,options={}) {return svgEl('path',{d,fill:'none',stroke:options.feedback?'#b9a6c1':'#a7bdcd','stroke-width':1.5,'stroke-dasharray':options.feedback?'4 5':'','marker-end':`url(#${options.feedback?'motion-return':'motion-arrow'})`,...options},scene);}
  function tokens(x,y,n,color) {for(let i=0;i<n;i++)svgEl('rect',{x:x+i*15,y,width:10,height:16,rx:2,fill:color,opacity:.35+(i%3)*.18},scene);}

  text(30,44,'OBSERVATION','motion-diagram-eyebrow');
  const input=box(30,62,176,111);
  svgEl('image',{href:'assets/motion/observation.png',x:39,y:70,width:158,height:94,preserveAspectRatio:'xMidYMid slice'},input);
  text(30,198,'“Lift the cushion”','motion-diagram-title');
  text(30,220,'+ wrist / pelvis pose','motion-diagram-small');
  const inputPath=path('M206 124 H226 V243 H250');
  const vlm=box(250,186,175,118,'vlm');
  text(270,216,'VLM','motion-diagram-vlm',vlm);
  text(270,240,'Qwen3-VL','motion-diagram-title',vlm);
  svgEl('rect',{x:270,y:264,width:92,height:23,rx:4,fill:'#fff0eb'},vlm);
  text(280,280,'TRAINABLE','motion-diagram-badge',vlm);
  path('M337 305 V329');
  text(258,348,'Motion tokens','motion-diagram-label');
  tokens(258,359,5,'#6495bb');tokens(340,359,5,'#a68cbd');
  text(258,394,'Body + hands','motion-diagram-small');

  text(477,55,'FUTURE BODY + HAND STATES','motion-diagram-eyebrow');
  text(1068,55,'1.0 s prediction horizon','motion-diagram-small');
  // A shared output bus fans out from the VLM's tokens into the five pose slots.
  path('M416 367 H445 V83 H1185',{'marker-end':'none',opacity:.7});
  const signalPaths=[inputPath];
  for(let i=0;i<5;i++) {
    const cx=545+i*160;
    path(`M${cx} 83 V106`,{opacity:.7});
    signalPaths.push(svgEl('path',{d:`M416 367 H445 V83 H${cx} V106`,fill:'none',stroke:'none'},scene));
  }
  const packet=svgEl('g',{class:'motion-flow-packet','aria-hidden':'true'},scene);
  const packetDots=Array.from({length:3},(_,i)=>svgEl('circle',{r:i?2.5:4,fill:i?'#b6ccdc':'#4e90bc'},packet));
  const pathLengths=signalPaths.map(p=>p.getTotalLength());
  function updateSignal(t) {
    const within=t%7600,segment=Math.floor(within/1000),active=segment<=5;
    const phase=segment===0?(within%1000)/900:(within%1000)/340;
    packet.style.opacity=playing&&active&&phase<=1?'1':'0';
    const p=signalPaths[Math.min(segment,5)],length=pathLengths[Math.min(segment,5)];
    packetDots.forEach((dot,i)=>{const at=p.getPointAtLength(Math.max(0,Math.min(1,phase-i*.045))*length);dot.setAttribute('cx',at.x);dot.setAttribute('cy',at.y);});
    vlm.classList.toggle('is-emitting',playing&&active);
  }

  // Supervision is a quiet lower lane in the same diagram, not a second panel.
  svgEl('rect',{x:26,y:490,width:1230,height:124,rx:12,fill:'#f7f9fb'},scene);
  text(44,510,'AVAILABLE-TARGET SUPERVISION','motion-diagram-eyebrow');
  const target=box(44,531,216,60);
  text(59,555,'Future motion targets','motion-diagram-title',target);
  text(59,577,'Body / hands','motion-diagram-small',target);
  path('M261 562 H308');
  const fast=box(310,531,223,60,'tokenizer');
  text(326,555,'FAST tokenizers','motion-diagram-title',fast);
  text(326,577,'Separate body / hands · fixed','motion-diagram-small',fast);
  path('M534 562 H586');
  text(605,538,'Target tokens','motion-diagram-small');
  tokens(605,548,9,'#6495bb');tokens(605,572,9,'#a68cbd');
  path('M746 562 H958');
  const loss=box(960,531,264,60,'loss');
  text(978,555,'Token cross-entropy','motion-diagram-title',loss);
  text(978,577,'Supervise annotated motion types','motion-diagram-small',loss);
  path('M416 367 H433 V472 H1092 V530');
  svgEl('rect',{x:617,y:462,width:177,height:19,fill:'#fff'},scene);
  text(630,477,'Predicted motion tokens','motion-diagram-small');
  path('M1225 561 H1282 V19 H337 V184',{feedback:true});
  svgEl('rect',{x:764,y:9,width:160,height:20,fill:'#fff'},scene);
  text(776,24,'Update VLM parameters','motion-diagram-update');

  function drawSkeleton(parent, pose, fullSize = false) {
    const overlay = svgEl('g', {class: 'motion-skeleton'}, parent);
    // Projected points share the camera and pixel coordinates of the original render.
    data.bodyEdges.forEach(([a, b]) => {
      const p = pose.body[a], q = pose.body[b];
      svgEl('line', {x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#1d6396', 'stroke-width': fullSize ? 5 : 4.6, 'stroke-opacity': 1, 'stroke-linecap': 'round'}, overlay);
    });
    pose.body.forEach(([x, y], i) => svgEl('circle', {cx: x, cy: y, r: i ? 7.2 : 8.4, fill: i ? '#1d6396' : '#c27c18', stroke: '#fff', 'stroke-width': 2.4}, overlay));
    pose.fingertips.flat().forEach(([x, y]) => svgEl('circle', {cx: x, cy: y, r: fullSize ? 5.2 : 6.5, fill: '#b82183', stroke: '#fff', 'stroke-width': 2.2}, overlay));
    return overlay;
  }

  data.poses.forEach((pose, i) => {
    const x = i === 0 ? 35 : 460 + (i - 1) * 160;
    const scale = i === 0 ? .22 : .295;
    const y = 426 - cropH * scale;
    const center = x + cropW * scale / 2;
    const slot = svgEl('g', {class: 'motion-slot', 'data-pose': i}, scene);
    const visual = svgEl('g', {class: 'motion-pose-visual'}, slot);
    svgEl('ellipse', {cx: center, cy: 426, rx: i ? 77 : 58, ry: 10, fill: 'url(#motion-shadow)'}, visual);
    const crop = svgEl('svg', {x, y, width: cropW * scale, height: cropH * scale, viewBox: `${cropX} ${cropY} ${cropW} ${cropH}`, overflow: 'hidden'}, visual);
    svgEl('image', {href: pose.asset, width: 1000, height: 1300}, crop);
    drawSkeleton(crop, pose);
    svgEl('circle', {cx: center, cy: 430, r: 3, class: 'motion-ground-dot'}, slot);
    const label = svgEl('text', {x: center, y: 451, 'text-anchor': 'middle', class: 'motion-pose-label'}, slot);
    label.textContent = i ? timeLabel(i) : 'Current · t';
    slots.push(slot);
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = i ? timeLabel(i) : 'Now';
    button.setAttribute('aria-label', i ? `Show future state at ${pose.time.toFixed(1)} seconds` : 'Show current state');
    button.addEventListener('click', () => seek(i));
    $('.motion-ticks').append(button); ticks.push(button);
  });

  [0, 1].forEach(h => {
    const svg = $(`[data-hand="${h}"]`);
    const image = svgEl('image', {width: 1000, height: 1300}, svg);
    const points = svgEl('g', {class: 'motion-skeleton'}, svg);
    handViews.push({svg, image, points});
  });

  const scrubber = $('#motion-scrubber'), viewport = $('.motion-viewport');
  const playButton = $('#motion-play');
  let frame = -1, elapsed = reduced.matches ? 5500 : 0;
  let playing = !reduced.matches, enabled = true, visible = false, loaded = false;
  let raf = 0, previous = 0, lastPan = -1;
  // Display each 0.2-second future state in turn, then hold the complete horizon.
  const frameAt = t => Math.max(0, Math.min(5, Math.floor(((t % 7600) - 360) / 1000)));

  function render() {
    updateSignal(elapsed);
    const next = frameAt(elapsed);
    if (next === frame) return;
    frame = next; root.dataset.frame = String(frame);
    slots.forEach((slot, i) => {
      slot.classList.toggle('is-revealed', i <= frame);
      slot.classList.toggle('is-current', i === frame);
      slot.classList.toggle('is-observation', i === 0);
      slot.style.setProperty('--pose-opacity', i === frame || i === 0 ? 1 : Math.max(.54, .86 - (frame - i) * .065));
      ticks[i].setAttribute('aria-pressed', String(i === frame));
      ticks[i].classList.toggle('is-past', i < frame);
    });
    const pose = data.poses[frame];
    handViews.forEach(({svg, image, points}, h) => {
      const coords = [pose.body[h ? 9 : 3], ...pose.fingertips[h]];
      const xs = coords.map(p => p[0]), ys = coords.map(p => p[1]);
      const loX = Math.min(...xs), hiX = Math.max(...xs), loY = Math.min(...ys), hiY = Math.max(...ys);
      const size = Math.max(hiX - loX, hiY - loY) + 65;
      svg.setAttribute('viewBox', `${(loX + hiX - size) / 2} ${(loY + hiY - size) / 2} ${size} ${size}`);
      image.setAttribute('href', pose.asset);
      points.replaceChildren();
      pose.fingertips[h].forEach(([x, y]) => svgEl('circle', {cx: x, cy: y, r: 3.8, fill: '#bd3b8e', stroke: '#fff', 'stroke-width': 1.4}, points));
    });
    scrubber.value = frame;
    scrubber.setAttribute('aria-valuetext', frame ? `Future frame ${frame} of 5, ${pose.time.toFixed(1)} seconds ahead` : 'Current state');
    root.style.setProperty('--motion-progress', `${frame * 20}%`);
    $('#motion-frame-count').textContent = `Frame ${String(frame).padStart(2, '0')} / 05`;
    $('#motion-time').textContent = frame ? timeLabel(frame) : 'Current state';
    scene.setAttribute('aria-label', `Motion pretraining: observation enters the VLM, which emits body and hand motion tokens and ${frame} future states. ${frame ? timeLabel(frame) : 'Current state'} selected. Available future targets supervise the VLM through fixed FAST tokenizers.`);
    panToFrame();
  }

  function panToFrame(force = false) {
    if ((!visible && !modal.open) || !enabled) return;
    if (viewport.scrollWidth <= viewport.clientWidth + 2) return;
    if (!force && lastPan === frame) return;
    lastPan = frame;
    const center = (frame ? 545 + (frame - 1) * 160 : 220) / 1300 * scene.getBoundingClientRect().width;
    viewport.scrollTo({left: center - viewport.clientWidth * .66, behavior: reduced.matches || force ? 'instant' : 'smooth'});
  }

  function tick(now) {
    raf = 0;
    if (!playing || !enabled || !visible || !loaded || document.hidden) return;
    if (previous) elapsed += Math.min(100, now - previous);
    previous = now; render(); raf = requestAnimationFrame(tick);
  }

  function sync() {
    root.dataset.playing = String(playing);
    playButton.innerHTML = playing ? '<span aria-hidden="true">Ⅱ</span>' : '<span aria-hidden="true">▶</span>';
    playButton.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} future motion animation`);
    cancelAnimationFrame(raf); raf = 0; previous = 0;
    if (playing && enabled && visible && loaded && !document.hidden) raf = requestAnimationFrame(tick);
  }

  function seek(i) { elapsed = i * 1000 + 500; playing = false; render(); sync(); }
  playButton.addEventListener('click', () => { playing = !playing; sync(); });
  $('#motion-replay').addEventListener('click', () => { elapsed = 0; playing = true; render(); sync(); });
  scrubber.addEventListener('input', () => seek(Number(scrubber.value)));
  $('#motion-overlay').addEventListener('click', e => {
    const off = root.classList.toggle('without-skeleton');
    e.currentTarget.setAttribute('aria-pressed', String(!off));
    e.currentTarget.textContent = off ? 'Skeleton off' : 'Skeleton on';
  });
  viewport.addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); playing = !playing; sync(); }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      seek(e.key === 'Home' ? 0 : e.key === 'End' ? 5 : Math.max(0, Math.min(5, frame + (e.key === 'ArrowRight' ? 1 : -1))));
    }
  });

  const modal = document.createElement('dialog');
  modal.id = 'motion-dialog'; modal.setAttribute('aria-label', 'Future body and hand motion');
  document.body.append(modal);
  const placeholder = document.createElement('div');
  $('#motion-expand').addEventListener('click', () => {
    if (modal.open) { modal.close(); return; }
    placeholder.style.height = `${root.getBoundingClientRect().height}px`;
    root.replaceWith(placeholder); modal.append(root); modal.showModal(); visible = true;
    $('#motion-expand').textContent = '⤡ Close'; $('#motion-expand').setAttribute('aria-label', 'Close expanded motion viewer');
    sync(); panToFrame(true);
  });
  modal.addEventListener('close', () => {
    placeholder.replaceWith(root);
    $('#motion-expand').textContent = '⤢ Expand'; $('#motion-expand').setAttribute('aria-label', 'Expand future motion viewer');
    sync(); panToFrame(true); $('#motion-expand').focus();
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  new IntersectionObserver(entries => {
    visible = modal.open || entries[0].isIntersecting;
    sync(); if (visible) panToFrame(true);
  }, {threshold: .08}).observe(root);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', () => panToFrame(true));
  reduced.addEventListener('change', e => { if (e.matches) { playing = false; elapsed = 5500; render(); sync(); } });

  const flow = document.querySelector('#architecture-flow');
  window.CHAMPMotion = {showStage(i) {
    enabled = i === 0; root.hidden = !enabled;
    document.querySelector('#method-panel').classList.toggle('is-pretraining',enabled);
    flow.hidden = enabled;
    sync();
  }};
  render(); sync();
  Promise.all(data.poses.map(pose => {
    const img = new Image(); img.src = pose.asset; return img.decode().catch(() => {});
  })).then(() => { loaded = true; root.dataset.loaded = 'true'; sync(); });
})();
