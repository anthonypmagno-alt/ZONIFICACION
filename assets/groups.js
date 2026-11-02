/* Agrupaciones: referencias a modelos guardados, sin duplicar rutas. */
names.agrupaciones='Agrupaciones de rutas';
let groupSelected='',groupMap=null,groupLayers=null;
const groupColors=['#123b65','#0d9488','#ea580c','#9333ea','#0891b2','#db2777'];
const groupHidden=new Set();
const getGroups=()=>state.parametros.filter(p=>p.tipo==='agrupacion');
const groupRenderBefore=renderModule;
renderModule=function(){if(tab==='agrupaciones')renderGroups();else groupRenderBefore();};
const groupTabBefore=showTab;
showTab=function(next){groupTabBefore(next);if(tab!=='agrupaciones'&&groupMap){groupMap.remove();groupMap=null;}};
const groupAddBefore=$('addEntity').onclick;
$('addEntity').onclick=()=>tab==='agrupaciones'?editGroup():groupAddBefore();
function groupRouteIds(g){return [g.principal,...g.conexiones];}
function groupPath(r){return r.tramos.map((t,i)=>(i===0?routePointName(t.origen)+' → ':'')+routePointName(t.destino)).join(' → ');}
function renderGroups(){
 if(groupMap){groupMap.remove();groupMap=null;}
 const admin=auth.rol==='ADMINISTRADOR',groups=getGroups();
 if(!groups.some(g=>g.id===groupSelected))groupSelected=groups[0]?.id||'';
 const g=groups.find(g=>g.id===groupSelected);
 $('moduleTitle').textContent=names.agrupaciones;$('moduleHint').textContent='Ruta principal y conexiones. Cada recorrido conserva sus costos y programación independiente.';
 $('addEntity').hidden=!admin;$('addEntity').textContent='+ Nueva agrupación';
 $('moduleContent').innerHTML='<div class="bar"><label>Agrupación<select id="groupSelect">'+optionList(groups,[groupSelected],true)+'</select></label>'+(g&&admin?'<div class="actions"><button id="groupEdit">Editar agrupación</button><button id="groupDelete" class="danger">Eliminar agrupación</button></div>':'')+'</div>'+(g?'<div class="group-layout"><aside id="groupList" class="card"></aside><div><div class="card"><div class="bar"><label><input id="groupLines" type="checkbox" checked> Mostrar líneas</label><button id="groupFit">Enfocar recorridos</button></div><div id="groupMap"></div></div><p class="hint">Líneas directas entre coordenadas registradas; no representan carreteras. Los números indican el orden de visita dentro de cada ruta.</p><div id="groupMetrics" class="group-metrics"></div></div></div><div class="card scroll"><table><thead><tr><th>Ruta</th><th>Tipo</th><th>Tránsito + operación</th><th>Km</th><th>Guías por ruta</th><th>Sacos</th><th>m³</th><th>Costo de ruta</th></tr></thead><tbody id="groupTable"></tbody></table></div><p class="hint">Guías, sacos y volumen se muestran por recorrido: una misma carga puede viajar en la principal y en una conexión. No se calcula un total de paquetes únicos ni un tiempo conjunto de viaje.</p>':'<p class="empty">Crea tus rutas, asígnales el tipo Interprovincial o Conexión y luego crea una agrupación.</p>');
 $('groupSelect').onchange=e=>{groupSelected=e.target.value;groupHidden.clear();renderGroups();};
 if(!g)return;
 if(admin){$('groupEdit').onclick=()=>editGroup(g);$('groupDelete').onclick=run(async()=>{if(confirm('¿Eliminar esta agrupación? Sus rutas se conservarán.')){await write('eliminarAgrupacion',g.id);}});}
 const routes=groupRouteIds(g).map(id=>state.rutas.find(r=>r.id===id)).filter(Boolean);
 $('groupList').innerHTML='<h3>Rutas de la agrupación</h3>'+routes.map((r,i)=>'<label class="group-route"><input type="checkbox" data-group-route="'+esc(r.id)+'" '+(!groupHidden.has(r.id)?'checked':'')+'><div><b style="color:'+groupColors[i%groupColors.length]+'">'+esc(routeTypeLabel(r.tipoRuta))+'</b><strong>'+esc(r.nombre)+'</strong><span>'+esc(groupPath(r))+'</span><small>'+(i===0?'Una unidad principal':'Unidad de distribución · Enlace: '+esc(routePointName(r.tramos[0].origen)))+'</small></div></label>').join('');
 $('groupList').querySelectorAll('input').forEach(el=>el.onchange=()=>{if(el.checked)groupHidden.delete(el.dataset.groupRoute);else groupHidden.add(el.dataset.groupRoute);drawGroup(g,false);});
 $('groupTable').innerHTML=routes.map(r=>{const t=routeTotals(r).total;return '<tr><td>'+esc(r.nombre)+'</td><td>'+esc(routeTypeLabel(r.tipoRuta))+'</td><td>'+durationText(t.duracion)+'</td><td>'+fmt(t.km)+'</td><td>'+fmt(t.guias)+'</td><td>'+fmt(t.sacos)+'</td><td>'+volumeText(t.volumenM3)+'</td><td>'+programMoney(r.costo)+'</td></tr>';}).join('');
 $('groupMetrics').innerHTML=metric('Rutas incluidas',routes.length)+metric('Interprovincial',1)+metric('Conexiones',g.conexiones.length);
 if(window.L){groupMap=L.map('groupMap',{preferCanvas:true}).setView([-9.2,-75],5);addMaximize(groupMap);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(groupMap);groupLayers=L.layerGroup().addTo(groupMap);drawGroup(g,true);setTimeout(()=>groupMap?.invalidateSize(),0);}else $('groupMap').textContent='No se pudo cargar el mapa. Revisa la conexión.';
 $('groupLines').onchange=()=>drawGroup(g,false);$('groupFit').onclick=()=>drawGroup(g,true);
}
function drawGroup(g,fit){
 if(!groupMap)return;groupLayers.clearLayers();const bounds=[];
 groupRouteIds(g).forEach((id,i)=>{
  if(groupHidden.has(id))return;const r=state.rutas.find(r=>r.id===id);if(!r)return;
  const color=groupColors[i%groupColors.length];let n=0,prev=null;
  r.tramos.forEach(t=>{
   const a=routePoint(t.origen),b=routePoint(t.destino);if(!a||!b)return;
   const ac=[a.lat,a.lon],bc=[b.lat,b.lon];bounds.push(ac,bc);
   if($('groupLines').checked)L.polyline([ac,bc],{color,weight:i===0?6:3,opacity:.85}).addTo(groupLayers).bindTooltip(esc(r.nombre));
   const mark=(p)=>{n++;L.circleMarker([p.lat,p.lon],{radius:i===0?9:6,color,weight:2,fillColor:'white',fillOpacity:1}).addTo(groupLayers).bindTooltip(esc(p.nombre)+' · '+n,{permanent:true,direction:i%2?'bottom':'top',className:'group-stop'}).bindPopup('<b>'+esc(p.nombre)+'</b><br>'+esc(r.nombre)+'<br>'+pointMapsLink(p));};
   if(prev!==a.id)mark(a);mark(b);prev=b.id;
  });
 });
 if(fit&&bounds.length)groupMap.fitBounds(bounds,{padding:[45,45],maxZoom:12});
}
function editGroup(existing){
 if(auth.rol!=='ADMINISTRADOR')return;
 const d=document.createElement('dialog');d.innerHTML='<form id="groupForm"><div class="dialog-body"><h2>'+ (existing?'Editar agrupación':'Nueva agrupación')+'</h2><label>Nombre<input id="groupName" maxlength="150" required value="'+esc(existing?.nombre||'')+'"></label><label>Ruta principal interprovincial<select id="groupMain" required>'+optionList(state.rutas.filter(r=>r.tipoRuta==='INTERPROVINCIAL'),[existing?.principal],true)+'</select></label><label>Buscar conexión<input id="groupSearch" placeholder="Escribe el nombre de la ruta"></label><div id="groupChoices"></div><p class="hint">Solo aparecen conexiones cuyo primer origen pertenece a la principal. Clasifica las rutas desde el módulo Rutas. Puedes incluir una ruta en varias agrupaciones.</p><p id="groupError" role="alert"></p></div><div class="footer"><button type="button" id="groupCancel">Cancelar</button><button class="primary" type="submit">Guardar agrupación</button></div></form>';
 document.body.appendChild(d);const checked=new Set(existing?.conexiones||[]);
 const choices=()=>{const main=state.rutas.find(r=>r.id===$('groupMain').value),points=new Set(main?.tramos.flatMap(t=>[t.origen,t.destino])||[]),q=norm($('groupSearch').value);
 const candidates=state.rutas.filter(r=>r.tipoRuta==='CONEXION'&&points.has(r.tramos[0]?.origen));
 for(const id of checked)if(!candidates.some(r=>r.id===id))checked.delete(id);
 $('groupChoices').innerHTML=candidates.filter(r=>norm(r.nombre).includes(q)).map(r=>'<label class="group-choice"><input type="checkbox" value="'+esc(r.id)+'" '+(checked.has(r.id)?'checked':'')+'><span>'+esc(r.nombre)+'<small>Enlace: '+esc(routePointName(r.tramos[0].origen))+'</small></span></label>').join('')||'<p class="hint">No hay conexiones compatibles con esta selección.</p>';
 $('groupChoices').querySelectorAll('input').forEach(el=>el.onchange=()=>el.checked?checked.add(el.value):checked.delete(el.value));};
 $('groupMain').onchange=choices;$('groupSearch').oninput=choices;
 $('groupCancel').onclick=()=>d.close();d.onclose=()=>d.remove();
 $('groupForm').onsubmit=async e=>{e.preventDefault();const button=d.querySelector('[type=submit]');button.disabled=true;try{const input={id:existing?.id||'',nombre:$('groupName').value,principal:$('groupMain').value,conexiones:[...checked]};await write('guardarAgrupacion',input);groupSelected=existing?.id||getGroups().find(g=>g.nombre===input.nombre.trim())?.id||'';d.close();renderGroups();}catch(err){$('groupError').textContent=err.message;}finally{button.disabled=false;}};
 choices();d.showModal();
}
