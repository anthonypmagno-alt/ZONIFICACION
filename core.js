const ALIASES = Object.assign({
  'ANCASH|HUARI|SAN PEDRO DE CHAMA': '021015',
  'AYACUCHO|HUANTA|SILVIA': '050407',
  'AYACUCHO|VICTOR FAJARDO|HUAYA': '051010',
  'HUANUCO|HUANUCO|QUISQUI': '100106',
  'HUANUCO|HUANUCO|YURUMAYO': '100110',
  'HUANUCO|LEONCIO PRADO|DANIEL ALOMIAS ROBLES': '100602',
  'ICA|NAZCA|CHANGUILLO': '110302',
  'ICA|NAZCA|EL INGENIO': '110303',
  'ICA|NAZCA|MARCONA': '110304',
  'ICA|NAZCA|NAZCA': '110301',
  'ICA|NAZCA|VISTA ALEGRE': '110305',
  'JUNIN|CHUPACA|SAN JUAN DE YSCOS': '120906',
  'JUNIN|HUANCAYO|SAPALLANCA': '120133',
  'LIMA|HUAROCHIRI|LARAOS': '150712',
  'LIMA|LIMA|MAGDALENA VIEJA': '150121',
  'LIMA|YAUYOS|AYAUCA': '151003',
  'LORETO|MAYNAS|FERNADO LORES': '160103',
  'MOQUEGUA|MARISCAL NIETO|CURUMAS': '180102',
  'PUNO|HUANCANE|RASASPATA': '210606',
  'PUNO|MELGAR|AYAVARI': '210801',
  'PUNO|PUNO|MANOZO': '210109',
  'SAN MARTIN|HUALLAGA|TIINGO DE SAPOSOA': '220406',
  'SAN MARTIN|MARISCAL CACERES|CANPANILLA': '220602',
  'TACNA|CANDARAVE|HUANAURA': '230205',
  'UCAYALI|ATALAYA|RAYMONDI': '250201',
}, {"HUANUCO|LEONCIO PRADO|RUPA RUPA":"100601", "JUNIN|HUANCAYO|SAN DOMINGO DE ACOBAMBA":"120135"});

// Lógica compartida por servidor e interfaz. Sin dependencias externas.
const HEADERS = ['Departamento','Provincia','Distrito','Count guias','Count_llegadas','Count_llegadas_totales','PENDIENTES','PENDIENTE LLEGADO AL PDV','ENTREGADOS','DEVUELTOS','FINALIZADOS (ROBO/PERDIDA)','Cumplimiento SLA 5 DIAS','DIAS NECESARIOS'];
function norm(v) { return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(); }
function geoKey(d,p,n) {return [d,p,n].map(norm).join('|');}
function parseExcelRows(matrix, catalog, overrides) {
  if (!Array.isArray(matrix) || matrix.length < 2 || matrix.length > 20001) throw Error('El Excel debe contener entre 1 y 20,000 filas de datos.');
  const header = matrix[0].map(norm), indices = HEADERS.map(h => header.indexOf(norm(h)));
  if (indices.includes(-1)) throw Error('Faltan columnas: '+HEADERS.filter((h,i)=>indices[i]<0).join(', '));
  if (new Set(header.filter(Boolean)).size !== header.filter(Boolean).length) throw Error('Hay encabezados duplicados.');
  const byKey={},byId={};catalog.forEach(c=>{byKey[geoKey(c.departamento,c.provincia,c.distrito)]=c.ubigeo;byId[c.ubigeo]=c;});
  const aliases=Object.assign({},ALIASES,overrides||{}), seen=new Set(), records=[], unmatched=[];
  matrix.slice(1).forEach((row,i)=>{
    if(row.every(v=>v==null||String(v).trim()===''))return;
    const a=indices.map(j=>row[j] == null ? null : row[j]);
    if(a.slice(0,3).some(v=>!String(v||'').trim()))throw Error('Fila '+(i+2)+': ubicación incompleta.');
    const key=geoKey(...a.slice(0,3)),signature=JSON.stringify(a);if(seen.has(signature))throw Error('Fila repetida exactamente en '+(i+2)+': '+key);seen.add(signature);
    const nums=a.slice(3).map((v,j)=>{
      if(v==null||String(v).trim()==='') {if(j===9)return null;throw Error('Fila '+(i+2)+': falta '+HEADERS[j+3]);}
      const n=typeof v==='number'?v:Number(String(v).trim().replace(',','.'));
      if(!Number.isFinite(n)||n<0||(j<9&&!Number.isInteger(n)))throw Error('Fila '+(i+2)+': número inválido en '+HEADERS[j+3]);return n;
    });
    const ubigeo=aliases[key]||byKey[key]||'';
    if(ubigeo&&!byId[ubigeo])throw Error('Homologación sin distrito en mapa: '+key);
    const r={id:String(i+2),key,departamento:String(a[0]),provincia:String(a[1]),distrito:String(a[2]),ubigeo,
      total:nums[0],llegadas:nums[1],llegadasTotales:nums[2],pendientes:nums[3],pdv:nums[4],entregados:nums[5],devueltos:nums[6],finalizados:nums[7],sla:nums[8],dias:nums[9]};
    records.push(r);if(!ubigeo)unmatched.push(r);
  });
  if(!records.length)throw Error('El Excel está vacío.');
  const matched=records.map(r=>r.ubigeo).filter(Boolean);
  return {records,unmatched,filasAdicionalesDistrito:matched.length-new Set(matched).size};
}
function summarize(rows, mode) {
  const r={total:0,llegadas:0,pendientes:0,pdv:0,entregados:0,devueltos:0,finalizados:0,sla:0};
  const unique=[...new Map(rows.map(x=>[x.id,x])).values()];unique.forEach(x=>Object.keys(r).forEach(k=>r[k]+=x[k]||0));
  const llegadasValidas=unique.map(x=>x.llegadas).filter(v=>typeof v==='number'&&Number.isFinite(v));
  r.llegadas=llegadasValidas.length?llegadasValidas.reduce((a,b)=>a+b,0)/llegadasValidas.length:null;
  r.cumplimiento=r.entregados+r.pdv ? r.sla/(r.entregados+r.pdv) : null;
  const days=unique.filter(x=>x.dias!=null);r.dias=days.length?(mode==='promedio'?days.reduce((s,x)=>s+x.dias,0)/days.length:Math.max(...days.map(x=>x.dias))):null;
  r.sinDias=unique.length-days.length;return r;
}
// Duraciones: horas acumuladas, nunca hora del día. Admite HH:mm y HH:mm:ss.
function durationSeconds(value) {
  const match=String(value??'').trim().match(/^(\d{1,6}):([0-5]\d)(?::([0-5]\d))?$/);
  if(!match)throw Error('Tiempo inválido: usa HH:mm o HH:mm:ss (ejemplo 28:00:00).');
  return Number(match[1])*3600+Number(match[2])*60+Number(match[3]||0);
}
function durationText(seconds) {
  const s=Math.round(seconds);return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}
function sackCount(guides,capacity,rounding) {
  if(!Number.isFinite(guides)||guides<0||!Number.isFinite(capacity)||capacity<=0)return null;
  const n=guides/capacity;
  if(rounding==='cercano')return Math.round(n);
  if(rounding==='arriba')return Math.ceil(n);
  return n;
}
function routeNumber(value,label,integer=false,positive=false){
  if(value==null||String(value).trim()==='')throw Error('Completa '+label+'.');
  const n=Number(value);if(!Number.isFinite(n)||n<0||positive&&n===0||integer&&!Number.isSafeInteger(n))throw Error('Valor inválido en '+label+'.');return n;
}
function validateRoute(input,points){
  const nombre=String(input.nombre||'').trim();if(!nombre||nombre.length>150)throw Error('Nombre de ruta obligatorio (hasta 150 caracteres).');
  const capacidad=routeNumber(input.capacidad,'guías por saco de la ruta',false,true);
  if(!['decimal','cercano','arriba'].includes(input.redondeo))throw Error('Selecciona un redondeo válido.');
  if(!Array.isArray(input.tramos)||!input.tramos.length||input.tramos.length>100)throw Error('La ruta debe tener de 1 a 100 tramos.');
  const ids=new Set(points.map(p=>p.id));
  const tramos=input.tramos.map((t,i)=>{
    if(!ids.has(t.origen)||!ids.has(t.destino))throw Error('Tramo '+(i+1)+': selecciona origen y destino registrados.');
    if(t.origen===t.destino)throw Error('Tramo '+(i+1)+': origen y destino deben ser distintos.');
    return {origen:t.origen,destino:t.destino,transito:durationText(durationSeconds(t.transito)),operacion:durationText(durationSeconds(t.operacion)),km:routeNumber(t.km,'km del tramo '+(i+1)),guias:routeNumber(t.guias,'guías del tramo '+(i+1),true),capacidad:t.capacidad==null||String(t.capacidad).trim()===''?null:routeNumber(t.capacidad,'guías por saco del tramo '+(i+1),false,true)};
  });
  const costo=input.costo==null||String(input.costo).trim()===''?null:routeNumber(input.costo,'costo de ruta');
  const horaSalida=String(input.horaSalida||'').trim();
  if(horaSalida&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(horaSalida))throw Error('Hora de salida inválida. Usa HH:mm, entre 00:00 y 23:59.');
  const m3PorSaco=input.m3PorSaco==null||String(input.m3PorSaco).trim()===''?null:routeNumber(input.m3PorSaco,'m³ por saco',false,true);
  return {nombre,capacidad,redondeo:input.redondeo,tramos,costo,horaSalida,m3PorSaco};
}
function routeTotals(route){
  const m3=route.m3PorSaco==null||String(route.m3PorSaco).trim()===''?null:routeNumber(route.m3PorSaco,'m³ por saco',false,true);
  const total={transito:0,operacion:0,km:0,guias:0,sacos:0,volumenM3:m3==null?null:0,capacidad:0,discontinuos:[]};
  const legs=route.tramos.map((t,i)=>{
    const cap=t.capacidad==null||String(t.capacidad).trim()===''?routeNumber(route.capacidad,'guías por saco general',false,true):routeNumber(t.capacidad,'guías por saco del tramo',false,true);
    const guias=routeNumber(t.guias,'guías del tramo',true),km=routeNumber(t.km,'km del tramo');
    const sacos=sackCount(guias,cap,route.redondeo);
    if(sacos==null)throw Error('Guías o capacidad inválidas.');
    total.transito+=durationSeconds(t.transito);total.operacion+=durationSeconds(t.operacion);total.km+=km;total.guias+=guias;total.capacidad+=cap;total.sacos+=sacos;
    if(i&&route.tramos[i-1].destino!==t.origen)total.discontinuos.push(i+1);
    const volumenM3=m3==null?null:sacos*m3;
    if(volumenM3!=null)total.volumenM3+=volumenM3;
    return Object.assign({},t,{capacidadEfectiva:cap,sacos,volumenM3});
  });
  total.capacidad=legs.length?total.capacidad/legs.length:null;total.duracion=total.transito+total.operacion;return {total,legs};
}
function routeCosts(route,total){
  const raw=route.costo,n=Number(raw),costo=raw!=null&&String(raw).trim()!==''&&Number.isFinite(n)&&n>=0?n:null;
  return {costo,porPaquete:costo!=null&&total&&total.guias>0?costo/total.guias:null,porSaco:costo!=null&&total&&total.sacos>0?costo/total.sacos:null};
}
function scheduleClock(seconds){
  if(seconds==null)return '—';
  return 'Día '+(Math.floor(seconds/86400)+1)+' · '+durationText(seconds%86400);
}
function routeSchedule(route){
  const hora=String(route.horaSalida||'').trim(),rows=[];
  let cursor=/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(hora)?durationSeconds(hora):null;
  route.tramos.forEach((leg,i)=>{
    let error='';
    if(i&&route.tramos[i-1].destino!==leg.origen){cursor=null;error='Horario pendiente: falta el tramo de conexión con el origen.';}
    let salida=cursor,llegada=null,fin=null;
    try{
      const transito=durationSeconds(leg.transito),operacion=durationSeconds(leg.operacion);
      if(cursor!=null){llegada=cursor+transito;fin=llegada+operacion;cursor=fin;}
    }catch(e){error=e.message;cursor=null;salida=null;llegada=null;fin=null;}
    rows.push({salida,llegada,fin,error});
  });return rows;
}
function mapsCoordinates(point){
  if(!point||point.lat==null||point.lon==null||String(point.lat).trim()===''||String(point.lon).trim()==='')throw Error('Completa las coordenadas de los puntos.');
  const lat=Number(point.lat),lon=Number(point.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Coordenadas inválidas.');
  return lat+','+lon;
}
function mapsPointUrl(point){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(mapsCoordinates(point));}
function mapsRouteLinks(route,points){
  const lookup=new Map(points.map(p=>[p.id,p])),groups=[];let group=[];
  for(const leg of route.tramos){
    const a=lookup.get(leg.origen),b=lookup.get(leg.destino);mapsCoordinates(a);mapsCoordinates(b);
    if(!group.length)group=[a,b];
    else if(group[group.length-1].id===a.id)group.push(b);
    else {groups.push(group);group=[a,b];}
  }
  if(group.length)groups.push(group);
  const links=[];
  for(const g of groups)for(let i=0;i<g.length-1;i+=4){
    const chunk=g.slice(i,i+5),via=chunk.slice(1,-1);
    let url='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(mapsCoordinates(chunk[0]))+'&destination='+encodeURIComponent(mapsCoordinates(chunk[chunk.length-1]));
    if(via.length)url+='&waypoints='+encodeURIComponent(via.map(mapsCoordinates).join('|'));
    links.push({url,nombres:chunk.map(p=>p.nombre),ids:chunk.map(p=>p.id)});
  }
  return links;
}
function provinceKey(departamento, provincia) {return JSON.stringify([norm(departamento),norm(provincia)]);}
function visibleData(state, catalog, f) {
  const matches=(v,a)=>!a||!a.length||a.includes(v);
  const zones=state.zonas.filter(z=>matches(z.id,f.zonas)&&matches(z.area,f.areas)&&matches(z.tipo,f.tipos)&&matches(z.envio,f.envios));
  const restricted=['zonas','areas','tipos','envios'].some(k=>f[k]&&f[k].length);
  const ids=new Set(zones.flatMap(z=>z.distritos.map(d=>d.ubigeo)));
  const districts=catalog.filter(c=>(!restricted||ids.has(c.ubigeo))&&matches(c.departamento,f.departamentos)&&matches(provinceKey(c.departamento,c.provincia),f.provincias)&&(!f.q||norm(c.departamento+' '+c.provincia+' '+c.distrito+' '+c.ubigeo).includes(norm(f.q))));
  const visible=new Set(districts.map(c=>c.ubigeo));
  const records=state.indicadores.filter(r=>r.ubigeo?visible.has(r.ubigeo):!restricted&&matches(r.departamento.toUpperCase(),f.departamentos)&&matches(provinceKey(r.departamento,r.provincia),f.provincias)&&(!f.q||norm(r.key).includes(norm(f.q))));
  const points=state.puntos.filter(p=>matches(p.tipo,f.puntoTipos)&&matches(p.area,f.areas)&&(!f.zonas?.length||p.zonas.some(z=>f.zonas.includes(z)))&&(!f.tipos?.length&&!f.envios?.length||p.zonas.some(id=>zones.some(z=>z.id===id)))&&(!f.departamentos?.length&&!f.provincias?.length&&!f.q||visible.has(p.ubigeo)));
  return {districts,records,zones,points};
}
