// Cobertura territorial de PDV: independiente de la zonificación y del SLA.
const PDV_COLORS=['#dc2626','#7c3aed','#0891b2','#059669','#c2410c','#be185d','#1d4ed8','#854d0e'];
function pdvDefaultColor(id){let h=0;for(const c of String(id))h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return PDV_COLORS[h%PDV_COLORS.length];}
function pdvCoverages(state){return (state.parametros||[]).filter(p=>p.tipo==='cobertura_pdv');}
function pdvCoverage(state,id){return pdvCoverages(state).find(p=>p.pdv===id)||{id:'cobertura-pdv:'+id,tipo:'cobertura_pdv',pdv:id,color:pdvDefaultColor(id),grosor:4,distritos:[]};}
function pdvCoverageIndex(state){
 const points=new Map(state.puntos.filter(p=>p.tipo==='PDV').map(p=>[p.id,p]));const byDistrict=new Map();
 for(const c of pdvCoverages(state)){const point=points.get(c.pdv);if(!point)continue;for(const id of c.distritos){if(!byDistrict.has(id))byDistrict.set(id,[]);byDistrict.get(id).push({point,coverage:c});}}
 return byDistrict;
}
function validatePdvCoverage(input,points,catalog){
 if(!input||typeof input!=='object')throw Error('Cobertura PDV inválida.');
 if(!points.some(p=>p.id===input.pdv&&p.tipo==='PDV'))throw Error('Selecciona un punto geolocalizado de tipo PDV.');
 const id='cobertura-pdv:'+input.pdv;
 if(input.id!=null&&input.id!==id)throw Error('ID de cobertura PDV inválido.');
 if(typeof input.color!=='string'||!/^#[0-9a-f]{6}$/i.test(input.color))throw Error('Selecciona un color de borde válido.');
 if(typeof input.grosor!=='number'||!Number.isInteger(input.grosor)||input.grosor<2||input.grosor>8)throw Error('El grosor debe ser un entero de 2 a 8 píxeles.');
 const valid=new Set(catalog.map(c=>c.ubigeo));
 if(!Array.isArray(input.distritos)||input.distritos.length>2000||input.distritos.some(d=>typeof d!=='string'||!valid.has(d))||new Set(input.distritos).size!==input.distritos.length)throw Error('Distritos de cobertura PDV inválidos o repetidos.');
 return {id,tipo:'cobertura_pdv',pdv:input.pdv,color:input.color.toLowerCase(),grosor:input.grosor,distritos:[...input.distritos].sort()};
}
