
names.rutas='Rutas de despacho';
let routeDraft=null,routeDirty=false,routeMap=null,routeLayer=null;
let routeShowLines=true;
const cloneRoute=x=>JSON.parse(JSON.stringify(x));
const defaultSacks=()=>state?.parametros?.find(p=>p.id==='sacos')||{capacidad:27,redondeo:'cercano'};
const originalFillOptions=fillOptions;
fillOptions=function(){originalFillOptions();const p=defaultSacks();$('summaryCapacity').value=p.capacidad;$('summaryRounding').value=p.redondeo;$('saveSackDefaults').hidden=auth.rol!=='ADMINISTRADOR';};
const originalRenderMapData=renderMapData;
renderMapData=function(focus){originalRenderMapData(focus);const s=summarize(view.records),ratio=s.llegadas>0?s.total/s.llegadas:null,capacity=Number($('summaryCapacity').value),sacos=ratio==null?null:sackCount(ratio,capacity,$('summaryRounding').value);
  $('metrics').insertAdjacentHTML('beforeend',metric('Count_llegadas (promedio)',fmt(s.llegadas))+metric('Guías por llegada',fmt(ratio))+metric('Sacos estimados por llegada',fmt(sacos)));
  $('summaryNote').textContent+=' Guías por llegada: total de guías ÷ promedio de Count_llegadas = '+fmt(s.total)+' ÷ '+fmt(s.llegadas)+'. Sacos: dividir entre '+(capacity>0?fmt(capacity):'una capacidad válida')+' guías por saco. '+((s.llegadas==null||s.llegadas===0)?'Sin llegadas: no se calcula la división. ':'');
};
$('summaryCapacity').oninput=()=>state&&renderMapData(false);$('summaryRounding').onchange=()=>state&&renderMapData(false);
$('saveSackDefaults').onclick=run(async()=>{await write('guardarParametrosSacos',$('summaryCapacity').value,$('summaryRounding').value);});
const oldRenderModule=renderModule;
renderModule=function(){if(tab==='rutas')renderRoutes();else oldRenderModule();};
const oldShowTab=showTab;
showTab=function(next){if(tab==='rutas'&&next!=='rutas'&&routeDirty&&!confirm('Hay cambios sin guardar en la ruta. ¿Descartarlos y salir?'))return;if(tab==='rutas'&&next!=='rutas'){routeDraft=null;routeDirty=false;if(routeMap){routeMap.remove();routeMap=null;routeLayer=null;}}oldShowTab(next);};
const oldRouteRefresh=$('refresh').onclick;$('refresh').onclick=run(async e=>{if(tab==='rutas'&&!discardRoute())return;if(tab==='rutas'){routeDraft=null;routeDirty=false;}await oldRouteRefresh(e);});
const oldAddEntity=$('addEntity').onclick;$('addEntity').onclick=()=>{if(tab==='rutas')newRoute();else oldAddEntity();};
const oldModuleClick=$('moduleContent').onclick;
$('moduleContent').onclick=run(async e=>{if(tab!=='rutas'){await oldModuleClick(e);return;}const button=e.target.closest('button');if(!button)return;const action=button.dataset.routeAction;if(!action)return;
  if(action==='open'){if(!discardRoute())return;routeDraft=cloneRoute(state.rutas.find(r=>r.id===button.dataset.id));routeDirty=false;renderRoutes();}
  if(action==='delete'){if(confirm('¿Eliminar esta ruta guardada?')){if(routeDirty&&!discardRoute())return;await write('eliminarRuta',button.dataset.id);routeDraft=null;routeDirty=false;renderRoutes();}}
  if(action==='add'){if(routeDraft.tramos.length>=100)throw Error('Máximo 100 tramos.');const last=routeDraft.tramos.at(-1);routeDraft.tramos.push(blankLeg(last?.destino||''));routeDirty=true;renderRoutes();}
  if(action==='remove'){routeDraft.tramos.splice(Number(button.dataset.index),1);routeDirty=true;renderRoutes();}
  if(action==='up'||action==='down'){const i=Number(button.dataset.index),j=i+(action==='up'?-1:1);if(j<0||j>=routeDraft.tramos.length)return;[routeDraft.tramos[i],routeDraft.tramos[j]]=[routeDraft.tramos[j],routeDraft.tramos[i]];routeDirty=true;renderRoutes();}
  if(action==='cancel'){if(discardRoute()){routeDraft=null;routeDirty=false;renderRoutes();}}
  if(action==='save'){
    const valid=validateRoute(routeDraft,state.puntos),totals=routeTotals(valid);
    if(totals.total.discontinuos.length&&!confirm('Hay saltos de origen en los tramos '+totals.total.discontinuos.join(', ')+'. Esos traslados no tienen tiempo ni km incluidos. ¿Guardar así?'))return;
    const id=routeDraft.id;await write('guardarRuta',Object.assign(valid,{id}));routeDraft=cloneRoute(state.rutas.find(r=>id?r.id===id:r.nombre===valid.nombre));routeDirty=false;renderRoutes();
  }
  if(action==='fit')drawRoute(true);
});
function discardRoute(){return !routeDirty||confirm('¿Descartar los cambios sin guardar de la ruta?');}
function volumeText(value){return value==null?'—':Number(value).toLocaleString('es-PE',{maximumFractionDigits:6});}
function blankLeg(origen=''){return {origen,destino:'',transito:'00:00',operacion:'00:30',km:'',guias:'',capacidad:null};}
function newRoute(){if(!discardRoute())return;if(state.puntos.length<2){say('Registra al menos dos puntos geolocalizados antes de crear una ruta.',true);return;}const d=defaultSacks();routeDraft={id:'',nombre:'',capacidad:d.capacidad,redondeo:d.redondeo,tramos:[blankLeg()]};routeDirty=true;renderRoutes();}
function routePoint(id){return state.puntos.find(p=>p.id===id);}
function routePointName(id){const p=routePoint(id);return p?p.nombre:'Punto no disponible';}
function routeInput(field,value,i,type='number',extra=''){return '<input '+(type==='text'?'class="time"':'')+' type="'+type+'" value="'+esc(value??'')+'" data-leg="'+i+'" data-field="'+field+'" '+(type==='number'?'min="0" step="'+(field==='guias'?'1':'any')+'"':'placeholder="HH:mm:ss"')+' '+extra+' aria-label="'+field+' tramo '+(i+1)+'">';}
function pointSelect(field,value,i,disabled){return '<select data-leg="'+i+'" data-field="'+field+'" '+disabled+' aria-label="'+field+' tramo '+(i+1)+'">'+optionList(state.puntos.map(p=>({id:p.id,nombre:(p.tipo==='CEDIS'?'Cedis · ':p.tipo==='PDV'?'🏍️ ':'📦 ')+p.nombre})),[value],true)+'</select>';}
function renderRoutes(){
  const admin=auth.rol==='ADMINISTRADOR';$('moduleTitle').textContent=names.rutas;$('moduleHint').textContent='Arma la secuencia con puntos registrados. Tiempos, kilómetros y guías se ingresan por tramo.';$('addEntity').hidden=!admin;
  if(routeMap){routeMap.remove();routeMap=null;routeLayer=null;}
  const list=(state.rutas||[]).map(r=>{const t=routeTotals(r).total;return '<tr><td><b>'+esc(r.nombre)+'</b></td><td>'+r.tramos.length+'</td><td>'+durationText(t.duracion)+'</td><td>'+fmt(t.km)+'</td><td>'+fmt(t.guias)+'</td><td>'+fmt(t.sacos)+'</td><td>'+volumeText(t.volumenM3)+'</td><td><button data-route-action="open" data-id="'+esc(r.id)+'">'+(admin?'Ver / editar':'Ver')+'</button> '+(admin?'<button class="danger" data-route-action="delete" data-id="'+esc(r.id)+'">Eliminar</button>':'')+'</td></tr>';}).join('');
  $('moduleContent').innerHTML='<div class="card scroll"><table><thead><tr><th>Ruta</th><th>Tramos</th><th>Tiempo total</th><th>Km</th><th>Guías</th><th>Sacos</th><th>Volumen (m³)</th><th>Acciones</th></tr></thead><tbody>'+list+'</tbody></table>'+(!list?'<p class="empty">No hay rutas guardadas. Crea una para comenzar.</p>':'')+'</div>';
  if(!routeDraft)return;
  const disabled=admin?'':'disabled',r=routeDraft;
  $('moduleContent').insertAdjacentHTML('beforeend','<section class="card route-editor"><div class="bar"><h2>'+esc(r.id?'Editar / consultar ruta':'Nueva ruta')+'</h2><span id="routeDirty" class="hint"></span></div><div class="route-fields"><label>Nombre de la ruta<input id="routeName" maxlength="150" value="'+esc(r.nombre)+'" '+disabled+'></label><label>Hora de salida de ruta<input id="routeDeparture" type="time" step="1" value="'+esc(r.horaSalida||'')+'" '+disabled+'></label><label>Guías por saco general<input id="routeCapacity" type="number" step="any" min="0.01" value="'+esc(r.capacidad)+'" '+disabled+'></label><label>m³ por saco<input id="routeM3PerSack" type="number" min="0.000001" step="any" placeholder="Ej. 0.08" value="'+esc(r.m3PorSaco??'')+'" '+disabled+'></label><label>Costo de ruta (S/)<input id="routeCost" type="number" min="0" step="0.01" placeholder="Ingresar costo" value="'+esc(r.costo??'')+'" '+disabled+'></label><label>Redondeo<select id="routeRounding" '+disabled+'>'+optionList([{id:'cercano',nombre:'Entero más cercano'},{id:'decimal',nombre:'Decimal'},{id:'arriba',nombre:'Hacia arriba'}],[r.redondeo])+'</select></label></div><div class="hint" style="padding:0 16px 14px">Deja Guías por saco del tramo en blanco para usar el valor general. Volumen = cantidad de sacos × m³ por saco general. Si m³ por saco está vacío, el volumen queda sin calcular. Guías corresponden al destino de ese tramo. Tiempos: HH:mm o HH:mm:ss, incluso mayores a 24 horas. Llegada = salida + tránsito. Fin de operación = llegada + operación; determina la siguiente salida. Día 1 es el día inicial de la ruta.<div id="routeScheduleNote" class="hint"></div></div><div class="scroll"><table class="route-table"><thead><tr><th>Orden</th><th>Origen tramo</th><th>Destino tramo</th><th>Tiempo tránsito</th><th>Tiempo operación</th><th>Salida del origen</th><th>Llegada al destino</th><th>Fin de operación</th><th>Km</th><th>Guías para destino</th><th>Guías por saco</th><th>Cantidad de sacos</th><th>Volumen (m³)</th>'+(admin?'<th>Orden / quitar</th>':'')+'</tr></thead><tbody>'+r.tramos.map((t,i)=>'<tr><td>'+(i+1)+'<span id="legMaps'+i+'">'+legMapsIcon(t,i)+'</span></td><td>'+pointSelect('origen',t.origen,i,disabled)+'</td><td>'+pointSelect('destino',t.destino,i,disabled)+'</td><td>'+routeInput('transito',t.transito,i,'text',disabled)+'</td><td>'+routeInput('operacion',t.operacion,i,'text',disabled)+'</td><td id="legDeparture'+i+'">—</td><td id="legArrival'+i+'">—</td><td id="legEnd'+i+'">—</td><td>'+routeInput('km',t.km,i,'number',disabled)+'</td><td>'+routeInput('guias',t.guias,i,'number',disabled)+'</td><td>'+routeInput('capacidad',t.capacidad,i,'number',disabled+' placeholder="General"')+'</td><td class="num" id="legSacks'+i+'">—</td><td class="num" id="legVolume'+i+'">—</td>'+(admin?'<td><div class="route-actions"><button data-route-action="up" data-index="'+i+'" '+(i===0?'disabled':'')+' aria-label="Subir tramo">↑</button><button data-route-action="down" data-index="'+i+'" '+(i===r.tramos.length-1?'disabled':'')+' aria-label="Bajar tramo">↓</button><button class="danger" data-route-action="remove" data-index="'+i+'">Quitar</button></div></td>':'')+'</tr>').join('')+'</tbody><tfoot id="routeFoot"></tfoot></table></div><div class="bar">'+(admin?'<button data-route-action="add">+ Agregar tramo</button>':'')+'<div class="actions"><button data-route-action="cancel">Cerrar</button>'+(admin?'<button class="primary" data-route-action="save">Guardar ruta</button>':'')+'</div></div><div class="route-layout"><div><div class="bar"><b>Secuencia en el mapa</b><button data-route-action="fit">Enfocar recorrido</button></div><div id="routeMap" class="route-map"></div><p class="hint">Líneas directas entre puntos. No representan una ruta vial ni calculan tiempos o kilómetros automáticamente.</p><div id="routeMapsLinks" class="maps-links"></div></div><div class="route-info"><div id="routeTotalsInfo"></div><div id="routeWarnings" role="status"></div></div></div></section>');
  $('routeDeparture').oninput=e=>{routeDraft.horaSalida=e.target.value;routeDirty=true;updateRouteNumbers();};
  $('routeName').oninput=e=>{routeDraft.nombre=e.target.value;routeDirty=true;updateRouteNumbers();};
  $('routeM3PerSack').oninput=e=>{routeDraft.m3PorSaco=e.target.value;routeDirty=true;updateRouteNumbers();};
  $('routeCost').oninput=e=>{routeDraft.costo=e.target.value;routeDirty=true;updateRouteNumbers();};
  $('routeCapacity').oninput=e=>{routeDraft.capacidad=e.target.value;routeDirty=true;updateRouteNumbers();};
  $('routeRounding').onchange=e=>{routeDraft.redondeo=e.target.value;routeDirty=true;updateRouteNumbers();};
  $('moduleContent').querySelectorAll('[data-leg]').forEach(el=>{const handler=()=>{const t=routeDraft.tramos[Number(el.dataset.leg)];t[el.dataset.field]=el.value;routeDirty=true;updateRouteNumbers();if(['origen','destino'].includes(el.dataset.field))drawRoute(false);};if(el.tagName==='SELECT')el.onchange=handler;else el.oninput=handler;});
  updateRouteNumbers();initRouteMap();renderMapsLinks();
}
function updateRouteNumbers(){if(!routeDraft||!$('routeFoot'))return;$('routeDirty').textContent=routeDirty?'Cambios sin guardar':'Ruta guardada';
  updateRouteSchedule();
  routeDraft.tramos.forEach((t,i)=>{const cell=$('legMaps'+i);if(cell)cell.innerHTML=legMapsIcon(t,i);});
  routeDraft.tramos.forEach((t,i)=>{const capacity=t.capacidad==null||String(t.capacidad).trim()===''?Number(routeDraft.capacidad):Number(t.capacidad);const n=t.guias==null||String(t.guias).trim()===''?null:sackCount(Number(t.guias),capacity,routeDraft.redondeo);$('legSacks'+i).textContent=fmt(n);const m3=Number(routeDraft.m3PorSaco);$('legVolume'+i).textContent=volumeText(n!=null&&Number.isFinite(m3)&&m3>0?n*m3:null);});
  let validation='';try{validateRoute(routeDraft,state.puntos);}catch(e){validation=e.message;}
  let result;try{
    // No convertir campos todavía vacíos en cero para mostrar un total engañoso.
    if(routeDraft.tramos.some(t=>t.km==null||String(t.km).trim()===''||t.guias==null||String(t.guias).trim()===''))throw Error('Completa kilómetros y guías para calcular todos los totales.');
    result=routeTotals(routeDraft);
  }catch(e){$('routeFoot').innerHTML='<tr><td colspan="14">Totales pendientes: '+esc(e.message)+'</td></tr>';$('routeTotalsInfo').innerHTML=metric('Volumen total (m³)','—')+costMetrics(null);$('routeWarnings').textContent=validation;return;}
  const t=result.total;$('routeFoot').innerHTML='<tr><td>Total</td><td></td><td></td><td>'+durationText(t.transito)+'</td><td>'+durationText(t.operacion)+'</td><td></td><td></td><td></td><td>'+fmt(t.km)+'</td><td>'+fmt(t.guias)+'</td><td>'+fmt(t.capacidad)+' (prom.)</td><td>'+fmt(t.sacos)+'</td><td>'+volumeText(t.volumenM3)+'</td>'+(auth.rol==='ADMINISTRADOR'?'<td></td>':'')+'</tr>';
  $('routeTotalsInfo').innerHTML=metric('Tiempo total: tránsito + operación',durationText(t.duracion))+metric('Total de guías',fmt(t.guias))+metric('Sacos: suma por tramo',fmt(t.sacos))+metric('Volumen total (m³)',volumeText(t.volumenM3))+costMetrics(t);
  const warnings=[];if(validation)warnings.push(validation);if(t.discontinuos.length)warnings.push('Discontinuidad antes de los tramos '+t.discontinuos.join(', ')+'. El traslado entre esos puntos no está incluido.');
  const destinos=routeDraft.tramos.map(x=>x.destino).filter(Boolean);if(new Set(destinos).size!==destinos.length)warnings.push('Hay destinos repetidos. Las guías se suman por visita; revisa que no sean la misma carga.');
  $('routeWarnings').innerHTML=warnings.map(w=>'<p class="warning">'+esc(w)+'</p>').join('');
}
function initRouteMap(){if(!window.L){$('routeMap').textContent='No se pudo cargar el mapa. Revisa la conexión.';return;}routeMap=L.map('routeMap',{preferCanvas:true}).setView([-9.2,-75],5);addMaximize(routeMap);addRouteLineControl();const clean=L.layerGroup().addTo(routeMap),streets=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19});L.control.layers({'Mapa limpio':clean,'Calles y lugares':streets},null,{position:'bottomright'}).addTo(routeMap);L.geoJSON(GEOJSON_DISTRITOS,{style:{color:'#b6c7d5',weight:.5,fillColor:'#f0f5f9',fillOpacity:.12}}).addTo(routeMap);routeLayer=L.layerGroup().addTo(routeMap);drawRoute(true);setTimeout(()=>routeMap?.invalidateSize(),0);}
function addRouteLineControl(){
  const control=L.control({position:'topright'});
  control.onAdd=()=>{
    const box=L.DomUtil.create('div','route-line-control');
    box.innerHTML='<label><input type="checkbox" aria-label="Mostrar líneas de ruta" '+(routeShowLines?'checked':'')+'> Mostrar líneas</label>';
    L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
    box.querySelector('input').onchange=e=>{routeShowLines=e.target.checked;drawRoute(false);};
    return box;
  };control.addTo(routeMap);
}
function numberedRouteVisits(route,points){
  const lookup=new Map(points.map(p=>[p.id,p])),visits=new Map();let number=0;
  const add=(id,n)=>{const p=lookup.get(id);if(!p)return;if(!visits.has(id))visits.set(id,{p,numbers:[]});const item=visits.get(id);if(!item.numbers.includes(n))item.numbers.push(n);};
  route.tramos.forEach((t,i)=>{if(i===0||route.tramos[i-1].destino!==t.origen)number++;add(t.origen,number);number++;add(t.destino,number);});
  return [...visits.values()];
}
function drawRoute(focus){
  renderMapsLinks();if(!routeMap||!routeDraft)return;
  routeLayer.clearLayers();const bounds=L.latLngBounds([]);
  routeDraft.tramos.forEach((t,i)=>{const a=routePoint(t.origen),b=routePoint(t.destino);
    if(routeShowLines&&a&&b)L.polyline([[a.lat,a.lon],[b.lat,b.lon]],{color:'#216be2',weight:4}).addTo(routeLayer).bindTooltip('Tramo '+(i+1)+': '+esc(a.nombre)+' → '+esc(b.nombre));
  });
  numberedRouteVisits(routeDraft,state.puntos).forEach(({p,numbers})=>{
    bounds.extend([p.lat,p.lon]);
    L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',html:'<span class="route-stop">'+pointIcon(p.tipo)+'</span>',iconSize:[15,15],iconAnchor:[7.5,7.5]})}).addTo(routeLayer)
      .bindTooltip(esc(numbers.join(' / ')),{permanent:true,direction:'right',offset:[8,0],className:'route-number-label'})
      .bindPopup('<b>'+esc(p.nombre)+'</b><br>'+esc(pointTypeName(p.tipo))+'<br>Punto(s): '+esc(numbers.join(', '))+'<br>'+pointMapsLink(p));
  });
  if(focus&&bounds.isValid())routeMap.fitBounds(bounds,{padding:[25,25],maxZoom:13});
}
window.addEventListener('beforeunload',e=>{if(routeDirty){e.preventDefault();e.returnValue='';}});

function costMetrics(total){
  const c=routeCosts(routeDraft,total),money=n=>n==null?'—':'S/ '+n.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
  return metric('Costo de ruta',money(c.costo))+metric('Costo por paquete',money(c.porPaquete))+metric('Costo por saco',money(c.porSaco));
}
function renderMapsLinks(){
  const box=$('routeMapsLinks');if(!box||!routeDraft)return;
  try{
    const links=mapsRouteLinks(routeDraft,state.puntos);
    box.innerHTML=links.length?links.map((link,i)=>'<a href="'+esc(link.url)+'" target="_blank" rel="noopener noreferrer">Abrir '+(links.length>1?'recorrido '+(i+1):'ruta')+' en Google Maps</a><small>'+esc(link.nombres.join(' → '))+'</small><input readonly aria-label="Enlace para copiar" value="'+esc(link.url)+'">').join(''):'Agrega los puntos de la ruta.';
    box.querySelectorAll('input').forEach(input=>input.onclick=()=>input.select());
    if(links.length>1)box.insertAdjacentHTML('beforeend','<small>Abre los recorridos en orden. Se separan por cantidad de paradas o por saltos entre tramos.</small>');
  }catch(e){box.textContent='Completa origen y destino con puntos geolocalizados válidos.';}
}


function updateRouteSchedule(){
  const schedule=routeSchedule(routeDraft);
  schedule.forEach((row,i)=>{
    $('legDeparture'+i).textContent=scheduleClock(row.salida);
    $('legArrival'+i).textContent=scheduleClock(row.llegada);
    $('legEnd'+i).textContent=scheduleClock(row.fin);
  });
  const errors=schedule.map((r,i)=>r.error?'Tramo '+(i+1)+': '+r.error:'').filter(Boolean);
  $('routeScheduleNote').textContent=errors.length?errors.join(' '):routeDraft.horaSalida?'Horarios estimados según la secuencia y duraciones ingresadas.':'Ingresa la hora de salida para calcular los horarios. Las rutas anteriores conservan este campo vacío.';
}


function legMapsIcon(leg,index){
  const label='Abrir tramo '+(index+1)+' en Google Maps';
  try{
    if(!leg.origen||!leg.destino||leg.origen===leg.destino)throw Error('Selecciona puntos distintos.');
    const link=mapsRouteLinks({tramos:[leg]},state.puntos)[0];
    return '<a class="leg-maps-icon" href="'+esc(link.url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+label+'" title="'+esc(label+': '+link.nombres.join(' → '))+'">🗺️</a>';
  }catch(e){return '<span class="leg-maps-icon disabled" aria-disabled="true" title="Selecciona origen y destino con coordenadas válidas">🗺️</span>';}
}

