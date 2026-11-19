import {LANDMARKS, FRESH_MS, MAX_CACHE_MS, readFeeds, ageState, rankStations, closestAvailable, sample, walkingLink} from './core.mjs';
const $=x=>document.getElementById(x);
const params=new URLSearchParams(location.search);
const demo=params.get('demo')==='1';
const select=$('landmark'), refresh=$('refresh'), locate=$('locate'), stations=$('stations');
const svg=$('layout'), notice=$('notice'), note=$('result-note');
let origin=LANDMARKS.island,snapshot=null,error=false,busy=false,timer,locationRequest=0;
for(const [key,v] of Object.entries(LANDMARKS))select.add(new Option(v.name,key));
function currentMode(){return document.querySelector('input[name=mode]:checked').value==='return'?'return':$('kind').value;}
const labels={pickup:'bikes',return:'docks',classic:'classic bikes',electric:'e-bikes'};
const time=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'numeric',timeZoneName:'short'});
function append(parent,tag,text,cls=''){const el=document.createElement(tag);el.className=cls;el.textContent=text;parent.append(el);return el;}
function draw(rows){
  const ns='http://www.w3.org/2000/svg';
  const drawElement=(tag,attrs,label)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(label)el.textContent=label;svg.append(el);};
  svg.replaceChildren();
  const cos=Math.cos(origin.lat*Math.PI/180);
  const scale=Math.max(.002,...rows.flatMap(r=>[Math.abs((r.lon-origin.lon)*cos),Math.abs(r.lat-origin.lat)]));
  for(const x of [60,135,210,285,360])drawElement('line',{x1:x,y1:22,x2:x,y2:278,stroke:'#cbd5c7'});
  for(const y of [35,92,150,208,265])drawElement('line',{x1:34,y1:y,x2:386,y2:y,stroke:'#cbd5c7'});
  drawElement('text',{x:387,y:28,fill:'#476155','font-size':12},'N ↑');
  for(const [i,r] of [...rows.entries()].reverse()){
    const x=210+114*(r.lon-origin.lon)*cos/scale;
    const y=150-114*(r.lat-origin.lat)/scale;
    drawElement('circle',{cx:x,cy:y,r:10,fill:'#226041',stroke:'#fff','stroke-width':1.5});
    drawElement('text',{x,y:y+3.5,fill:'#fff','font-size':9.5,'font-weight':700,'text-anchor':'middle'},String(i+1));
  }
  drawElement('path',{d:'M210 142L218 150L210 158L202 150Z',fill:'#a3442b',stroke:'#fff','stroke-width':1.5});
}
const distanceLabel=(meters)=>meters<1000?Math.round(meters)+' m':(meters/1000).toFixed(2)+' km';
function renderFeatured(status,mode,top){
  const returning=mode==='return', plural=labels[mode];
  const unit=top?.value===1?{pickup:'bike',return:'dock',classic:'classic bike',electric:'e-bike'}[mode]:plural;
  const name=top?.name??{unavailable:'Checking nearby stations…',sample:'Live availability unavailable',stale:'No fresh station readings',live:'No fresh match nearby'}[status];
  $('origin-label').textContent='Near '+origin.name;
  $('kind').disabled=returning;
  const updates={
    'featured-label':returning?'Closest available return':'Closest available pickup',
    'featured-name':name,
    'featured-note':top?distanceLabel(top.distance)+' straight-line · walking route may differ. Reported '+time.format(top.reportedAt)+'.'
         :status==='live'?'No recently reported station within 2.5 km for this choice.'
         :status==='unavailable'?'Looking for a recently reported station.':'Check the official map or browse the separate results below.',
    'featured-number':top?String(top.value):'',
    'featured-unit':top?unit+(returning?' open':' available'):'',
  };
  for(const [id,value] of Object.entries(updates)){if($(id).textContent!==value)$(id).textContent=value;}
  const link=$('directions');
  link.hidden=$('featured-count').hidden=!top;
  if(top){link.href=walkingLink(top);link.setAttribute('aria-label','Walking directions to '+top.name+' (opens a new tab)');}
  else{link.removeAttribute('href');link.removeAttribute('aria-label');}
  $('featured').dataset.state=status;
}
function render(){
  const now=Date.now();
  if(snapshot&&!snapshot.sample&&now-snapshot.updatedAt>MAX_CACHE_MS)snapshot=sample(now);
  const mode=currentMode(),status=ageState(snapshot,now);
  const labelsByState={
    unavailable:'Connecting to the bike-share feed…',
    sample:demo?'Demo mode · all stations and counts are fictional.':'Live feed unavailable · showing fictional examples, not real availability.',
    stale:'Stale feed · last source update at '+(snapshot?.updatedAt?time.format(snapshot.updatedAt):'unknown time')+'. Counts may be outdated.',
    live:'Live feed · updated '+(snapshot?.updatedAt?time.format(snapshot.updatedAt):'')+(error?' · last refresh failed; showing the previous snapshot.':'')
  };
  notice.dataset.state=status;
  if(notice.textContent!==labelsByState[status])notice.textContent=labelsByState[status];
  const ranked=snapshot?rankStations(snapshot.rows,origin,{mode,availableOnly:$('available').checked,liveOnly:status==='live'}):[];
  renderFeatured(status,mode,closestAvailable(snapshot,origin,mode,now));
  note.textContent=(ranked.length?ranked.length+' shown':'No results')+' within 2.5 km of '+origin.name+' · straight-line distance';
  stations.replaceChildren();
  for(const [i,r] of ranked.entries()){
    const li=append(stations,'li',''), badge=append(li,'span',String(i+1),'order');badge.setAttribute('aria-hidden','true');
    const body=append(li,'div','');
    append(body,'h3',r.name);
    const distance=distanceLabel(r.distance);
    const availability=!r.operational?'Station not accepting this action':(!r.current&&!snapshot.sample?'Station report older than 5 min or unavailable':null);
    append(body,'p',[distance,availability].filter(Boolean).join(' · '));
    if(!snapshot.sample){const a=append(body,'a','Walking directions ↗');a.href=walkingLink(r);a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Walking directions to '+r.name+' (opens a new tab)');}
    const count=append(li,'div',r.value??'–','count');append(count,'small',labels[mode]);
  }
  if(snapshot&&!ranked.length){
    const p=append(stations,'li','No matching stations. Try another landmark, availability mode, or uncheck the availability filter.');
    p.className='empty';
  }
  draw(ranked);
}
async function reload(){
  if(busy||demo)return;
  clearTimeout(timer);
  busy=true;refresh.disabled=true;
  try{snapshot=await readFeeds();error=false;}
  catch{error=true;snapshot??=sample();}
  finally{
    busy=false;refresh.disabled=false;
    if(!document.hidden)render();
    const wait=error?90:(snapshot.ttl||60);
    timer=setTimeout(()=>{if(!document.hidden)reload();},wait*1000);
  }
}
select.addEventListener('change',()=>{locationRequest++;origin=LANDMARKS[select.value];$('location-message').textContent='Your location stays in this tab.';render();});
$('modes').addEventListener('change',render);
$('available').addEventListener('change',render);
$('kind').addEventListener('change',render);
refresh.addEventListener('click',reload);
locate.addEventListener('click',()=>{
  const request=++locationRequest;
  if(!navigator.geolocation){$('location-message').textContent='Location is unavailable. Choose a landmark instead.';return;}
  $('location-message').textContent='Waiting for your browser…';
  navigator.geolocation.getCurrentPosition(p=>{
    if(request!==locationRequest)return;
    origin={name:'your location',lat:p.coords.latitude,lon:p.coords.longitude};
    select.selectedIndex=-1;
    $('location-message').textContent='Using your location in this tab only.';
    render();
  },()=>{
    if(request!==locationRequest)return;
    $('location-message').textContent='Could not get your location. Choose a landmark instead.';
  },{enableHighAccuracy:false,timeout:7000,maximumAge:30000});
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!demo)reload();});
if(demo){snapshot=sample();refresh.disabled=true;render();}else{render();reload();}
