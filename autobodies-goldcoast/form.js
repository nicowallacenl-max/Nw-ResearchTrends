// Shared multi-step form logic. Set data-endpoint on <form> to POST submissions (FormData) to your backend.
const f=document.getElementById('f'),steps=[...f.querySelectorAll('.step')].filter(s=>s.id!=='thanks'),bars=[...f.querySelectorAll('.progress i')];
let cur=0;const back=document.getElementById('back'),next=document.getElementById('next');
const photos=[];const MAX=10,MAXMB=10;
const v={req:el=>el.value.trim()!=='',email:el=>/^\S+@\S+\.\S+$/.test(el.value),phone:el=>el.value.replace(/\D/g,'').length>=8,year:el=>/^(19|20)\d{2}$/.test(el.value),
  date:el=>{if(!el.value)return false;const d=new Date(el.value+'T00:00'),t=new Date();t.setHours(0,0,0,0);return d>=t&&d.getDay()%6!==0}};
function valid(step){let ok=true;step.querySelectorAll('[required]').forEach(el=>{const rule=v[el.name]||v[el.type]||v.req;const good=v.req(el)&&(rule===v.req||rule(el));el.classList.toggle('bad',!good);if(!good)ok=false});
  if(step.querySelector('#files')){const need=!photos.length&&!document.getElementById('nophoto').checked;document.getElementById('photoerr').style.display=need?'block':'none';if(need)ok=false}
  if(!ok){const b=step.querySelector('.bad');if(b)b.focus()}return ok}
function show(n){cur=n;steps.forEach((s,i)=>s.classList.toggle('active',i===n));bars.forEach((b,i)=>b.classList.toggle('on',i<=n));
  back.style.visibility=n?'visible':'hidden';const last=n===steps.length-1;next.textContent=last?'Send request':'Continue →';
  if(last||f.querySelector('#sum'))summary();scrollTo({top:f.offsetTop-90,behavior:'smooth'})}
function summary(){const sum=document.getElementById('sum');if(!sum)return;const d=new FormData(f);const rows=[];
  const lab={description:'Damage',make:'Make',model:'Model',year:'Year',rego:'Rego',jobtype:'Job type',name:'Name',email:'Email',phone:'Phone',service:'Service',vehicle:'Vehicle',date:'Date',time:'Time',notes:'Notes'};
  for(const k in lab){const val=d.get(k);if(val)rows.push(`<dt>${lab[k]}</dt><dd>${esc(val)}</dd>`)}
  if(document.getElementById('files'))rows.push(`<dt>Photos</dt><dd>${photos.length||'None (on-site quote requested)'}</dd>`);sum.innerHTML=rows.join('')}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
back.onclick=()=>show(cur-1);
next.onclick=async()=>{if(!valid(steps[cur]))return;if(cur<steps.length-1)return show(cur+1);
  next.disabled=true;next.textContent='Sending…';
  const d=new FormData(f);d.delete('photos');photos.forEach(p=>d.append('photos',p));
  try{const ep=f.dataset.endpoint;if(ep){const r=await fetch(ep,{method:'POST',body:d});if(!r.ok)throw 0}
    steps.forEach(s=>s.classList.remove('active'));document.getElementById('thanks').classList.add('active');document.getElementById('nav').style.display='none';bars.forEach(b=>b.classList.add('on'));scrollTo({top:f.offsetTop-90,behavior:'smooth'})}
  catch{next.disabled=false;next.textContent='Try again';alert('Sorry, that failed to send. Please call (07) 5527 7175 or email admin@autobodiesgoldcoast.com.au.')}};
f.addEventListener('input',e=>e.target.classList.remove('bad'));
// date min
const dt=document.getElementById('date');if(dt)dt.min=new Date().toISOString().slice(0,10);
// photo upload
const input=document.getElementById('files');
if(input){const drop=document.getElementById('drop'),thumbs=document.getElementById('thumbs');
  const render=()=>{thumbs.innerHTML='';photos.forEach((p,i)=>{const t=document.createElement('div');t.className='thumb';const im=new Image();im.alt='Uploaded photo '+(i+1);im.src=URL.createObjectURL(p);const b=document.createElement('button');b.type='button';b.textContent='✕';b.setAttribute('aria-label','Remove photo');b.onclick=()=>{photos.splice(i,1);render()};t.append(im,b);thumbs.append(t)});if(photos.length)document.getElementById('photoerr').style.display='none'};
  const add=list=>{[...list].forEach(p=>{if(!p.type.startsWith('image/')||p.size>MAXMB*1048576||photos.length>=MAX)return;photos.push(p)});render();input.value=''};
  input.onchange=()=>add(input.files);
  ['dragover','dragenter'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add('over')}));
  ['dragleave','drop'].forEach(e=>drop.addEventListener(e,()=>drop.classList.remove('over')));
  drop.addEventListener('drop',ev=>{ev.preventDefault();add(ev.dataTransfer.files)})}
