(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play = video => { if (!reduceMotion) video.play().catch(() => {}); };
  const hero = $('#hero-video');
  const updateHeroLabel=()=>{const clip=window.CHAMP_HERO?.find(c=>hero.currentTime<c.end);if(clip)$('#hero-clip-label').textContent=clip.label;};
  hero.addEventListener('timeupdate',updateHeroLabel);updateHeroLabel();
  if (reduceMotion) hero.pause();
  const setHeroButton = () => { $('#hero-pause .pause-symbol').textContent = hero.paused ? '▶' : 'Ⅱ'; $('#hero-pause .pause-label').textContent = hero.paused ? 'Play' : 'Pause'; $('#hero-pause').setAttribute('aria-label', hero.paused ? 'Play background video' : 'Pause background video'); };
  let heroUserPaused = reduceMotion;
  $('#hero-pause').addEventListener('click', () => { heroUserPaused = !hero.paused; if (hero.paused) hero.play().catch(()=>{}); else hero.pause(); setHeroButton(); });
  hero.addEventListener('play', setHeroButton); hero.addEventListener('pause', setHeroButton); setHeroButton();
  new IntersectionObserver(entries => entries.forEach(e => { if (!e.isIntersecting) hero.pause(); else if (!heroUserPaused) play(hero); }), {threshold:.05}).observe(hero);

  const tasks = [
    {id:'fruit',name:'Fruit collection',description:'Reach for fruit and place it into a basket.',views:[['fruit','External view']]},
    {id:'bed',name:'Bed making',description:'Coordinate body posture and both hands to handle bedding.',views:[['bed','External view']]},
    {id:'laundry',name:'Laundry loading',description:'Place clothes into the washing machine.',views:[['laundry','External view']]},
    {id:'popcorn-wide',name:'Popcorn serving',description:'Use a scoop to fill a paper cup with popcorn, then place the cup on the table.',views:[['popcorn-wide','Wide view'],['popcorn-close','Close view']]},
    {id:'wipe',name:'Table wiping',description:'Use a cloth to wipe spilled cola off the table.',views:[['wipe','External view'],['wipe-ego','Robot view']]},
    {id:'drink',name:'Drink dispensing',description:'Pick up a cup and fill it with cola from the dispenser.',views:[['drink','External view'],['drink-ego','Robot view']]},
    {id:'shelf',name:'Shelf placement',description:'Lift and place a bag on a shelf.',views:[['shelf','External view'],['shelf-ego','Robot view']]}
  ];
  let selectedTask = 0;
  const demo = $('#demo-video');
  function setDemoView(task, index, autoplay) {
    const [file,label] = task.views[index];
    $('#demo-speed').hidden = task.id === 'popcorn-wide';
    demo.src = `assets/video/${file}.mp4`; demo.poster = `assets/poster/${file}.jpg`;
    demo.setAttribute('aria-label', `${task.name}, ${label.toLowerCase()}`);
    $('.demo-backdrop').style.backgroundImage = `url("assets/poster/${file}.jpg")`;
    $$('#view-switch button').forEach((b,i) => {b.classList.toggle('active',i===index);b.setAttribute('aria-pressed',String(i===index));});
    if (autoplay) play(demo);
  }
  function chooseTask(index, autoplay = true) {
    selectedTask = index; const task = tasks[index];
    $$('.demo-thumb').forEach((b,i) => {b.setAttribute('aria-selected',String(i===index));b.tabIndex = i===index ? 0 : -1;});
    $('#demo-name').textContent = task.name; $('#demo-description').textContent = task.description;
    $('#view-switch').replaceChildren();
    if (task.views.length>1) task.views.forEach(([file,label],i) => {const b=document.createElement('button');b.textContent=label;b.addEventListener('click',()=>setDemoView(task,i,true));$('#view-switch').append(b);});
    setDemoView(task,0,autoplay);
  }
  tasks.forEach((task,i) => {
    const button = document.createElement('button'); button.className='demo-thumb';button.setAttribute('role','tab');button.setAttribute('aria-controls','demo-video');button.setAttribute('aria-selected',String(i===0));button.tabIndex=i===0?0:-1;
    const img = document.createElement('img');img.src=`assets/poster/${task.id}.jpg`;img.alt='';img.loading='lazy';img.width=160;img.height=100;
    const label=document.createElement('span');label.textContent=task.name;button.append(img,label);
    button.addEventListener('click',()=>chooseTask(i));button.addEventListener('keydown',event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tasks.length-1:(i+(event.key==='ArrowRight'?1:-1)+tasks.length)%tasks.length;chooseTask(next);$$('.demo-thumb')[next].focus();});
    $('#demo-picker').append(button);
  });
  chooseTask(0,false);
  new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)play(demo);else demo.pause();}),{threshold:.35}).observe(demo);

  const stages=[
    {title:'Predict future body and hand motion.',description:'The vision-language model uses RGB image input, an instruction prompt, and pose information to predict future body and hand motion. Body and hand motion are encoded separately.',chips:['Human + robot data','Body + hand motion']},
    {title:'Read the right motion features for each input.',description:'The frozen motion-pretrained model supplies features from multiple layers. CAE jointly selects source layers and projection experts, then fuses their outputs to condition flow-matching generation of body latents and hand actions.',chips:['Frozen vision-language model','Token-wise layer–expert routing','Joint body + hand actions']},
    {title:'Fine-tune the action expert for each task.',description:'Starting from the action-grounded policy, task-specific demonstrations fine-tune only the Coordination-oriented Action Expert (CAE). The motion-pretrained VLM remains frozen. CAE adapts feature selection and action generation to the target task.',chips:['Task demonstrations','Frozen VLM','Fine-tune CAE only']}
  ];
  let currentStage=0;
  const stageNames=['Motion pretraining','Action grounding','Task fine-tuning'];
  function selectStage(i){currentStage=i;$$('[data-stage]').forEach((b,j)=>{b.classList.toggle('active',j===i);b.setAttribute('aria-selected',String(i===j));b.tabIndex=i===j?0:-1;});$('#method-panel').setAttribute('aria-labelledby',`stage-${i}`);$('#stage-title').textContent=stages[i].title;$('#stage-description').textContent=stages[i].description;$('#stage-chips').replaceChildren(...stages[i].chips.map(t=>{const s=document.createElement('span');s.textContent=t;return s;}));window.CHAMPArchitecture?.showStage(i);window.CHAMPMotion?.showStage(i);const next=(i+1)%stages.length;$('#method-next-hint').textContent=i===stages.length-1?'Back to first stage':'Next stage';$('#method-next-title').textContent=stageNames[next];$('#method-next').classList.toggle('is-return',next===0);$('#method-previous').hidden=i===0;$('#method-previous-title').textContent=stageNames[Math.max(0,i-1)];}
  function navigateStage(direction){selectStage((currentStage+direction+stages.length)%stages.length);$(`#stage-${currentStage}`).focus({preventScroll:true});$('.method-tabs').scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'start'});}
  $('#method-next').addEventListener('click',()=>navigateStage(1));
  $('#method-previous').addEventListener('click',()=>navigateStage(-1));
  $$('[data-stage]').forEach((b,i)=>{b.addEventListener('click',()=>selectStage(i));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const next=(i+(e.key==='ArrowRight'?1:-1)+3)%3;selectStage(next);$$('[data-stage]')[next].focus();});});selectStage(({grounding:1,finetuning:2})[new URLSearchParams(location.search).get('stage')]||0);
  const dialog=$('#image-dialog');
  dialog.addEventListener('close',()=>$('#sample-video').pause());
  const closeMedia=()=>{$('#sample-video').pause();dialog.close();};
  dialog.addEventListener('cancel',()=>$('#sample-video').pause());
  $('.dialog-close').addEventListener('click',closeMedia);dialog.addEventListener('click',e=>{if(e.target===dialog)closeMedia();});
  const videoObserver=new IntersectionObserver(entries=>entries.forEach(e=>{const v=e.target;if(e.isIntersecting){if(!v.src){v.src=v.dataset.src;v.load();}play(v);}else v.pause();}),{threshold:.25});$$('.viewport-video').forEach(v=>videoObserver.observe(v));
  $$('[data-popcorn]').forEach(b=>b.addEventListener('click',()=>{
    const v=$('#popcorn-video'),time=v.currentTime,wasPaused=v.paused;
    v.preload='metadata';
    v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(time,v.duration-.1);if(!wasPaused)play(v);},{once:true});
    v.src=`assets/video/popcorn-${b.dataset.popcorn}.mp4`;v.poster=`assets/poster/popcorn-${b.dataset.popcorn}.jpg`;v.load();
    $$('[data-popcorn]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});
  }));
  function updateScroll(){const progress=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);$('.reading-progress').style.width=`${progress*100}%`;$('.page-index').classList.toggle('visible',scrollY>innerHeight*.8);let current='demos';$$('.article>section').forEach(s=>{if(s.getBoundingClientRect().top<innerHeight*.4)current=s.id;});$$('.page-index a').forEach(a=>{a.classList.toggle('current',a.hash==='#'+current);});}
  addEventListener('scroll',updateScroll,{passive:true});updateScroll();

  const data=window.CHAMP_DATA;
  if(!data)return;
  const domainLabels={human:'Human',robot:'Real robot',simulation:'Simulation'};
  const colors={human:'#ff5125',robot:'#608c94',simulation:'#a092b5'};
  const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
  const oneDecimal=new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
  let activeDomain='all';
  $('#hours-total').textContent=number.format(data.totalHours);
  $('#data-context').textContent=`${data.sourceCount} datasets · ${data.subsets} processed subsets`;
  for(const [id,d] of Object.entries(data.domains)){
    const share=d.hours/data.totalHours*100;const row=document.createElement('div');row.className='domain-row';row.dataset.domainRow=id;row.style.setProperty('--color',colors[id]);row.style.setProperty('--width',share+'%');
    row.innerHTML=`<div class="row-label"><span><i class="dot"></i>${domainLabels[id]}</span><span><b>${oneDecimal.format(d.hours)} h</b> · ${share.toFixed(1)}%</span></div><div class="domain-track"><span></span></div>`;$('#domain-breakdown').append(row);
  }
  const annotationNames={'body-hand':'Body + hands',hand:'Hands only',body:'Body only'};
  const annotationColors={'body-hand':'#e75b35',hand:'#f49e85',body:'#f7d4c9'};
  const annotationAlt=[];
  $('.annotation-chart').style.setProperty('--annotation-columns', Object.values(data.annotations).map(hours => `${hours}fr`).join(' '));
  Object.entries(data.annotations).forEach(([id,hours])=>{const pct=hours/data.totalHours*100;const bar=document.createElement('span');bar.style.setProperty('--color',annotationColors[id]);bar.style.setProperty('--width',pct+'%');bar.title=`${annotationNames[id]}: ${pct.toFixed(1)}%`;$('#annotation-bar').append(bar);const label=document.createElement('div');label.innerHTML=`<b>${pct.toFixed(1)}%</b>${annotationNames[id]}`;$('#annotation-labels').append(label);annotationAlt.push(`${annotationNames[id]} ${pct.toFixed(1)} percent`);});$('#annotation-bar').setAttribute('aria-label',annotationAlt.join(', '));
  const domainOrder=['human','robot','simulation'];
  [...data.sources].sort((a,b)=>domainOrder.indexOf(a.domain)-domainOrder.indexOf(b.domain)||b.hours-a.hours).forEach(s=>{const row=document.createElement('tr');row.innerHTML=`<td>${s.name}</td><td>${domainLabels[s.domain]}</td><td>${s.annotations.map(a=>annotationNames[a]).join(' / ')}</td><td>${oneDecimal.format(s.hours)} h</td>`;$('#source-table').append(row);});
  function selectDataDomain(value){
    activeDomain=value;
    $$('[data-domain]').forEach(b=>{const selected=b.dataset.domain===value;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
    $$('[data-weave-domain]').forEach(b=>{const selected=b.dataset.weaveDomain===value;b.setAttribute('aria-pressed',String(selected));b.title=selected?'Click again to show all streams':`Highlight ${domainLabels[b.dataset.weaveDomain].toLowerCase()} videos`;});
    $('.weave-legend').classList.toggle('has-selection',value!=='all');
    const d=data.domains[value];
    $('#hours-total').textContent=number.format(d?d.hours:data.totalHours);
    $('#data-domain-label').textContent=d?`${domainLabels[value]} motion data`:'Motion pretraining corpus';
    $('#data-context').textContent=d?`${d.sources.length} ${d.sources.length===1?'dataset':'datasets'} · ${d.subsets} processed subsets`:`${data.sourceCount} datasets · ${data.subsets} processed subsets`;
    $$('[data-domain-row]').forEach(r=>{r.style.opacity=value==='all'||r.dataset.domainRow===value?'1':'.3';});
    window.CHAMPDataWeave?.setDomain(value);
  }
  $$('[data-domain]').forEach(b=>b.addEventListener('click',()=>selectDataDomain(b.dataset.domain)));
  $$('[data-weave-domain]').forEach(b=>b.addEventListener('click',()=>selectDataDomain(activeDomain===b.dataset.weaveDomain?'all':b.dataset.weaveDomain)));

})();
