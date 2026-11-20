(() => {
  'use strict';
  const root = document.querySelector('#architecture-flow');
  if (!root) return;
  const NS = 'http://www.w3.org/2000/svg';
  const palette = ['#477eaa','#8f4431','#8671b0','#b47883'];
  const layerNumbers = [4,12,20,28];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const names = ['Motion pretraining','Action grounding','Task fine-tuning'];
  const stories = [
    [
      ['Observe','An RGB image, instruction, and available current pose information enter the VLM.'],
      ['Predict','The trainable VLM predicts future body and hand motion tokens.'],
      ['Encode targets','Separate, fixed FAST tokenizers encode the available body and hand motion targets.'],
      ['Supervise','Token cross-entropy updates the VLM. Only annotated motion types contribute to supervision.']
    ],
    [
      ['Read features','Read the same input-token position at layers 4, 12, 20, and 28. Frozen final normalization is applied to each readout.'],
      ['Score pairs','Concatenate the four features. The joint MLP router scores all 4 × 8 layer–expert pairs.'],
      ['Select routes','Select two experts per layer. Log-sum-exp of their scores ranks the layers; keep the top two layers.'],
      ['Project','Four active experts project their own layer’s feature into the action model’s hidden space.'],
      ['Weight & fuse','One softmax over the four original expert scores gives α₁…α₄. Sum the four weighted projections.'],
      ['Generate actions','Fused token features and robot state condition the flow-matching DiT, which generates body and hand actions.']
    ],
    [
      ['Task demonstrations','Aligned observations, instructions, robot states, and actions provide task-specific supervision.'],
      ['Frozen backbone','The motion-pretrained VLM stays frozen. Its features condition the grounded action expert.'],
      ['Fine-tune CAE','Task demonstrations fine-tune only CAE, adapting its feature selection and action generation while the VLM remains frozen.'],
      ['Execute','The generated motion latent and bilateral hand targets are sent to the SONIC whole-body controller and hand-control interfaces, respectively.']
    ]
  ];
  root.innerHTML = '<div class="flow-toolbar"><div><span class="flow-live-dot"></span><span id="flow-stage-label"></span><span class="flow-kind">DATA FLOW</span></div><div class="flow-tools"><button id="flow-play" type="button">Pause</button><button id="flow-replay" type="button" aria-label="Replay architecture animation">↻ Replay</button><button id="flow-expand" type="button" aria-label="Expand animated architecture">⤢ Expand</button></div></div><div class="flow-scroll" tabindex="0" aria-label="Animated architecture diagram; scroll horizontally on smaller screens"><svg class="flow-svg" viewBox="0 0 1160 620" role="img"></svg></div><p class="flow-scroll-hint">Scroll horizontally to follow the flow →</p><div class="flow-steps" role="group" aria-label="Animation steps"></div><div class="flow-caption"><span id="flow-step-number"></span><p id="flow-explanation"></p></div><div class="flow-bottom"><span id="flow-note"></span></div>';
  const svg = root.querySelector('svg');
  const scrollArea = root.querySelector('.flow-scroll');
  const stepContainer = root.querySelector('.flow-steps');
  const modal = document.querySelector('#architecture-dialog');
  const home = root.parentElement;
  const placeholder = document.createElement('div');
  let stage=0, elapsed=0, phase=-1, cycle=-1, playing=!reduced, visible=false, raf=0, previous=0;
  let wires=[], nodes=[], customUpdate=()=>{}, durations=[], sceneGroup, wireGroup, particleGroup;
  let executionVideos=[], lastMediaSync=-Infinity;
  const $ = s => root.querySelector(s);
  function el(tag,attrs={},parent=sceneGroup) {
    const n=document.createElementNS(NS,tag);
    Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));
    if(parent)parent.append(n);
    return n;
  }
  function text(x,y,value,cls='flow-label',parent=sceneGroup,anchor='start') {
    const n=el('text',{x,y,class:cls,'text-anchor':anchor},parent);n.textContent=value;return n;
  }
  function box(x,y,w,h,title,subtitle,phases,tone='neutral') {
    const g=el('g',{class:'flow-node flow-node-'+tone});
    el('rect',{x,y,width:w,height:h,rx:12,class:'flow-node-bg'},g);
    if(title)text(x+18,y+29,title,'flow-node-title',g);
    if(subtitle)text(x+18,y+49,subtitle,'flow-small',g);
    if(phases)nodes.push({el:g,phases});
    return g;
  }
  function badge(x,y,label,tone='frozen',parent=sceneGroup) {
    const w=label.length*6.2+18;
    el('rect',{x,y:y-13,width:w,height:20,rx:4,class:'flow-badge-'+tone},parent);
    text(x+9,y+1,label,'flow-badge-text flow-badge-text-'+tone,parent);
  }
  function wire(d,phases,color='#927871',options={}) {
    const group=el('g',{},wireGroup);
    el('path',{d,fill:'none',stroke:color,'stroke-width':options.width||1.6,opacity:.22,'stroke-dasharray':options.dashed?'5 5':'',class:'flow-wire-base'},group);
    const bright=el('path',{d,fill:'none',stroke:color,'stroke-width':options.width||2,opacity:0,'stroke-dasharray':options.dashed?'5 5':'',class:'flow-wire-active'},group);
    const dots=Array.from({length:options.dashed?2:3},()=>el('circle',{r:options.dashed?2.5:3.2,fill:color,opacity:0},particleGroup));
    const entry={path:bright,dots,phases,color,length:bright.getTotalLength(),when:options.when||(()=>true)};
    wires.push(entry);return entry;
  }
  function changeWire(entry,d){entry.path.setAttribute('d',d);entry.path.previousSibling.setAttribute('d',d);entry.length=entry.path.getTotalLength();}
  function bars(x,y,n,color,parent=sceneGroup,width=12,height=23,gap=5) {
    return Array.from({length:n},(_,i)=>el('rect',{x:x+i*(width+gap),y,width,height,rx:2,fill:color,opacity:.25+(i%3)*.13},parent));
  }
  function sourceBox(x,y,title,subtitle,phases,poster) {
    const g=box(x,y,238,107,'','',phases);
    el('image',{x:x+12,y:y+12,width:84,height:82,href:poster,preserveAspectRatio:'xMidYMid slice',class:'flow-photo'},g);
    text(x+109,y+35,title,'flow-label',g);
    subtitle.forEach((line,i)=>text(x+109,y+57+i*18,line,'flow-small',g));
    return g;
  }
  function recordedVideo(x,y,width,height,stem,label,parent){
    const frame=el('foreignObject',{x,y,width,height},parent);
    const video=document.createElementNS('http://www.w3.org/1999/xhtml','video');
    video.className='flow-recorded-video';video.dataset.recording=stem;
    video.src='assets/hardware/'+stem+'.mp4';video.poster='assets/hardware/'+stem+'-poster.jpg';
    video.muted=true;video.defaultMuted=true;video.playsInline=true;video.loop=true;video.preload='metadata';
    video.setAttribute('playsinline','');video.setAttribute('aria-label',label);
    frame.append(video);executionVideos.push(video);
    video.addEventListener('loadedmetadata',()=>syncExecutionMedia(true));
    return video;
  }
  function syncExecutionMedia(force=false){
    if(!executionVideos.length)return;
    const active=playing&&visible&&!document.hidden;
    executionVideos.forEach(video=>{
      // These are separate recordings, sharing controls but retaining their own loop lengths.
      const target=Number.isFinite(video.duration)&&video.duration>0?(elapsed/1000)%video.duration:0;
      if(video.readyState>=1&&(force||Math.abs(video.currentTime-target)>.18))video.currentTime=target;
      if(active&&video.paused)video.play().catch(()=>{});
      else if(!active&&!video.paused)video.pause();
    });
    lastMediaSync=performance.now();
  }
  function buildGrounding(){
    svg.setAttribute('aria-label','Action grounding: four frozen VLM feature readouts branch to a joint router and their own layer-specific experts. Four selected projections are weighted by a single softmax and fused to condition an action DiT.');
    el('rect',{x:327,y:27,width:806,height:550,rx:18,class:'flow-cae-region'});
    text(350,52,'COORDINATION-ORIENTED ACTION EXPERT','flow-section-label');
    badge(1029,49,'TRAINABLE','trainable');
    const input=box(27,53,239,86,'RGB + instruction','Wrist and pelvis pose',[0]);
    const vlm=box(27,176,239,340,'Qwen3-VL','Motion-pretrained backbone',[0],'frozen');
    badge(166,202,'FROZEN','frozen',vlm);
    wire('M146 139 V176',[0],'#6c8da1');
    const ys=[279,341,403,465];
    const layerGroups=ys.map((y,r)=>{
      const g=el('g',{class:'flow-layer',style:'--layer:'+palette[r]},vlm);
      el('rect',{x:46,y:y-20,width:200,height:40,rx:6,fill:palette[r],'fill-opacity':.09,stroke:palette[r],'stroke-opacity':.3},g);
      text(60,y+5,'Layer '+layerNumbers[r],'flow-layer-label',g);
      bars(143,y-8,5,palette[r],g,9,16,5);
      text(254,y+4,'•','flow-port',g,'middle');
      wire('M246 '+y+' H471',[0,3],palette[r],{when:p=>p===0||activeLayers.includes(r)});
      wire('M266 '+y+' C302 '+y+' 300 '+(101+r*14)+' 349 '+(101+r*14),[0,1],palette[r]);
      return g;
    });
    text(46,544,'Same token position across all four layers','flow-small');
    text(46,564,'Each readout → frozen final normalization','flow-tiny');
    const router=box(349,72,365,124,'Joint router','Concatenate → MLP → 4 × 8 scores',[1,2],'router');
    const cells=[];
    for(let r=0;r<4;r++){
      text(368,135+r*14,'L'+layerNumbers[r],'flow-micro',router);
      for(let e=0;e<8;e++) cells.push({r,e,el:el('rect',{x:402+e*22,y:125+r*14,width:17,height:9,rx:2,fill:palette[r],opacity:.22},router)});
    }
    text(607,140,'Top 2 experts','flow-micro',router);
    text(607,157,'→ log-sum-exp','flow-micro',router);
    text(607,174,'→ top 2 layers','flow-micro',router);
    const soft=box(793,72,150,88,'One softmax','4 active scores',[4],'router');
    wire('M714 113 H793',[2,4],'#8b77ab',{dashed:true});
    text(471,238,'LINEAR EXPERTS · 8 PER LAYER','flow-section-label');
    let activeLayers=[0,2], selected=Array.from({length:4},(_,r)=>[r,(r+3)%8]);
    const banks=[],experts=[];
    ys.forEach((y,r)=>{
      const bank=el('g',{class:'flow-expert-bank',style:'--layer:'+palette[r]});
      el('rect',{x:471,y:y-22,width:231,height:44,rx:7,fill:palette[r],'fill-opacity':.035,stroke:palette[r],'stroke-opacity':.15},bank);
      for(let e=0;e<8;e++){
        const g=el('g',{class:'flow-expert'},bank);
        el('rect',{x:479+e*27,y:y-14,width:22,height:28,rx:3,fill:palette[r],'fill-opacity':.08,stroke:palette[r],'stroke-opacity':.16},g);
        text(490+e*27,y+4,String(e+1),'flow-expert-number',g,'middle');
        experts.push({r,e,el:g});
      }
      banks.push(bank);
      wire('M695 196 H737 V'+(y-29)+' H678 V'+(y-22),[2],palette[r],{dashed:true,when:()=>activeLayers.includes(r)});
    });
    el('rect',{x:785,y:239,width:85,height:224,rx:10,fill:'none',stroke:'#d8d0e1','stroke-dasharray':'3 4'});
    text(786,226,'GATING WEIGHTS','flow-micro');
    const weightY=[271,327,383,439],weightGroups=[];
    const outputWires=[];
    weightY.forEach((y,k)=>{
      const g=el('g',{class:'flow-weight'});
      el('rect',{x:797,y:y-18,width:61,height:36,rx:7,fill:'#f3eff8',stroke:'#d4c9e3'},g);
      text(827.5,y+5,'× α'+['₁','₂','₃','₄'][k],'flow-alpha',g,'middle');
      weightGroups.push(g);
      outputWires.push(wire('M702 279 C751 279 755 '+y+' 797 '+y,[3,4],palette[Math.floor(k/2)]));
      wire('M858 '+y+' C884 '+y+' 880 355 903 355',[4],'#8b77ab');
    });
    wire('M868 160 V211 H827 V239',[4],'#8b77ab',{dashed:true});
    text(796,493,'Σ α = 1','flow-small');
    text(793,513,'Symbolic weights','flow-tiny');
    const sum=el('g',{class:'flow-sum'});el('circle',{cx:920,cy:355,r:19,fill:'#f4eae8',stroke:'#ec967f'},sum);
    text(920,362,'Σ','flow-sum-symbol',sum,'middle');nodes.push({el:sum,phases:[4,5]});
    wire('M939 355 H970',[4,5],'#d9603f');
    text(950,401,'fᵢ','flow-fused-label',sceneGroup,'middle');
    const dit=box(970,282,143,133,'Action DiT','Flow matching',[5],'action');
    bars(988,353,5,'#ef704f',dit,13,28,8);
    const state=box(971,183,142,66,'Robot state','+ noise and time',[5]);
    wire('M1041 249 V282',[5],'#a6796d');
    const actions=box(970,466,143,93,'Action chunk','',[5],'action');
    text(987,516,'Body latent z','flow-small',actions);
    text(987,537,'Left + right hands','flow-small',actions);
    wire('M1041 415 V466',[5],'#d9603f');
    text(472,545,'Each expert receives its own layer’s feature','flow-tiny');
    customUpdate=(p,c)=>{
      const patterns=[[0,2],[1,3],[0,3],[1,2]];
      activeLayers=patterns[c%patterns.length];
      selected=Array.from({length:4},(_,r)=>[(r+c)%8,(r+c+3)%8]);
      cells.forEach(cell=>{
        const candidate=selected[cell.r].includes(cell.e),kept=activeLayers.includes(cell.r)&&candidate;
        cell.el.setAttribute('opacity',p<1?.16:p===1?.28+((cell.r*3+cell.e)%5)*.13:kept?.95:candidate?.48:.12);
        cell.el.setAttribute('stroke',p>=2&&kept?palette[cell.r]:'none');
      });
      experts.forEach(e=>{e.el.classList.toggle('is-selected',p>=2&&activeLayers.includes(e.r)&&selected[e.r].includes(e.e));});
      banks.forEach((g,r)=>g.classList.toggle('is-selected',p>=2&&activeLayers.includes(r)));
      layerGroups.forEach((g,r)=>g.classList.toggle('is-selected',p>=2&&activeLayers.includes(r)));
      weightGroups.forEach(g=>g.classList.toggle('is-on',p>=4));
      outputWires.forEach((w,k)=>{
        const r=activeLayers[Math.floor(k/2)],sy=ys[r]+(k%2?9:-9),dy=weightY[k];
        changeWire(w,'M702 '+sy+' C747 '+sy+' 751 '+dy+' 797 '+dy);
        w.path.setAttribute('stroke',palette[r]);w.path.previousSibling.setAttribute('stroke',palette[r]);w.dots.forEach(d=>d.setAttribute('fill',palette[r]));
      });
    };
  }
  function buildPretrain(){
    svg.setAttribute('aria-label','Motion pretraining: RGB, instruction, and current pose enter a trainable VLM. Predicted motion tokens are supervised by available body and hand motion targets encoded with fixed FAST tokenizers.');
    sourceBox(30,107,'RGB image',['Instruction','Current pose'],[0],'assets/poster/fruit.jpg');
    const vlm=box(379,103,303,238,'Qwen3-VL','Predict future motion tokens',[0,1,3],'frozen');
    badge(563,129,'TRAINABLE','trainable',vlm);
    for(let j=0;j<4;j++)el('rect',{x:408,y:182+j*28,width:244,height:17,rx:4,fill:'#92b3cc',opacity:.18+j*.11},vlm);
    wire('M268 160 H379',[0],'#6c8da1');
    const pred=box(806,107,294,175,'Predicted motion tokens','Autoregressive prediction',[1],'router');
    text(825,181,'Body','flow-small',pred);bars(884,164,8,'#5d91bb',pred,16,22,7);
    text(825,231,'Hands','flow-small',pred);bars(884,214,8,'#9277b7',pred,16,22,7);
    wire('M682 195 H806',[1],'#8a77aa');
    text(30,385,'AVAILABLE FUTURE MOTION TARGETS','flow-section-label');
    const body=box(30,409,207,70,'Body motion','Pelvis + body joints',[2]);
    const hand=box(30,509,207,70,'Hand motion','Wrists + fingertips',[2]);
    const bt=box(315,409,206,70,'Body FAST tokenizer','Fixed tokenizer',[2],'frozen');
    const ht=box(315,509,206,70,'Hand FAST tokenizer','Fixed tokenizer',[2],'router');
    wire('M237 444 H315',[2],palette[0]);wire('M237 544 H315',[2],palette[2]);
    bars(586,430,7,palette[0],sceneGroup,15,27,7);bars(586,530,7,palette[2],sceneGroup,15,27,7);
    wire('M521 444 H580',[2],palette[0]);wire('M521 544 H580',[2],palette[2]);
    const loss=box(817,398,283,132,'Token cross-entropy','Only annotated motion types',[3],'action');
    text(837,484,'Supervise the available targets','flow-small',loss);
    wire('M953 282 V398',[1,3],'#8b77ab');
    wire('M740 444 H817',[2,3],palette[0]);wire('M740 544 H778 Q790 544 790 512 V491 H817',[2,3],palette[2]);
    wire('M958 530 V601 H531 V341',[3],'#bc9264',{dashed:true});
    text(575,594,'Update VLM parameters','flow-small');
    customUpdate=()=>{};
  }
  function buildFinetune(){
    svg.setAttribute('aria-label','Task fine-tuning: task demonstrations supervise CAE while the motion-pretrained VLM stays frozen. The generated motion latent and bilateral hand targets are sent to the SONIC whole-body controller and hand-control interfaces, respectively.');
    const dataBox=box(28,94,250,393,'Task demonstrations','Aligned observations and actions',[0]);
    recordedVideo(45,162,216,162,'wash-close-ego','Real robot egocentric recording: loading the washing machine',dataBox);
    ['RGB + instruction','Wrist / pelvis pose','Robot joint state','Body + hand action targets'].forEach((s,i)=>text(47,354+i*34,s,'flow-label',dataBox));
    const vlm=box(386,80,330,120,'Motion-pretrained VLM','Features from four layers',[1],'frozen');
    badge(604,164,'FROZEN','frozen',vlm);bars(407,151,7,'#729ab6',vlm,15,19,9);
    wire('M278 192 H326 V140 H386',[0,1],'#6c8da1');
    const cae=box(386,293,330,222,'Action expert · CAE','Fine-tune for the target task',[2],'router');
    badge(621,319,'TRAINABLE','trainable',cae);
    const labels=['Router + layer-specific experts','Weighted feature fusion','Flow-matching action DiT'];
    labels.forEach((s,i)=>{el('rect',{x:405,y:367+i*43,width:292,height:33,rx:5,fill:i===2?'#f3e7e4':'#f0edf5',stroke:'#dfdbe7'},cae);text(418,388+i*43,s,'flow-small',cae);});
    wire('M536 200 V293',[1,2],'#8b77ab');
    text(547,253,'Frozen features','flow-small');
    wire('M278 394 H386',[0,2],'#99746b');
    wire('M153 487 V561 H551 V515',[0,2],'#d9603f',{dashed:true});
    text(278,552,'Task supervision · update CAE only','flow-small');
    const bodyOutput=box(826,80,300,270,'Body motion latent → SONIC','Whole-body controller',[3],'action');
    bodyOutput.classList.add('flow-recorded-output');
    recordedVideo(844,153,264,148.5,'laundry-demo','Third-person washing-machine demonstration',bodyOutput);
    text(976,337,'Unitree G1','flow-small',bodyOutput,'middle');
    const handOutput=box(826,382,300,200,'Left + right hand commands','Hand-control interfaces',[3],'action');
    [842,907].forEach((x,i)=>{
      const viewport=el('svg',{x,y:438,width:65,height:112,viewBox:'170 65 450 685',class:'flow-hardware-hand','aria-label':(i?'Right':'Left')+' Dex3-1 hand'},handOutput);
      const orientation=el('g',i===0?{transform:'translate(800 0) scale(-1 1)'}:{},viewport);
      el('image',{x:0,y:0,width:800,height:800,href:'assets/hardware/dex3-1-official.png'},orientation);
    });
    text(907,569,'Dex3-1 × 2','flow-small',handOutput,'middle');
    el('line',{x1:980,x2:980,y1:447,y2:548,stroke:'#e6d2cd'},handOutput);
    [986,1051].forEach((x,i)=>{
      const wuji=el('svg',{x,y:438,width:62,height:112,viewBox:'31 92 1228 1608',class:'flow-hardware-hand','aria-label':(i?'Right':'Left')+' Wuji Hand 2'},handOutput);
      const orientation=el('g',i?{transform:'translate(1290 0) scale(-1 1)'}:{},wuji);
      el('image',{x:0,y:0,width:1274,height:1700,href:'assets/hardware/wuji-hand2.webp'},orientation);
    });
    text(1050,569,'Wuji Hand 2 × 2','flow-small',handOutput,'middle');
    wire('M716 391 H770 V215 H826',[3],'#d9603f');
    wire('M716 464 H793 V482 H826',[3],'#d9603f');
    text(826,54,'COORDINATED EXECUTION','flow-section-label');
    customUpdate=()=>{};
  }
  function build(i){
    stage=i;elapsed=0;phase=-1;cycle=-1;wires=[];nodes=[];
    executionVideos.forEach(video=>video.pause());executionVideos=[];lastMediaSync=-Infinity;
    svg.replaceChildren();
    const defs=el('defs',{},svg);
    const filter=el('filter',{id:'flow-glow',x:'-100%',y:'-100%',width:'300%',height:'300%'},defs);
    el('feGaussianBlur',{in:'SourceGraphic',stdDeviation:2.4},filter);
    wireGroup=el('g',{},svg);sceneGroup=el('g',{},svg);particleGroup=el('g',{class:'flow-particles'},svg);
    // The faint paths sit behind nodes; packets are painted above the diagram.
    [buildPretrain,buildGrounding,buildFinetune][i]();
    durations=stories[i].map(()=>i===1?2200:2700);
    $('#flow-stage-label').textContent=names[i];
    $('#flow-note').textContent=i===1?'Illustrative token routing · weights shown symbolically':'Schematic of the training and control flow';
    root.dataset.architectureStage=String(i);
    stepContainer.replaceChildren(...stories[i].map(([title],j)=>{
      const b=document.createElement('button');b.type='button';b.innerHTML='<span>'+String(j+1).padStart(2,'0')+'</span>'+title;
      b.addEventListener('click',()=>{elapsed=durations.slice(0,j).reduce((a,b)=>a+b,0)+durations[j]*.5;playing=false;render();syncPlayback();if(scrollArea.scrollWidth>scrollArea.clientWidth){const centers=i===1?[180,530,600,700,865,1040]:[150,535,640,960];scrollArea.scrollTo({left:centers[Math.min(j,centers.length-1)]/1160*svg.getBoundingClientRect().width-scrollArea.clientWidth/2,behavior:reduced?'instant':'smooth'});}});
      return b;
    }));
    if(reduced&&!playing)elapsed=durations.slice(0,-1).reduce((a,b)=>a+b,0)+700;
    render();syncPlayback();
  }
  function render(){
    if(performance.now()-lastMediaSync>250)syncExecutionMedia();
    const total=durations.reduce((a,b)=>a+b,0),within=elapsed%total,nextCycle=Math.floor(elapsed/total);
    let p=0,start=0;while(p<durations.length-1&&within>=start+durations[p]){start+=durations[p++];}
    const local=(within-start)/durations[p];
    if(p!==phase||cycle!==nextCycle){
      phase=p;cycle=nextCycle;root.dataset.phase=String(p);
      customUpdate(p,cycle);
      nodes.forEach(n=>n.el.classList.toggle('is-on',n.phases.includes(p)));
      [...stepContainer.children].forEach((b,j)=>{b.classList.toggle('active',j===p);b.setAttribute('aria-pressed',String(j===p));});
      $('#flow-step-number').textContent=String(p+1).padStart(2,'0')+' / '+String(stories[stage].length).padStart(2,'0');
      $('#flow-explanation').textContent=stories[stage][p][1];
    }
    wires.forEach(w=>{
      const active=w.phases.includes(p)&&w.when(p);
      w.path.setAttribute('opacity',active?.9:0);
      w.dots.forEach((dot,k)=>{
        dot.setAttribute('opacity',active?.95:0);if(!active)return;
        const progress=(local*1.5+k/3)%1,point=w.path.getPointAtLength(progress*w.length);
        dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);
      });
    });
    root.style.setProperty('--flow-progress',(within/total*100)+'%');
  }
  function tick(now){raf=0;if(!playing||!visible||document.hidden)return;if(previous)elapsed+=Math.min(now-previous,80);previous=now;render();raf=requestAnimationFrame(tick);}
  function syncPlayback(){
    root.dataset.playing=String(playing);$('#flow-play').textContent=playing?'Ⅱ Pause':'▶ Play';$('#flow-play').setAttribute('aria-label',playing?'Pause data-flow animation':'Play data-flow animation');
    syncExecutionMedia(true);
    cancelAnimationFrame(raf);raf=0;previous=0;if(playing&&visible&&!document.hidden)raf=requestAnimationFrame(tick);
  }
  $('#flow-play').addEventListener('click',()=>{playing=!playing;syncPlayback();});
  $('#flow-replay').addEventListener('click',()=>{elapsed=0;playing=true;render();syncPlayback();});
  $('#flow-expand').addEventListener('click',()=>{
    if(modal.open){modal.close();return;}
    placeholder.style.height=root.getBoundingClientRect().height+'px';root.replaceWith(placeholder);modal.querySelector('.architecture-dialog-body').append(root);
    $('#flow-expand').textContent='⤡ Close';$('#flow-expand').setAttribute('aria-label','Close expanded architecture');modal.showModal();visible=true;syncPlayback();
  });
  modal.addEventListener('close',()=>{placeholder.replaceWith(root);$('#flow-expand').textContent='⤢ Expand';$('#flow-expand').setAttribute('aria-label','Expand animated architecture');syncPlayback();$('#flow-expand').focus();});
  modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
  new IntersectionObserver(entries=>{visible=modal.open||entries[0].isIntersecting;syncPlayback();},{threshold:.05}).observe(root);
  document.addEventListener('visibilitychange',syncPlayback);
  window.CHAMPArchitecture={showStage:i=>build(i)};
  build(0);
})();
