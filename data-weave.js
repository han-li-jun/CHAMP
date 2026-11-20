(() => {
  'use strict';
  const data=window.CHAMP_DATA, canvas=document.querySelector('#data-weave');
  if(!data||!canvas)return;
  const $=s=>document.querySelector(s),ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const domains=['human','robot','simulation'];
  const colors={human:'#ff5125',robot:'#568e9c',simulation:'#9e84b9'};
  const labels={human:'Human',robot:'Real robot',simulation:'Simulation'};
  const tooltip=$('#weave-tooltip');
  const cache=document.createElement('div');cache.className='weave-video-cache';cache.setAttribute('aria-hidden','true');canvas.parentElement.append(cache);
  let width=1000,height=470,offset=.12,visible=false,paused=reduced.matches,dragging=false,domain='all';
  let previous=0,lastDraw=0,lastVideoSync=0,raf=0,downX=0,downY=0,lastX=0;
  let projected=[],hovered=null,keyboardSample=null;
  const recordedMotion=window.CHAMP_WEAVE_MOTION;
  let motionTime=0;
  const emphasis={human:1,robot:1,simulation:1};
  const tourSteps=['all','human','robot','simulation'];
  const tourOverviewSeconds=.8,tourDomainSeconds=2;
  let tourEnabled=true,tourInView=false,tourElapsed=0,spotlight='all';
  canvas.dataset.highlightMode='auto';canvas.dataset.spotlight='all';
  function updateSpotlight(value){
    spotlight=value;canvas.dataset.spotlight=value;
    $('.weave-legend').classList.toggle('has-spotlight',tourEnabled&&value!=='all');
    document.querySelectorAll('[data-weave-domain]').forEach(b=>b.classList.toggle('is-spotlight',tourEnabled&&b.dataset.weaveDomain===value));
  }
  function updateEmphasis(dt){
    if(tourEnabled&&tourInView&&!paused&&!dragging&&!document.hidden&&!$('#image-dialog').open){
      tourElapsed+=dt;
      const phase=tourElapsed%(tourOverviewSeconds+3*tourDomainSeconds);
      const step=phase<tourOverviewSeconds?0:1+Math.floor((phase-tourOverviewSeconds)/tourDomainSeconds);
      const value=tourSteps[step];
      if(value!==spotlight)updateSpotlight(value);
    }
    const focus=tourEnabled?spotlight:domain;
    domains.forEach(d=>{
      const target=focus==='all'||focus===d?1:tourEnabled?.23:.06;
      if(!paused)emphasis[d]+=(target-emphasis[d])*(1-Math.exp(-dt*7));
    });
  }
  const samples=data.samples.map(sample=>{
    const img=new Image();img.src=sample.image;
    const video=document.createElement('video');
    video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;video.preload='none';
    video.setAttribute('playsinline','');video.dataset.sampleId=sample.id;cache.append(video);
    return {...sample,img,video,videoUrl:sample.video};
  });
  const groups=domains.map(d=>samples.filter(s=>s.domain===d));
  canvas.dataset.videoCount=String(samples.length);
  let tiles=[];
  function buildTiles(){
    const mobile=width<600,cols=mobile?6:10,rows=mobile?2:3;
    tiles=[];
    domains.forEach((d,k)=>{
      const count=cols*rows,pool=groups[k];
      for(let row=0;row<rows;row++)for(let i=0;i<cols;i++){
        const index=i+row*cols;
        const sampleIndex=pool.length>count?Math.round(index*(pool.length-1)/(count-1)):index%pool.length;
        tiles.push({id:`${d}-${row}-${i}`,domain:d,k,row:row-(rows-1)/2,t0:(i+(row%2)*.46)/cols,sample:pool[sampleIndex]});
      }
    });
    canvas.dataset.tileCount=String(tiles.length);
  }
  const mod=n=>(n%1+1)%1;
  function point(t,k,row=0){
    const spread=[-.29,0,.29][k],phase=[0,2.1,4.2][k];
    const arc=Math.sin(Math.PI*t);
    const x=width*(.035+t*.71);
    const y=height*.5+height*spread*(1-t)+Math.sin(t*Math.PI*1.65+phase)*arc*height*.215;
    const depth=Math.cos(t*Math.PI*1.65+phase);
    return {x,y:y+row*(width<600?23:27)*(1-.6*t),depth};
  }
  function traceRibbon(k){
    ctx.beginPath();
    for(let j=0;j<=80;j++){const p=point(j/80,k);if(!j)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
  }
  function roundRect(x,y,w,h,r=4){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  // Recorded human body and ten fingertip trajectories; pretraining poses stay intact.
  const representationEdges=[
    ['root','leftShoulder'],['root','rightShoulder'],['leftShoulder','rightShoulder'],
    ['leftShoulder','leftElbow'],['leftElbow','leftWrist'],
    ['rightShoulder','rightElbow'],['rightElbow','rightWrist'],
    ['root','leftHip'],['root','rightHip'],['leftHip','rightHip'],
    ['leftHip','leftKnee'],['leftKnee','leftAnkle'],
    ['rightHip','rightKnee'],['rightKnee','rightAnkle']
  ];
  function representationPose(){
    const time=motionTime%recordedMotion.duration;
    const framePosition=Math.min(time*recordedMotion.fps,recordedMotion.frames.length-1);
    const index=Math.floor(framePosition),next=Math.min(index+1,recordedMotion.frames.length-1),blend=framePosition-index;
    const points=recordedMotion.frames[index].map((p,i)=>p.map((v,k)=>v+(recordedMotion.frames[next][i][k]-v)*blend));
    const joints=Object.fromEntries(recordedMotion.names.slice(0,13).map((name,i)=>[name,points[i]]));
    const fingers=recordedMotion.fingersPerHand;
    const hands=[{wrist:'leftWrist',tips:points.slice(13,13+fingers)},{wrist:'rightWrist',tips:points.slice(13+fingers,13+2*fingers)}];
    const fade=recordedMotion.duration<8?.12:.22;
    const opacity=Math.min(1,(recordedMotion.duration-time)/fade,motionTime<recordedMotion.duration?1:time/fade);
    canvas.dataset.motionFrame=String(index);
    return {joints,hands,opacity};
  }
  function cubicPoint(a,b,c,d,t){
    const u=1-t;
    return [u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];
  }
  function drawRepresentation(){
    const mobile=width<600,cx=width*(mobile?.865:.875),cy=height*.5;
    const halo=ctx.createRadialGradient(cx,cy,0,cx,cy,width*.17);
    halo.addColorStop(0,'rgba(250,247,246,1)');halo.addColorStop(1,'rgba(250,247,246,0)');
    ctx.fillStyle=halo;ctx.fillRect(width*.72,cy-height*.43,width*.28,height*.86);
    const {joints,hands,opacity}=representationPose();
    const s=Math.min(width*(mobile?.20:.15)/140,(mobile?175:235)/220);
    const project=p=>[cx+p[0]*s,cy+p[1]*s];
    const body=Object.fromEntries(Object.entries(joints).map(([name,p])=>[name,project(p)]));
    const destinations=[['rightWrist','leftShoulder','leftKnee','rightAnkle'],['leftWrist','root','rightKnee','leftAnkle'],['rightShoulder','leftHip','rightHip','root']];
    ctx.save();ctx.lineCap='round';
    domains.forEach((d,k)=>{
      destinations[k].forEach((name,branch)=>{
        const source=point(.985,k,(branch-1.5)*.24),target=body[name];
        const a=[source.x,source.y],b=[width*.79,source.y+(target[1]-source.y)*.10],c=[target[0]-(mobile?12:28),target[1]];
        ctx.globalAlpha=((mobile?.035:.045)+.30*emphasis[d])*opacity;
        ctx.strokeStyle=colors[d];ctx.lineWidth=mobile?.65:.9;
        ctx.beginPath();ctx.moveTo(...a);ctx.bezierCurveTo(...b,...c,...target);ctx.stroke();
        for(let j=0;j<3;j++){
          const t=mod(offset*2.6+j/3+k*.13+branch*.19);
          const p=cubicPoint(a,b,c,target,t);
          ctx.globalAlpha=(.05+.65*emphasis[d])*Math.sin(Math.PI*t)*opacity;
          ctx.beginPath();ctx.arc(...p,mobile?.95:1.45,0,Math.PI*2);ctx.fillStyle=colors[d];ctx.fill();
        }
      });
    });
    ctx.restore();
    ctx.save();ctx.globalAlpha=opacity;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=mobile?1.25:1.8;ctx.strokeStyle='#608799';
    representationEdges.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(...body[a]);ctx.lineTo(...body[b]);ctx.stroke();});
    ctx.lineWidth=mobile?.85:1.15;ctx.strokeStyle='#b18ba8';
    hands.forEach(hand=>hand.tips.forEach(tip=>{
      const p=project(tip);ctx.beginPath();ctx.moveTo(...body[hand.wrist]);ctx.lineTo(...p);ctx.stroke();
      ctx.beginPath();ctx.arc(...p,mobile?1.2:1.8,0,Math.PI*2);ctx.fillStyle='#b18ba8';ctx.fill();
    }));
    Object.entries(body).forEach(([name,p])=>{
      ctx.beginPath();
      ctx.arc(...p,name==='root'?(mobile?3:4):(mobile?1.8:2.5),0,Math.PI*2);
      ctx.fillStyle=name==='root'?'#bc9757':'#fbf8f7';ctx.fill();
      ctx.strokeStyle=name==='root'?'#fbf8f7':'#6d93a0';ctx.lineWidth=mobile?1.2:1.7;ctx.stroke();
    });
    ctx.restore();
    ctx.textAlign='center';ctx.fillStyle='#807471';
    ctx.font=`500 ${mobile?10:12}px system-ui, sans-serif`;
    ctx.fillText('Shared motion',cx,cy-(mobile?107:147));
    ctx.font=`${mobile?8:10}px system-ui, sans-serif`;ctx.fillStyle='#aa9f9c';
    ctx.fillText('Body · hands · root',cx,cy+(mobile?108:142));
  }
  function drawTile(tile){
    const s=tile.sample,p=tile.p,mobile=width<600;
    const shrink=1-Math.max(0,tile.t-.70)*1.9;
    const fade=Math.min(1,tile.t/.045,(1-tile.t)/.12);
    const selected=hovered?.id===tile.id||keyboardSample?.id===s.id;
    const base=mobile?43:Math.min(88,width*.079);
    const w=base*shrink*(selected?1.1:1)*(1+p.depth*.065),h=w*.65;
    const alpha=Math.max(0,fade)*(.79+(p.depth+1)*.105)*emphasis[s.domain];
    tile.hit={x:p.x-w/2,y:p.y-h/2,w,h};tile.alpha=alpha;
    const ahead=point(Math.min(1,tile.t+.006),tile.k,tile.row);
    const angle=Math.max(-.20,Math.min(.20,Math.atan2(ahead.y-p.y,ahead.x-p.x)*.24));
    const media=s.video.readyState>=2?s.video:s.img;
    const mw=media.videoWidth||media.naturalWidth,mh=media.videoHeight||media.naturalHeight;
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y);ctx.rotate(angle);
    if(selected){ctx.shadowColor='#3b292424';ctx.shadowBlur=12;ctx.shadowOffsetY=3;}
    roundRect(-w/2-2,-h/2-2,w+4,h+4,4);ctx.fillStyle='#fff';ctx.fill();
    ctx.shadowColor='transparent';roundRect(-w/2,-h/2,w,h,3);ctx.save();ctx.clip();ctx.fillStyle='#e7dedc';ctx.fill();
    if(mw&&mh){const factor=Math.max(w/mw,h/mh);ctx.drawImage(media,-mw*factor/2,-mh*factor/2,mw*factor,mh*factor);}
    ctx.restore();ctx.strokeStyle=colors[s.domain];ctx.lineWidth=selected?2:1;ctx.stroke();
    if(selected){ctx.beginPath();ctx.arc(w/2-7,-h/2+7,2.3,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();}
    ctx.restore();
  }
  function draw(now,force=false){
    if(!force&&now-lastDraw<1000/30)return;
    const dt=previous?Math.min((now-previous)/1000,.08):0;previous=now;lastDraw=now;
    updateEmphasis(dt);
    if(!paused&&!dragging){
      offset+=dt*.018;
      if(visible&&!document.hidden&&!$('#image-dialog').open)motionTime+=dt;
    }
    ctx.clearRect(0,0,width,height);
    const bg=ctx.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#fcf9f8');bg.addColorStop(.5,'#f8f2f1');bg.addColorStop(1,'#fcfaf9');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    domains.forEach((d,k)=>{
      ctx.save();ctx.strokeStyle=colors[d];ctx.globalAlpha=.012+.038*emphasis[d];
      ctx.lineWidth=width<600?55:89;traceRibbon(k);ctx.stroke();
      ctx.globalAlpha=.02+.20*emphasis[d];ctx.lineWidth=.8;traceRibbon(k);ctx.stroke();ctx.restore();
    });
    drawRepresentation(now);
    projected=tiles.map(t=>{const u=mod(t.t0+offset+t.k*.13);return {...t,t:u,p:point(u,t.k,t.row)};}).sort((a,b)=>a.p.depth-b.p.depth||a.row-b.row);
    projected.forEach(drawTile);
    if(now-lastVideoSync>600){lastVideoSync=now;syncVideos();}
  }
  function syncVideos(){
    const activeScene=visible&&!paused&&!document.hidden&&!$('#image-dialog').open;
    const rank=new Map();
    projected.forEach(t=>{if((domain==='all'||t.domain===domain)&&t.alpha>.15)rank.set(t.sample.id,Math.max(rank.get(t.sample.id)??-10,t.p.depth+emphasis[t.domain]*3+(hovered?.sample.id===t.sample.id?5:0)));});
    const limit=width<600?9:18;
    const active=new Set(activeScene?[...rank].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([id])=>id):[]);
    samples.forEach(s=>{
      if(active.has(s.id)){
        if(!s.video.getAttribute('src'))s.video.src=s.videoUrl;
        if(s.video.paused)s.video.play().catch(()=>{});
      }else s.video.pause();
    });
  }
  function tick(now){raf=0;if(!visible||document.hidden)return;draw(now);if(!paused)raf=requestAnimationFrame(tick);}
  function start(){cancelAnimationFrame(raf);raf=0;previous=0;syncVideos();draw(performance.now(),true);if(visible&&!document.hidden&&!paused)raf=requestAnimationFrame(tick);}
  function resize(){
    const r=canvas.getBoundingClientRect();width=r.width;height=r.height;
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    buildTiles();draw(performance.now(),true);syncVideos();
  }
  function updatePause(){
    $('#weave-pause').textContent=paused?'Play motion':'Pause motion';$('#weave-pause').setAttribute('aria-label',paused?'Play video streams':'Pause video streams');
    canvas.dataset.motionPaused=String(paused);
  }
  function toggle(){paused=!paused;updatePause();start();}
  $('#weave-pause').addEventListener('click',toggle);updatePause();
  function preview(sample){
    $('#sample-preview-image').hidden=false;$('#sample-preview-image').src=sample.image;$('#sample-preview-image').alt=(sample.task||sample.name)+' observation';
    $('#sample-preview .small-label').textContent=labels[sample.domain]+' · data sample';
    $('#sample-preview-label').textContent=sample.task||sample.name+' · Video excerpt';
  }
  function openSample(sample){
    preview(sample);
    const modal=$('#image-dialog'),video=$('#sample-video'),photo=modal.querySelector('img');
    photo.hidden=true;video.hidden=false;video.src=sample.videoUrl;video.poster=sample.image;video.play().catch(()=>{});
    modal.querySelector('p').textContent=sample.name+' · '+(sample.task||'Original dataset video excerpt');
    modal.showModal();syncVideos();
  }
  function hit(x,y){return [...projected].reverse().find(t=>t.alpha>.15&&(domain==='all'||t.domain===domain)&&x>=t.hit.x&&x<=t.hit.x+t.hit.w&&y>=t.hit.y&&y<=t.hit.y+t.hit.h);}
  function showTooltip(sample,x,y){
    tooltip.hidden=false;tooltip.textContent=(sample.task||sample.name)+' · '+labels[sample.domain];
    tooltip.style.left=Math.max(10,Math.min(width-tooltip.offsetWidth-10,x-tooltip.offsetWidth/2))+'px';
    tooltip.style.top=Math.max(10,Math.min(height-45,y-45))+'px';
  }
  canvas.addEventListener('pointerdown',e=>{dragging=true;downX=lastX=e.clientX;downY=e.clientY;canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');tooltip.hidden=true;});
  canvas.addEventListener('pointermove',e=>{
    if(dragging){offset+=(e.clientX-lastX)/width*.85;lastX=e.clientX;hovered=null;keyboardSample=null;draw(performance.now(),true);return;}
    const r=canvas.getBoundingClientRect();hovered=hit(e.clientX-r.left,e.clientY-r.top);keyboardSample=null;
    canvas.style.cursor=hovered?'pointer':'grab';
    if(hovered)showTooltip(hovered.sample,hovered.p.x,hovered.p.y);else tooltip.hidden=true;
    if(paused)draw(performance.now(),true);
  });
  canvas.addEventListener('pointerup',e=>{
    dragging=false;canvas.classList.remove('dragging');
    if(Math.hypot(e.clientX-downX,e.clientY-downY)<7){const r=canvas.getBoundingClientRect(),t=hit(e.clientX-r.left,e.clientY-r.top);if(t)openSample(t.sample);}
  });
  canvas.addEventListener('pointercancel',()=>{dragging=false;canvas.classList.remove('dragging');});
  canvas.addEventListener('pointerleave',()=>{hovered=null;tooltip.hidden=true;if(paused)draw(performance.now(),true);});
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter','Home','End'].includes(e.key))return;e.preventDefault();
    if(e.key===' '){toggle();return;}
    const eligible=samples.filter(s=>domain==='all'||s.domain===domain);
    if(e.key==='Enter'){openSample(keyboardSample||eligible[0]);return;}
    const current=eligible.findIndex(s=>s.id===keyboardSample?.id);
    let i=e.key==='Home'?0:e.key==='End'?eligible.length-1:(current+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1)+eligible.length)%eligible.length;
    keyboardSample=eligible[i];hovered=null;canvas.dataset.activeSample=keyboardSample.id;
    const tile=projected.find(t=>t.sample.id===keyboardSample.id&&t.alpha>.4);
    showTooltip(keyboardSample,tile?.p.x||width*.35,tile?.p.y||height*.5);
    canvas.setAttribute('aria-label',`${keyboardSample.task||keyboardSample.name}, ${labels[keyboardSample.domain]} video. Press Enter to watch, arrow keys to choose another sample, Space to pause or play the streams.`);
    draw(performance.now(),true);
  });
  canvas.addEventListener('blur',()=>{keyboardSample=null;tooltip.hidden=true;if(paused)draw(performance.now(),true);});
  $('#image-dialog').addEventListener('close',syncVideos);
  document.addEventListener('visibilitychange',start);
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;start();},{rootMargin:'60px'}).observe(canvas);
  new IntersectionObserver(entries=>{
    const inView=entries[0].isIntersecting&&entries[0].intersectionRatio>=.35;
    if(inView&&!tourInView&&tourEnabled){
      tourElapsed=0;updateSpotlight('all');domains.forEach(d=>{emphasis[d]=1;});
      draw(performance.now(),true);
    }
    tourInView=inView;
  },{threshold:[0,.35]}).observe(canvas);
  reduced.addEventListener('change',e=>{if(e.matches){paused=true;updatePause();start();}});
  samples.forEach(s=>s.img.addEventListener('load',()=>{if(paused)draw(performance.now(),true);}));
  window.CHAMPDataWeave={setDomain(value){
    tourEnabled=false;domain=value;canvas.dataset.highlightMode='manual';updateSpotlight(value);
    domains.forEach(d=>{emphasis[d]=value==='all'||value===d?1:.06;});
    hovered=null;keyboardSample=null;tooltip.hidden=true;draw(performance.now(),true);syncVideos();
  }};
  resize();
})();
