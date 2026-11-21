(() => {
  'use strict';
  const data = window.CHAMP_ANNOTATION_MOTION;
  if (!data) return;
  const NS = 'http://www.w3.org/2000/svg';
  const bodyEdges = [[0,1],[1,2],[6,7],[7,8],[0,6],[0,12],[6,12],[12,3],[12,9],[3,4],[4,5],[9,10],[10,11]];
  const handEdges = [[0,1],[0,2],[0,3],[0,4],[0,5]];
  const add = (parent, tag, attrs) => {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k,v]) => element.setAttribute(k, v));
    parent.append(element);
    return element;
  };
  function layer(svg, series, box, edges, handOnly = false) {
    const [[minX,minY],[maxX,maxY]] = series.bounds;
    const scale = Math.min(box.w / Math.max(.001,maxX-minX), box.h / Math.max(.001,maxY-minY));
    const offsetX = box.x + (box.w - (maxX-minX)*scale)/2 - minX*scale;
    const offsetY = box.y + (box.h - (maxY-minY)*scale)/2 - minY*scale;
    const group = add(svg, 'g', {class: handOnly ? 'annotation-hand-points' : 'annotation-body-points'});
    const lines = edges.map(([a,b]) => ({a,b,element:add(group,'line',{class:a>=13?'hand-link':'',x1:0,y1:0,x2:0,y2:0})}));
    const points = series.frames[0].map((_,i) => add(group,'circle',{r:handOnly?3.1:i>=13?2.3:3.1,class:i>=13?'hand-point':i===12?'root-point':'',cx:0,cy:0}));
    return position => {
      const i = Math.min(series.frames.length-1, Math.floor(position));
      const j = Math.min(series.frames.length-1, i+1), blend = position-i;
      const frame = series.frames[i].map((p,k) => [
        offsetX+(p[0]+(series.frames[j][k][0]-p[0])*blend)*scale,
        offsetY+(p[1]+(series.frames[j][k][1]-p[1])*blend)*scale
      ]);
      lines.forEach(({a,b,element}) => {
        element.setAttribute('x1',frame[a][0]); element.setAttribute('y1',frame[a][1]);
        element.setAttribute('x2',frame[b][0]); element.setAttribute('y2',frame[b][1]);
      });
      points.forEach((point,k) => {point.setAttribute('cx',frame[k][0]);point.setAttribute('cy',frame[k][1]);});
    };
  }
  document.querySelectorAll('.annotation-example').forEach(card => {
    const kind = card.dataset.annotation, motion = data[kind];
    const svg = card.querySelector('.annotation-skeleton svg');
    if (!motion || !svg) return;
    const draws = [];
    if (motion.body) {
      const edges = bodyEdges.slice();
      if (kind === 'body-hand') {
        edges.push([2,13],[8,19]);
        for (let finger=1; finger<=5; finger++) edges.push([13,13+finger],[19,19+finger]);
      }
      draws.push(layer(svg,motion.body,{x:35,y:21,w:290,h:278},edges));
    }
    if (kind === 'hand') motion.hands.forEach((hand,i) => {
      const box = {x:36+i*172,y:69,w:116,h:173};
      draws.push(layer(svg,hand,box,handEdges,true));
      const label = add(svg,'text',{x:94+i*172,y:278,'text-anchor':'middle',class:'annotation-hand-label'});
      label.textContent = i===0?'Left':'Right';
    });
    const render = time => draws.forEach(draw => draw(Math.min(motion.duration,Math.max(0,time))*motion.fps));
    render(0);
    const button = card.querySelector('[data-annotation-play]');
    const label = card.querySelector('h4').textContent.toLowerCase();
    let visible = false, userPaused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let playing = false, elapsed = 0, previous = null, handle = null;
    const frame = now => {
      if (!playing) return;
      if (previous !== null) elapsed = (elapsed + (now-previous)/1000) % motion.duration;
      previous = now;
      render(elapsed);
      handle = requestAnimationFrame(frame);
    };
    const sync = () => {
      playing = visible && !userPaused && !document.hidden;
      cancelAnimationFrame(handle);
      previous = null;
      if (playing) handle = requestAnimationFrame(frame);
      button.firstElementChild.textContent = playing ? 'Ⅱ' : '▶';
      button.querySelector('.annotation-play-label').textContent = playing ? 'Pause' : 'Play';
      button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${label} example`);
      button.setAttribute('aria-pressed', String(playing));
    };
    button.addEventListener('click', () => {userPaused = playing; sync();});
    new IntersectionObserver(entries => entries.forEach(entry => {
      visible = entry.isIntersecting; sync();
    }), {threshold:.25}).observe(card);
    document.addEventListener('visibilitychange', sync);
    sync();
  });
})();
