/* Bundled polygon union: work is off the main thread; no remote geometry service. */
importScripts('vendor/polygon-clipping-0.15.7.js');
let geometry=new Map(),generation=0;
const cache=new Map();
function mergedCoverage(ids){
 const key=ids.slice().sort().join(',');
 if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit;}
 let parts=ids.map(id=>{const g=geometry.get(id);if(!g||!['Polygon','MultiPolygon'].includes(g.type))throw Error('Geometría no disponible: '+id);return g.coordinates;});
 if(!parts.length)return {type:'MultiPolygon',coordinates:[]};
 // Batched union avoids an excessively large spread argument list.
 while(parts.length>1){const next=[];for(let i=0;i<parts.length;i+=24)next.push(polygonClipping.union(...parts.slice(i,i+24)));parts=next;}
 const result={type:'MultiPolygon',coordinates:polygonClipping.union(parts[0])};
 cache.set(key,result);if(cache.size>40)cache.delete(cache.keys().next().value);return result;
}
self.onmessage=e=>{
 const data=e.data;
 if(data.type==='init'){geometry=new Map(data.features.map(f=>[String(f.properties.UBIGEO),f.geometry]));cache.clear();return;}
 if(data.type!=='draw')return;
 const current=++generation,jobs=data.jobs;let i=0;
 const step=()=>{
  if(current!==generation)return;
  if(i>=jobs.length){self.postMessage({type:'done',request:data.request});return;}
  const job=jobs[i++];
  try{self.postMessage({type:'outline',request:data.request,id:job.id,geometry:mergedCoverage(job.distritos)});}catch(error){self.postMessage({type:'failure',request:data.request,id:job.id,error:error.message});}
  setTimeout(step,0);
 };step();
};
