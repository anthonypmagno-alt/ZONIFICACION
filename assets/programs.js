
names.programaciones='Programaciones de rutas';
let programDraft=null,programDirty=false;
const programFilters={rutas:[],desde:'',hasta:'',transportador:''};
const programMoney=n=>n==null?'—':'S/ '+Number(n).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
function programDay(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
function programTotals(p){return (p.tramos||[]).reduce((a,t)=>({guias:a.guias+Number(t.guias||0),sacos:a.sacos+Number(t.sacos||0)}),{guias:0,sacos:0});}
function filteredPrograms(rows,f){return rows.filter(p=>(!f.rutas.length||f.rutas.includes(p.rutaId))&&(!f.desde||p.fecha>=f.desde)&&(!f.hasta||p.fecha<=f.hasta)&&(!f.transportador||norm(p.transportador).includes(norm(f.transportador)))).sort((a,b)=>b.fecha.localeCompare(a.fecha)||String(b.creado).localeCompare(String(a.creado)));}
function summarizePrograms(rows){const n=rows.length,s=rows.reduce((a,p)=>{const t=programTotals(p);a.guias+=t.guias;a.sacos+=t.sacos;a.costo+=Number(p.costo);return a;},{guias:0,sacos:0,costo:0});return {...s,cantidad:n,guiasPromedio:n?s.guias/n:null,sacosPromedio:n?s.sacos/n:null,costoPromedio:n?s.costo/n:null};}
function programModel(route){const pts=new Map(state.puntos.map(p=>[p.id,p]));return {rutaId:route.id,rutaNombre:route.nombre,tramos:route.tramos.map(t=>({origen:t.origen,destino:t.destino,origenNombre:pts.get(t.origen)?.nombre||'Punto no disponible',destinoNombre:pts.get(t.destino)?.nombre||'Punto no disponible',guias:'',sacos:''}))};}
function discardProgram(){return !programDirty||confirm('¿Descartar los cambios sin guardar de la programación?');}
function newProgram(){if(!discardProgram())return;if(!state.rutas.length){say('Primero crea y guarda un modelo en Rutas.',true);return;}programDraft={id:'',rutaId:'',rutaNombre:'',fecha:programDay(),transportador:'',costo:'',tramos:[]};programDirty=true;renderPrograms();}
const programPreviousRender=renderModule;
renderModule=function(){if(tab==='programaciones')renderPrograms();else{$('addEntity').textContent='Crear registro';programPreviousRender();}};
const programPreviousTab=showTab;
showTab=function(next){if(tab==='programaciones'&&next!==tab){if(!discardProgram())return;programDraft=null;programDirty=false;}programPreviousTab(next);};
const programPreviousAdd=$('addEntity').onclick;
$('addEntity').onclick=()=>tab==='programaciones'?newProgram():programPreviousAdd();
const programPreviousRefresh=$('refresh').onclick;
$('refresh').onclick=run(async e=>{if(tab==='programaciones'){if(!discardProgram())return;programDraft=null;programDirty=false;}await programPreviousRefresh(e);});
const programPreviousClick=$('moduleContent').onclick;
$('moduleContent').onclick=run(async e=>{
  if(tab!=='programaciones'){await programPreviousClick(e);return;}
  const button=e.target.closest('button[data-program-action]');if(!button)return;
  const action=button.dataset.programAction;
  if(action==='clear'){Object.assign(programFilters,{rutas:[],desde:'',hasta:'',transportador:''});renderPrograms();return;}
  if(action==='open'||action==='copy'){
    if(!discardProgram())return;const saved=(state.programaciones||[]).find(p=>p.id===button.dataset.id);if(!saved)throw Error('Programación no disponible.');
    programDraft=cloneRoute(saved);programDirty=false;
    if(action==='copy'){if(auth.rol!=='ADMINISTRADOR')return;programDraft.id='';programDraft.copiaDe=saved.id;programDraft.fecha=programDay();delete programDraft.creado;delete programDraft.actualizado;programDirty=true;}
    renderPrograms();$('programEditor')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  if(action==='cancel'&&discardProgram()){programDraft=null;programDirty=false;renderPrograms();}
  if(action==='save'){
    if(auth.rol!=='ADMINISTRADOR'||!programDraft)return;
    if(!$('programForm').reportValidity())return;
    if(!programDraft.tramos.length)throw Error('Selecciona un modelo de ruta.');
    const payload=cloneRoute(programDraft);button.disabled=true;
    try{await write('guardarProgramacion',payload);programDraft=null;programDirty=false;renderPrograms();say('Programación guardada. El resumen refleja los filtros seleccionados.');}
    finally{if(button.isConnected)button.disabled=false;}
  }
});
window.addEventListener('beforeunload',e=>{if(programDirty){e.preventDefault();e.returnValue='';}});
function renderPrograms(){
  const admin=auth.rol==='ADMINISTRADOR';$('moduleTitle').textContent=names.programaciones;$('moduleHint').textContent='Registra cantidades reales por destino a partir de un modelo de ruta. Los promedios corresponden a las programaciones filtradas.';$('addEntity').hidden=!admin;$('addEntity').textContent='Nueva programación';
  const routes=new Map(state.rutas.map(r=>[r.id,{id:r.id,nombre:r.nombre}]));
  for(const p of state.programaciones||[])if(!routes.has(p.rutaId))routes.set(p.rutaId,{id:p.rutaId,nombre:p.rutaNombre+' (histórico)'});
  $('moduleContent').innerHTML='<div class="filters program-filters"><label>Rutas<select id="programFilterRoutes" multiple>'+optionList([...routes.values()],programFilters.rutas)+'</select></label><label>Desde<input id="programFrom" type="date" value="'+esc(programFilters.desde)+'"></label><label>Hasta<input id="programTo" type="date" value="'+esc(programFilters.hasta)+'"></label><label>Transportador<input id="programCarrierFilter" value="'+esc(programFilters.transportador)+'" placeholder="Buscar transportador"></label><button type="button" data-program-action="clear">Limpiar filtros</button></div><div id="programFilterError" class="hint" role="status"></div><div id="programSummary" class="metrics program-metrics"></div><p class="hint">Promedios = total de guías, sacos o costo ÷ cantidad de programaciones. Solo incluye registros guardados que coinciden con los filtros.</p><div class="card scroll"><table class="program-list"><thead><tr><th>Día de programación</th><th>Ruta</th><th>Transportador</th><th>Destinos / tramos</th><th>Guías</th><th>Sacos</th><th>Monto del traslado</th><th>Acciones</th></tr></thead><tbody id="programRows"></tbody></table></div><div id="programEditor"></div>';
  $('programFilterRoutes').onchange=()=>{programFilters.rutas=values('programFilterRoutes');renderProgramList();};
  for(const [id,key] of [['programFrom','desde'],['programTo','hasta'],['programCarrierFilter','transportador']])$(id).oninput=e=>{programFilters[key]=e.target.value;renderProgramList();};
  renderProgramList();renderProgramEditor();
}
function renderProgramList(){
  const invalid=programFilters.desde&&programFilters.hasta&&programFilters.desde>programFilters.hasta;
  $('programFilterError').textContent=invalid?'La fecha Desde no puede ser posterior a Hasta.':'';
  const rows=invalid?[]:filteredPrograms(state.programaciones||[],programFilters),s=summarizePrograms(rows);
  $('programSummary').innerHTML=metric('Cantidad de programaciones',fmt(s.cantidad))+metric('Guías totales',fmt(s.guias))+metric('Sacos totales',fmt(s.sacos))+metric('Guías promedio',fmt(s.guiasPromedio))+metric('Sacos promedio',fmt(s.sacosPromedio))+metric('Costo promedio',programMoney(s.costoPromedio))+metric('Costo total',programMoney(s.costo));
  $('programRows').innerHTML=rows.map(p=>{const t=programTotals(p);return '<tr><td>'+esc(p.fecha.split('-').reverse().join('/'))+'</td><td>'+esc(p.rutaNombre)+'</td><td class="carrier">'+esc(p.transportador)+'</td><td>'+p.tramos.length+'</td><td>'+fmt(t.guias)+'</td><td>'+fmt(t.sacos)+'</td><td>'+programMoney(p.costo)+'</td><td><button data-program-action="open" data-id="'+esc(p.id)+'">'+(auth.rol==='ADMINISTRADOR'?'Ver / editar':'Ver')+'</button> '+(auth.rol==='ADMINISTRADOR'?'<button data-program-action="copy" data-id="'+esc(p.id)+'">Copiar</button>':'')+'</td></tr>';}).join('')||'<tr><td colspan="8" class="empty">No hay programaciones para estos filtros.</td></tr>';
}
function renderProgramEditor(){
  const box=$('programEditor');if(!programDraft){box.innerHTML='';return;}
  const p=programDraft,admin=auth.rol==='ADMINISTRADOR',disabled=admin?'':'disabled';
  const models=state.rutas.map(r=>({id:r.id,nombre:r.nombre}));if(p.rutaId&&!models.some(r=>r.id===p.rutaId))models.push({id:p.rutaId,nombre:p.rutaNombre+' (histórico)'});
  box.innerHTML='<form id="programForm" class="card program-editor"><div class="bar"><h2>'+(p.id?'Programación guardada':p.copiaDe?'Copia de programación':'Nueva programación')+'</h2><span id="programDirty" class="hint"></span></div><div class="route-fields"><label>Modelo de ruta<select id="programRoute" required '+disabled+'>'+optionList(models,[p.rutaId],true)+'</select></label><label>Día de programación<input id="programDate" type="date" min="1900-01-01" max="9999-12-31" required value="'+esc(p.fecha)+'" '+disabled+'></label><label>Transportador<input id="programCarrier" required maxlength="150" value="'+esc(p.transportador)+'" '+disabled+' placeholder="Nombre o empresa"></label><label>Monto del traslado (S/)<input id="programCost" type="number" min="0" step="0.01" required value="'+esc(p.costo)+'" '+disabled+'></label></div><p class="hint" style="padding:0 16px 14px">Guías y sacos se ingresan por destino de tramo. Los sacos son cantidades manuales, independientes de guías por saco del modelo. Copiar conserva las cantidades y el monto para que puedas editarlos; la fecha inicia en hoy. Cambiar el modelo carga sus puntos y deja las cantidades vacías.</p><div class="scroll"><table><thead><tr><th>Orden</th><th>Origen</th><th>Destino</th><th>Guías para destino</th><th>Cantidad de sacos</th></tr></thead><tbody>'+p.tramos.map((t,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(t.origenNombre)+'</td><td>'+esc(t.destinoNombre)+'</td><td><input type="number" min="0" step="1" required data-program-leg="'+i+'" data-field="guias" aria-label="Guías destino '+(i+1)+'" value="'+esc(t.guias)+'" '+disabled+'></td><td><input type="number" min="0" step="1" required data-program-leg="'+i+'" data-field="sacos" aria-label="Sacos destino '+(i+1)+'" value="'+esc(t.sacos)+'" '+disabled+'></td></tr>').join('')+'</tbody><tfoot><tr><td colspan="3">Total de la programación</td><td id="programGuidesTotal"></td><td id="programSacksTotal"></td></tr></tfoot></table></div><p class="hint" style="padding:12px 16px">'+(p.id?'ID: '+esc(p.id)+' · Última modificación: '+esc(p.actualizado||'')+' · '+esc(p.actualizadoPor||''):'')+'</p><div class="footer"><button type="button" data-program-action="cancel">Cerrar</button>'+(admin?'<button type="button" class="primary" data-program-action="save">Guardar programación</button>':'')+'</div></form>';
  $('programForm').onsubmit=e=>e.preventDefault();
  $('programRoute').onchange=e=>{const id=e.target.value;if(id===programDraft.rutaId)return;if(programDraft.tramos.length&&!confirm('¿Cambiar el modelo y vaciar las guías y sacos ingresados?')){e.target.value=programDraft.rutaId;e.target.dispatchEvent(new Event('change',{bubbles:true}));return;}const route=state.rutas.find(r=>r.id===id);Object.assign(programDraft,route?programModel(route):{rutaId:'',rutaNombre:'',tramos:[]});programDirty=true;renderProgramEditor();};
  for(const [id,key] of [['programDate','fecha'],['programCarrier','transportador'],['programCost','costo']])$(id).oninput=e=>{programDraft[key]=e.target.value;programDirty=true;updateProgramDraft();};
  box.querySelectorAll('[data-program-leg]').forEach(el=>el.oninput=()=>{programDraft.tramos[Number(el.dataset.programLeg)][el.dataset.field]=el.value;programDirty=true;updateProgramDraft();});updateProgramDraft();
}
function updateProgramDraft(){
  $('programDirty').textContent=programDirty?'Cambios sin guardar':'Guardada';
  for(const [key,id] of [['guias','programGuidesTotal'],['sacos','programSacksTotal']]){
    const valid=programDraft.tramos.length&&programDraft.tramos.every(t=>String(t[key]??'').trim()!==''&&Number.isSafeInteger(Number(t[key]))&&Number(t[key])>=0);
    $(id).textContent=valid?fmt(programTotals(programDraft)[key]):'—';
  }
}
