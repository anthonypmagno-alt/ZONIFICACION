/* UI for independent PDV district coverage. All writes pass the authenticated API. */
names.coberturasPdv='Cobertura por PDV';
let pdvIndexState=null,pdvIndex=new Map(),pdvModuleQuery='';
let pdvWorker=null,pdvOutlineLayer=null,pdvDrawRequest=0,pdvDrawSignature='',pdvDrawJobs=new Map(),pdvDrawErrors=[];
function coverageIndex(){if(pdvIndexState!==state){pdvIndexState=state;pdvIndex=pdvCoverageIndex(state);}return pdvIndex;}
function coverageBadges(ubigeo){const a=coverageIndex().get(ubigeo)||[];return a.length?a.map(({point,coverage})=>'<span class="pill pdv-pill" style="--pdv-color:'+coverage.color+'">'+esc(point.nombre)+'</span>').join(''):'<span class="hint">Sin PDV asignado</span>';}
function renderMapColorLegend(model){
 if(!model)return;
 const title=model.mode==='tipos'?'Colores por tipo de zona':'Colores por PDV que cubre';
 $('legend').innerHTML='<strong class="map-color-title">'+title+'</strong>'+model.categories.map(c=>'<button class="map-color-item" data-map-category="'+esc(c.id)+'" title="Filtrar '+esc(c.name)+'"><i class="dot" style="background:'+c.color+'"></i>'+esc(c.name)+'</button>').join('')+
  (model.shared?'<span class="pill"><i class="dot" style="background:'+ZDMapColors.SHARED+'"></i>'+(model.mode==='tipos'?'Varios tipos de zona':'Varios PDV')+' · '+model.shared+' distritos</span>':'')+
  (model.unassigned?'<span class="pill"><i class="dot" style="background:'+ZDMapColors.UNASSIGNED+'"></i>'+(model.mode==='tipos'?'Sin zona asignada':'Sin PDV asignado')+' · '+model.unassigned+' distritos</span>':'')+
  (!model.districts.size?'<span class="hint">No hay distritos que coincidan con los filtros.</span>':'');
 $('legend').querySelectorAll('[data-map-category]').forEach(button=>button.onclick=()=>{
  const filter=$(model.mode==='tipos'?'fTipos':'fPdvs');
  [...filter.options].forEach(option=>option.selected=option.value===button.dataset.mapCategory);
  filter.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
const mapColorModes=['tipos','pdv','zonas','bordes'];
try{const previous=localStorage.getItem('zd.map.colorMode');if(mapColorModes.includes(previous))$('coverageDisplay').value=previous;}catch{}
const pdvFiltersBefore=filters;
filters=function(){return {...pdvFiltersBefore(),pdvs:values('fPdvs'),cobertura:$('fCobertura').value};};
const pdvFillBefore=fillOptions;
fillOptions=function(){pdvFillBefore();const pdvs=state.puntos.filter(p=>p.tipo==='PDV').sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));setOpts('fPdvs',pdvs);setOpts('assignPdv',pdvs,true);$('coverageAssignment').hidden=auth.rol!=='ADMINISTRADOR';syncPdvStyle();};
function syncPdvStyle(){if(!state)return;const id=$('assignPdv').value,c=pdvCoverage(state,id);$('pdvBorderColor').value=c.color;$('pdvBorderWidth').value=String(c.grosor);updatePdvSelection();previewPdvStyle();}
function previewPdvStyle(){const preview=$('pdvBorderPreview');preview.style.border=$('pdvBorderWidth').value+'px solid '+$('pdvBorderColor').value;preview.style.background=$('pdvBorderColor').value+'4d';}
function updatePdvSelection(){if(!state||!view)return;const visible=new Set(view.districts.map(d=>d.ubigeo)),hidden=[...selected].filter(id=>!visible.has(id)).length,id=$('assignPdv').value,c=pdvCoverage(state,id),admin=auth.rol==='ADMINISTRADOR';
 $('pdvSelectionCount').textContent=selected.size+' distritos seleccionados'+(hidden?' · '+hidden+' ocultos por los filtros':'');
 $('pdvCoverageSummary').textContent=id?c.distritos.length+' distritos guardados para este PDV. Un distrito puede ser atendido por varios PDV.':'Elige un punto de tipo PDV. La ubicación del punto no asigna cobertura automáticamente.';
 $('pdvAssign').disabled=!admin||!id||!selected.size;$('pdvUnassign').disabled=!admin||!id||!selected.size;$('pdvSaveStyle').disabled=!admin||!id;
}
const pdvRenderBefore=renderMapData;
renderMapData=function(focus){pdvRenderBefore(focus);updatePdvSelection();if(values('fPdvs').length||$('fCobertura').value)$('summaryNote').textContent+=' Cobertura PDV: cada distrito se cuenta una sola vez. Los indicadores son del distrito completo; no se reparten entre PDV.';};
const pdvUpdateMapBefore=updateMap;
updateMap=function(){pdvUpdateMapBefore();renderPdvOutlines();};
$('assignPdv').onchange=syncPdvStyle;$('pdvBorderColor').oninput=previewPdvStyle;$('pdvBorderWidth').onchange=previewPdvStyle;
$('fPdvs').onchange=()=>refreshView(true);$('fCobertura').onchange=()=>refreshView(true);
$('coverageDisplay').onchange=()=>{try{localStorage.setItem('zd.map.colorMode',$('coverageDisplay').value);}catch{}updateMap();};
const pdvClearBefore=$('clearFilters').onclick;
$('clearFilters').onclick=()=>{[...$('fPdvs').options].forEach(o=>o.selected=false);$('fCobertura').value='';pdvClearBefore();};
async function savePdvCoverage(accion){
 const pdv=$('assignPdv').value;if(!pdv)throw Error('Selecciona un PDV.');
 const ids=accion==='estilo'?[]:[...selected];if(accion!=='estilo'&&!ids.length)throw Error('Selecciona distritos en la tabla o el mapa.');
 const visible=new Set(view.districts.map(d=>d.ubigeo)),hidden=ids.filter(id=>!visible.has(id)).length;
 if(accion==='quitar'||hidden){const name=state.puntos.find(p=>p.id===pdv)?.nombre||'PDV';if(!confirm((accion==='quitar'?'Quitar':'Asignar')+' '+ids.length+' distritos '+(accion==='quitar'?'del':'al')+' PDV '+name+'. '+(hidden?hidden+' están ocultos por los filtros. ':'')+'Se conservan las zonas, SLA y asignaciones de otros PDV. ¿Continuar?'))return;}
 await write('guardarCoberturaPdv',pdv,ids,accion,accion==='quitar'?null:{color:$('pdvBorderColor').value,grosor:Number($('pdvBorderWidth').value)});
 if(accion!=='estilo'){ids.forEach(id=>selected.delete(id));refreshView();}
 say(accion==='estilo'?'Color de cobertura y grosor del borde guardados.':'Cobertura PDV guardada.');
}
$('pdvAssign').onclick=run(()=>savePdvCoverage('asignar'));$('pdvUnassign').onclick=run(()=>savePdvCoverage('quitar'));$('pdvSaveStyle').onclick=run(()=>savePdvCoverage('estilo'));
function ensurePdvWorker(){
 if(pdvWorker)return;
 pdvWorker=new Worker(new URL('assets/coverage-worker.js?v=4',document.baseURI));
 pdvWorker.onmessage=e=>{
  const m=e.data;if(m.request!==pdvDrawRequest||!map)return;
  if(m.type==='failure')pdvDrawErrors.push(pdvDrawJobs.get(m.id)?.nombre||m.id);
  if(m.type==='outline'){
   const c=pdvDrawJobs.get(m.id);if(!c)return;
   // Union polygons have no internal district edges. Holes remain unserved.
   L.geoJSON({type:'Feature',properties:{pdv:c.pdv},geometry:m.geometry},{pane:'pdvCoveragePane',interactive:false,style:{color:c.color,weight:c.grosor,opacity:1,fill:false,lineCap:'round',lineJoin:'round'}}).addTo(pdvOutlineLayer);
  }
  if(m.type==='done'){$('pdvOutlineStatus').textContent=pdvDrawErrors.length?'No se pudo calcular el contorno de: '+pdvDrawErrors.join(', ')+'. Las asignaciones siguen guardadas.':'Bordes de cobertura sobre los distritos visibles. El relleno muestra la zonificación. Si los bordes se superponen, filtra un PDV para distinguirlos.';$('pdvOutlineStatus').classList.toggle('pdv-error',!!pdvDrawErrors.length);}
 };
 pdvWorker.onerror=()=>{pdvWorker.terminate();pdvWorker=null;pdvDrawSignature='';$('pdvOutlineStatus').textContent='No se pudo cargar el cálculo de contornos. Verifica que coverage-worker.js y la carpeta vendor estén publicados dentro de assets.';$('pdvOutlineStatus').classList.add('pdv-error');};
 pdvWorker.postMessage({type:'init',features:GEOJSON_DISTRITOS.features});
}
function renderPdvOutlines(){
 if(!map||!view)return;
 if(!pdvOutlineLayer){if(!map.getPane('pdvCoveragePane')){const pane=map.createPane('pdvCoveragePane');pane.style.zIndex=430;pane.style.pointerEvents='none';}pdvOutlineLayer=L.layerGroup().addTo(map);}
 const selectedPdvs=values('fPdvs'),visible=new Set(view.districts.map(d=>d.ubigeo)),pts=new Map(state.puntos.filter(p=>p.tipo==='PDV').map(p=>[p.id,p]));
 const mode=$('coverageDisplay').value;
 const jobs=mode!=='bordes'?[]:pdvCoverages(state).filter(c=>pts.has(c.pdv)&&(!selectedPdvs.length||selectedPdvs.includes(c.pdv))).map(c=>({...c,nombre:pts.get(c.pdv).nombre,distritos:c.distritos.filter(id=>visible.has(id))})).filter(c=>c.distritos.length).sort((a,b)=>b.grosor-a.grosor||a.pdv.localeCompare(b.pdv));
 const signature=JSON.stringify([mode,jobs.map(c=>[c.pdv,c.nombre,c.color,c.grosor,c.distritos])]);if(signature===pdvDrawSignature)return;pdvDrawSignature=signature;pdvDrawRequest++;pdvDrawErrors=[];pdvDrawJobs=new Map(jobs.map(c=>[c.id,c]));pdvOutlineLayer.clearLayers();
 $('pdvLegend').innerHTML=jobs.map(c=>'<button class="pdv-legend-item" data-focus-pdv="'+esc(c.pdv)+'" title="Filtrar esta cobertura"><i class="pdv-line" style="--pdv-color:'+c.color+';--pdv-width:'+c.grosor+'px"></i>'+esc(c.nombre)+' · '+c.distritos.length+' distritos</button>').join('');
 $('pdvLegend').querySelectorAll('button').forEach(b=>b.onclick=()=>{[...$('fPdvs').options].forEach(o=>o.selected=o.value===b.dataset.focusPdv);$('fPdvs').dispatchEvent(new Event('change',{bubbles:true}));});
 $('pdvOutlineStatus').classList.remove('pdv-error');
 if(!jobs.length){
  const notes={
   pdv:'El relleno usa el color guardado de cada PDV. Gris: distrito compartido por varios de los PDV mostrados. Filtra un PDV o pulsa su nombre en la leyenda para ver toda su cobertura con su color. Los distritos sin PDV quedan claros.',
   tipos:'Un mismo tipo de zona usa el mismo color en todos sus distritos. Gris: varios tipos de zona en el mismo distrito. Pulsa un tipo en la leyenda para filtrarlo. Los distritos sin zona quedan claros.',
   zonas:'El relleno conserva el color de cada zona. Para comparar coberturas usa “PDV que cubre” en Colorear por.',
   bordes:'No hay coberturas PDV en los distritos visibles.'
  };
  $('pdvOutlineStatus').textContent=notes[mode]||notes.pdv;
  if(pdvWorker)pdvWorker.postMessage({type:'draw',request:pdvDrawRequest,jobs:[]});return;
 }
 $('pdvOutlineStatus').textContent='Calculando contornos de '+jobs.length+' PDV…';
 try{ensurePdvWorker();pdvWorker.postMessage({type:'draw',request:pdvDrawRequest,jobs:jobs.map(c=>({id:c.id,distritos:c.distritos}))});}catch(error){pdvDrawSignature='';$('pdvOutlineStatus').textContent='No se pudieron dibujar los contornos: '+error.message;$('pdvOutlineStatus').classList.add('pdv-error');}
}
const pdvModuleBefore=renderModule;
renderModule=function(){if(tab==='coberturasPdv')renderPdvModule();else pdvModuleBefore();};
function openPdvOnMap(id,assign){
 if(selected.size&&!confirm('Se limpiará la selección de distritos para abrir esta cobertura. ¿Continuar?'))return;
 selected.clear();$('clearFilters').onclick();
 [...$('fPdvs').options].forEach(o=>o.selected=!assign&&o.value===id);
 $('assignPdv').value=id;$('assignPdv').dispatchEvent(new Event('change',{bubbles:true}));$('coverageDisplay').value='pdv';$('coverageDisplay').dispatchEvent(new Event('change',{bubbles:true}));
 showTab('mapa');refreshView(true);
 if(assign){const c=pdvCoverage(state,id);if(c.distritos.length){const bounds=L.latLngBounds([]);for(const ub of c.distritos){const l=layers.get(ub);if(l)bounds.extend(l.getBounds());}if(bounds.isValid())map.fitBounds(bounds,{padding:[30,30],maxZoom:11});}else{const point=state.puntos.find(p=>p.id===id);if(point&&map)map.setView([point.lat,point.lon],10);}say('Selecciona distritos y pulsa Asignar cobertura. Los filtros quedan libres para ampliar la cobertura.');}
}
function renderPdvModule(){
 const admin=auth.rol==='ADMINISTRADOR';$('moduleTitle').textContent='Cobertura por PDV';$('moduleHint').textContent='Asigna distritos a los PDV registrados en Puntos geolocalizados. Conserva la zonificación y los SLA.';$('addEntity').hidden=true;
 const covers=pdvCoverages(state),count=coverageIndex().size;
 $('moduleContent').innerHTML='<div class="bar"><label>Buscar PDV<input id="coveragePdvSearch" class="coverage-list-search" type="search" placeholder="Nombre del PDV" value="'+esc(pdvModuleQuery)+'"></label><button id="coverageExportAll">Exportar coberturas Excel</button></div><div class="coverage-counts">'+metric('PDV con cobertura',covers.filter(c=>c.distritos.length).length)+metric('Distritos únicos cubiertos',count)+metric('Distritos sin PDV',catalog.length-count)+metric('Distritos compartidos',[...coverageIndex().values()].filter(x=>x.length>1).length)+'</div><div class="card scroll"><table class="coverage-table"><thead><tr><th>PDV</th><th>Área del punto</th><th>Distritos cubiertos</th><th>Color de cobertura</th><th>Grosor del borde</th><th>Acciones</th></tr></thead><tbody id="coveragePdvRows"></tbody></table></div><p class="hint pdv-note">No se asignan distritos automáticamente por la ubicación o la zona del punto. Un distrito puede tener varios PDV. Las guías del Excel son totales distritales: no equivalen a guías exclusivas de cada PDV.</p>';
 const rows=()=>{const points=state.puntos.filter(p=>p.tipo==='PDV'&&norm(p.nombre).includes(norm(pdvModuleQuery))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
 $('coveragePdvRows').innerHTML=points.map(p=>{const c=pdvCoverage(state,p.id);return '<tr><td>'+esc(p.nombre)+'</td><td>'+esc(nameOf('areas',p.area))+'</td><td>'+c.distritos.length+'</td><td><i class="pdv-line" style="--pdv-color:'+c.color+';--pdv-width:'+c.grosor+'px"></i> '+c.color+'</td><td>'+c.grosor+' px</td><td><button data-pdv-view="'+esc(p.id)+'">Ver cobertura</button>'+(admin?' <button data-pdv-assign="'+esc(p.id)+'">Asignar distritos / estilo</button>':'')+'</td></tr>';}).join('')||'<tr><td colspan="6">No hay PDV que coincidan. Regístralos como tipo PDV en Puntos geolocalizados.</td></tr>';
 $('coveragePdvRows').querySelectorAll('[data-pdv-view]').forEach(b=>b.onclick=()=>openPdvOnMap(b.dataset.pdvView,false));$('coveragePdvRows').querySelectorAll('[data-pdv-assign]').forEach(b=>b.onclick=()=>openPdvOnMap(b.dataset.pdvAssign,true));};
 $('coveragePdvSearch').oninput=e=>{pdvModuleQuery=e.target.value;rows();};$('coverageExportAll').onclick=run(()=>exportPdvExcel({}));rows();
}
function buildPdvExport(data,geography,f={}){
 const visible=visibleData(data,geography,f),geo=new Map(visible.districts.map(d=>[d.ubigeo,d])),index=pdvCoverageIndex(data),points=new Map(data.puntos.map(p=>[p.id,p]));
 const assignments=[['ID PDV','PDV','Área del PDV','UBIGEO','Distrito','Provincia','Departamento','Color de cobertura','Grosor del borde (px)','Cantidad de PDV que cubren','PDV que cubren el distrito','Zonas y SLA (días)']];
 for(const c of pdvCoverages(data)){const p=points.get(c.pdv);if(!p||p.tipo!=='PDV'||f.pdvs?.length&&!f.pdvs.includes(c.pdv))continue;
 for(const ub of c.distritos){const d=geo.get(ub);if(!d)continue;const owners=index.get(ub)||[],zs=data.zonas.filter(z=>z.distritos.some(x=>x.ubigeo===ub)).map(z=>{const sla=z.distritos.find(x=>x.ubigeo===ub);return z.nombre+': reparto '+sla.slaReparto+' + traslado '+sla.slaTraslado+' = '+sla.sla;}).join(' | ');
 assignments.push([p.id,p.nombre,data.areas.find(a=>a.id===p.area)?.nombre||'',ub,d.distrito,d.provincia,d.departamento,c.color,c.grosor,owners.length,owners.map(x=>x.point.nombre).join(' | '),zs]);}}
 const unassigned=[['UBIGEO','Distrito','Provincia','Departamento']];for(const d of visible.districts)if(!index.has(d.ubigeo))unassigned.push([d.ubigeo,d.distrito,d.provincia,d.departamento]);
 return {assignments,unassigned};
}
function exportPdvExcel(f){
 if(!window.XLSX)throw Error('No se cargó el generador de Excel. Recarga la página.');
 const result=buildPdvExport(state,catalog,f),book=XLSX.utils.book_new();
 const info=[['Concepto','Valor'],['Alcance','Asignaciones PDV-distrito guardadas que coinciden con los filtros; se incluyen distritos sin zona.'],['Fecha (Perú)',new Date().toLocaleString('es-PE',{timeZone:'America/Lima'})],['Revisión',state.revision],['Filtros',JSON.stringify(f)],['Cobertura compartida','Una fila por PDV y distrito. No sumar estas filas como distritos únicos.'],['Indicadores','El Excel operativo contiene agregados distritales. No se distribuyen guías entre PDV.'],['SLA','Se conserva por zona y distrito, independiente de la cobertura PDV.']];
 for(const [name,rows] of [['Cobertura PDV',result.assignments],['Distritos sin PDV',result.unassigned],['Información',info]]){const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=rows[0].map((_,i)=>({wch:Math.min(65,Math.max(14,...rows.slice(0,500).map(r=>String(r[i]??'').length))+2)}));sheet['!autofilter']={ref:sheet['!ref']};XLSX.utils.book_append_sheet(book,sheet,name);}
 XLSX.writeFile(book,'Cobertura_PDV_'+new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'})+'.xlsx',{compression:true});say('Excel de coberturas generado.');
}
const coverageExportButton=document.createElement('button');coverageExportButton.id='exportCoverage';coverageExportButton.textContent='Exportar cobertura PDV';$('exportZoning').after(coverageExportButton);coverageExportButton.onclick=run(()=>exportPdvExcel(filters()));
const pdvZoningExportBefore=buildZoningExport;
buildZoningExport=function(data,geography,f,daysMode){const tables=pdvZoningExportBefore(data,geography,f,daysMode),index=pdvCoverageIndex(data);tables.zoning[0].push('PDV que cubren el distrito','Cantidad de PDV');for(const row of tables.zoning.slice(1)){const owners=index.get(row[2])||[];row.push(owners.map(x=>x.point.nombre).join(' | '),owners.length);}tables.coverage=buildPdvExport(data,geography,f).assignments;tables.info.push(['Cobertura PDV','Relación independiente por PDV y distrito. No modifica las zonas ni sus SLA.'],['Filtro: PDV',(f.pdvs||[]).map(id=>data.puntos.find(p=>p.id===id)?.nombre||id).join(' | ')||'Todos'],['Filtro: cobertura PDV',f.cobertura||'Todos']);return tables;};
