export const WALK_SPEED_MPS=1.3;
export const MAX_SNAP_M=40;
const R=6371000, deg=Math.PI/180;
export function meters(a,b){
 const h=Math.sin((a[0]-b[0])*deg/2)**2+Math.cos(a[0]*deg)*Math.cos(b[0]*deg)*Math.sin((a[1]-b[1])*deg/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
const boxOK=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]<b[2]&&b[1]<b[3];
const pointOK=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const inside=(p,b)=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
class Queue {
 data=[];
 push(node,d){const row=[node,d];const a=this.data;let i=a.length;a.push(row);while(i){const p=(i-1)>>1;if(a[p][1]<=d)break;a[i]=a[p];i=p;}a[i]=row;}
 pop(){const a=this.data, row=a[0], end=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][1]<a[c][1])c++;if(a[c][1]>=end[1])break;a[i]=a[c];i=c;}a[i]=end;}return row;}
}
export function prepareGraph(g){
 if(g?.schema!==1||!boxOK(g.bounds)||!Array.isArray(g.nodes)||!Array.isArray(g.edges)||g.nodes.length>120000||g.edges.length>300000||!g.nodes.length)throw new Error('Invalid walking graph');
 const grid=new Map(), links=Array.from({length:g.nodes.length},()=>[]);
 for(let i=0;i<g.nodes.length;i++){
  const n=g.nodes[i];
  if(!Array.isArray(n)||n.length!==3||!pointOK(n.slice(0,2))||typeof n[2]!=='boolean')throw new Error('Invalid walking node');
  if(!n[2])continue;
  const k=key(n[0],n[1]); if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);
 }
 for(const e of g.edges){
  if(!Array.isArray(e)||e.length!==2)throw new Error('Invalid walking edge');
  const [a,b]=e;
  if(!Number.isInteger(a)||!Number.isInteger(b)||a===b||!links[a]||!links[b])throw new Error('Invalid walking edge endpoints');
  const distance=meters(g.nodes[a],g.nodes[b]);
  if(distance>0)links[a].push([b,distance]);
 }
 return {data:g,grid,links};
}
const cell=.001, key=(lat,lon)=>Math.floor(lat/cell)+','+Math.floor(lon/cell);
export function snap(graph,p){
 if(!pointOK(p)||!inside(p,graph.data.bounds))return null;
 const i=Math.floor(p[0]/cell),j=Math.floor(p[1]/cell);
 let best=null;
 for(let x=i-1;x<=i+1;x++)for(let y=j-1;y<=j+1;y++)for(const idx of graph.grid.get(x+','+y)??[]){
  const distance=meters(graph.data.nodes[idx],p);
  if(distance<=MAX_SNAP_M&&(!best||distance<best.distance))best={idx,distance};
 }
 return best;
}
export function shortestPaths(graph,origin,{maxMeters=10000}={}){
 const start=snap(graph,origin);
 if(!start)return null;
 const dist=Float64Array.from({length:graph.links.length},()=>Infinity),prev=new Int32Array(graph.links.length).fill(-1);
 const q=new Queue();dist[start.idx]=start.distance;q.push(start.idx,start.distance);
 while(q.data.length){
  const [node,cost]=q.pop();if(cost!==dist[node])continue;
  for(const [next,length] of graph.links[node]){
   const candidate=cost+length;
   if(candidate<=maxMeters&&candidate<dist[next]){dist[next]=candidate;prev[next]=node;q.push(next,candidate);}
  }
 }
 return {start,dist,prev};
}
export function walkRoute(graph,tree,destination){
 if(!tree)return null;
 const finish=snap(graph,destination);
 if(!finish||!Number.isFinite(tree.dist[finish.idx]))return null;
 const distance=tree.dist[finish.idx]+finish.distance;
 const line=[];
 for(let at=finish.idx;at!==-1;at=tree.prev[at])line.push(graph.data.nodes[at].slice(0,2));
 return {meters:Math.round(distance),minutes:Math.max(1,Math.ceil(distance/WALK_SPEED_MPS/60)),geometry:line.reverse(),originSnapMeters:Math.round(tree.start.distance),destinationSnapMeters:Math.round(finish.distance)};
}
export function walkingGraphState(graph,now=Date.now(),maxAge=30*86400000){
 const stamp=Date.parse(graph?.data?.source?.timestamp);
 if(!Number.isFinite(stamp)||stamp>now)return 'unverified';
 return now-stamp>maxAge?'historical':'current';
}
// Never turn stale availability into a routing recommendation. Null means the caller must label fallback.
export function withWalks(graph,origin,snapshot,{now=Date.now(),freshMs=300000,mode='pickup'}={}){
 if(walkingGraphState(graph,now)!=='current')return null;
 if(snapshot?.sample||!Number.isFinite(snapshot?.updatedAt)||snapshot.updatedAt>now||now-snapshot.updatedAt>freshMs||!Array.isArray(snapshot?.rows))return null;
 const stations=snapshot.rows;
 const tree=shortestPaths(graph,[origin.lat,origin.lon]);
 if(!tree)return null;
 const count={pickup:'bikes',return:'docks',classic:'classics',electric:'ebikes'}[mode];
 if(!count)return [];
 return stations.filter(s=>s.installed&&(mode==='return'?s.returning:s.renting)&&Number.isInteger(s[count])&&s[count]>0&&Number.isFinite(s.reportedAt)&&s.reportedAt<=now&&now-s.reportedAt<=freshMs)
   .map(station=>({...station,walk:walkRoute(graph,tree,[station.lat,station.lon])}))
   .filter(s=>s.walk).sort((a,b)=>a.walk.meters-b.walk.meters||String(a.id).localeCompare(String(b.id)));
}
