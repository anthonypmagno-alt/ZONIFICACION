/* Colores de consulta: no modifican las zonas, las coberturas ni sus indicadores. */
const ZDMapColors=(()=>{
 const SHARED='#64748b',UNASSIGNED='#f7fafc';
 function typeColor(id){
  // Stable across filtering, renaming and reloads; independent of zone colors.
  let hash=2166136261;
  for(const char of String(id))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return 'hsl('+(hash%360)+', '+(60+(hash>>>9)%16)+'%, '+(40+(hash>>>17)%11)+'%)';
 }
 function build(data,visible,mode,selectedPdvs=[]){
  if(!['tipos','pdv'].includes(mode))return null;
  const ids=new Set(visible.districts.map(d=>d.ubigeo)),members=new Map(),categories=new Map();
  const add=(district,category)=>{
   if(!ids.has(district))return;
   if(!members.has(district))members.set(district,new Map());
   members.get(district).set(category.id,category);categories.set(category.id,category);
  };
  if(mode==='tipos'){
   const types=new Map(data.tipos.map(t=>[t.id,t]));
   for(const zone of visible.zones){
    const category={id:zone.tipo,name:types.get(zone.tipo)?.nombre||'Tipo sin catálogo',color:typeColor(zone.tipo)};
    for(const district of zone.distritos)add(district.ubigeo,category);
   }
  }else{
   const points=new Map(data.puntos.filter(p=>p.tipo==='PDV').map(p=>[p.id,p]));
   const chosen=new Set(selectedPdvs);
   for(const coverage of data.parametros||[]){
    if(coverage.tipo!=='cobertura_pdv'||!points.has(coverage.pdv)||(chosen.size&&!chosen.has(coverage.pdv)))continue;
    const category={id:coverage.pdv,name:points.get(coverage.pdv).nombre,color:coverage.color};
    for(const district of coverage.distritos)add(district,category);
   }
  }
  const districts=new Map();let shared=0,unassigned=0;
  for(const id of ids){
   const owners=[...(members.get(id)?.values()||[])];
   if(owners.length>1)shared++;
   if(!owners.length)unassigned++;
   districts.set(id,{color:owners.length>1?SHARED:owners[0]?.color||UNASSIGNED,owners});
  }
  return {mode,districts,categories:[...categories.values()].sort((a,b)=>a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id)),shared,unassigned};
 }
 function style(model,id,selected){
  const district=model.districts.get(id),show=!!district;
  return {color:selected?'#093c94':show?'#7992a6':'#bdcad4',weight:selected?2.5:.7,
   fillColor:district?.color||UNASSIGNED,fillOpacity:show?(district.owners.length?(selected?0.42:0.30):0.12):0.03};
 }
 return Object.freeze({build,style,typeColor,SHARED,UNASSIGNED});
})();
