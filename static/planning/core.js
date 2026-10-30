(function (root, factory) {
  const config = typeof module === 'object' && module.exports ? require('./regional-rules.json') : root.MAPA_BASE.metadata.regional_rules;
  const api = factory(config,root.MAPA_BASE?.metadata?.dm_labels||{});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanningCore = api;
})(typeof window === 'undefined' ? globalThis : window, function (rules,sourceLabels) {
  'use strict';
  const decisions = ['Por evaluar', 'Conservar', 'Tomar', 'Ceder', 'Reasignar', 'No considerar'];
  const REGION=rules.home_region, regions=rules.regions;
  const zones = ['Centro', 'Norte', 'Poniente', 'Sur', 'Oriente'];
  const zoneColors = {Norte:'#38859a', Poniente:'#768c56', Centro:'#00704a', Oriente:'#d39236', Sur:'#a05279'};
  const regionColors = {'Centro Norte':'#006241','Centro Sur':'#b04270','Centro Poniente':'#7453a6','Centro Centro':'#2876b2','Bajío':'#c26a16'};
  const isOpen = s => s.status==='Actual' && s.active!==false && (!s.operating_status||s.operating_status==='Abierta');
  const hasPoint = s => !!s && validPoint(s.latitude,s.longitude);
  function directoryTree(base,search=''){
    const query=norm(search);
    const stores=base.stores.filter(s=>isOpen(s)&&(!query||norm([s.cc,s.store_name,s.region,s.dm,dmLabel(s.dm,base.metadata.dm_labels),s.dm_directory,s.municipality].join(' ')).includes(query)));
    return regions.map(region=>{const list=stores.filter(s=>s.region===region);const dms=[...new Set(list.map(s=>s.dm))].sort((a,b)=>dmLabel(a).localeCompare(dmLabel(b),'es'));return {region,total:list.length,dms:dms.map(dm=>({dm,total:list.filter(s=>s.dm===dm).length,stores:list.filter(s=>s.dm===dm).sort((a,b)=>a.store_name.localeCompare(b.store_name,'es'))}))};});
  }
  function regionalCounts(base,state,view='proposal') {
    const original=base.stores.filter(isOpen),proposed=current(base,state,view).filter(isOpen);
    return regions.map(region=>{
      const before=original.filter(s=>s.region===region),included=proposed.filter(s=>inRegion(s,region));
      const incoming=included.filter(s=>s.origin_region!==region),outgoing=proposed.filter(s=>s.origin_region===region&&!inRegion(s,region));
      return {region,base:before.length,total:included.length,delta:included.length-before.length,incoming:incoming.length,outgoing:outgoing.length,available:before.length>0,stores:included,dms:[...new Set(included.map(s=>s.dm))].map(dm=>({dm,total:included.filter(s=>s.dm===dm).length}))};
    });
  }
  function reconcileState(previous,base,geo) {
    const state={...freshState(),...previous,updates:{},areas:{}};
    const codes=new Set(base.stores.map(s=>s.cc)),ids=new Set(geo.municipalities.features.map(f=>f.properties.id));
    for(const [cc,u] of Object.entries(previous.updates||{}))if(codes.has(cc))state.updates[cc]={...u};
    for(const [id,zone] of Object.entries(previous.areas||{}))if(ids.has(id)&&zones.includes(zone))state.areas[id]=zone;
    return state;
  }
  function auditRegions(base,state,geo,view='proposal') {
    const stores=current(base,state,view).filter(s=>isOpen(s)&&s.decision!=='No considerar'),items=[];
    for(const s of stores){
      if(!hasPoint(s)){items.push({cc:s.cc,store_name:s.store_name,region:s.region,zone:'Pendiente',reasons:['Coordenadas pendientes en el CMS; no se estima un pin.'],locationConfirmed:false});continue;}
      const located=stores.filter(hasPoint),area=findArea(s.latitude,s.longitude,geo),zone=area?mapZone(area.properties,state.areas):suggestedRegion(s.latitude,s.longitude);
      const reasons=[];
      if(!area)reasons.push('Fuera de los límites municipales disponibles; validar cobertura.');
      if(s.region===REGION&&zone==='Sur')reasons.push('Centro Norte en zona geográfica Sur; revisar si la cobertura es conveniente.');
      const peers=nearest(s,located.filter(x=>x.region===s.region),1),near=nearest(s,located,3);
      if(peers.length&&peers[0].km>20)reasons.push('A '+Math.round(peers[0].km)+' km de la tienda disponible más cercana de su región.');
      const other=near.filter(x=>x.region!==s.region&&x.km<=5);
      if(near.length===3&&other.length===3)reasons.push('Sus tres vecinas disponibles a menos de 5 km son de otra región.');
      const confirmed=base.stores.find(x=>x.cc===s.cc);
      // La confirmación aplica a esta coordenada exacta, no a cambios posteriores.
      const known=confirmed&&confirmed.location_verification&&confirmed.latitude===s.latitude&&confirmed.longitude===s.longitude;
      if(reasons.length)items.push({cc:s.cc,store_name:s.store_name,region:s.region,zone,reasons,locationConfirmed:!!known});
    }
    return {checked:stores.length,items,coverage:regions.map(region=>({region,available:stores.filter(s=>s.region===region).length}))};
  }
  // Esta capa usa límites municipales. Sus zonas por orientación son independientes
  // de las regiones comerciales y de los colores de los pines.
  function mapZone(properties,areas={}) {
    const assigned=areas[properties.id],original=properties.zone||properties.region;
    if(zones.includes(assigned))return assigned;
    if(zones.includes(original))return original;
    throw new Error('Zona geográfica desconocida.');
  }
  function cartographicStyle(properties,areas={},settings={}) {
    const visible=settings.visible!==false,selected=properties.id===settings.selectedId;
    const intensity=Number.isFinite(settings.opacity)?Math.min(.75,Math.max(.05,settings.opacity)):.5;
    return {color:selected?'#244b3a':'#ffffff',weight:selected?2.3:.55,fillColor:zoneColors[mapZone(properties,areas)],fillOpacity:visible?intensity:0,opacity:visible?.88:.2};
  }
  function setMapZone(state,id,zone) {
    if(!id||!zones.includes(zone))throw new Error('Asignación cartográfica inválida.');
    state.areas[id]=zone;
  }
  const dmColors = {'Enrique César':'#00754a','Nancy Rodríguez':'#2475bf','Vanessa Carreño':'#8654b8','Veronica García':'#bd6c21','Yazmin Chabela':'#c14f61','Yazmin García':'#8a6a43','David Carrasco':'#158594','Moni Morales':'#a548a2'};
  const palette = ['#3f66aa','#b46831','#4b8a50','#9554a5','#3c8f88','#b63c60'];
  const clean = value => String(value == null ? '' : value).trim();
  const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function originRegion(dm, provided) {
    if(clean(provided)) {
      const match=regions.find(r=>norm(r)===norm(provided));
      if(!match)throw new Error('Región inválida: '+provided);
      return match;
    }
    const region=rules.dm_origins[norm(dm)];
    return regions.includes(region)?region:REGION;
  }
  function dmLabel(dm,labels=sourceLabels){const label=labels[dm]||labels[norm(dm)]||rules.dm_labels[norm(dm)];return typeof label==='string'?label:dm;}
  function inRegion(s,region=REGION){return s.region===region&&s.decision!=='No considerar';}
  function movement(s){
    if(s.decision==='No considerar')return 'No considerar';
    const origin=s.origin_region||s.region;
    if(origin===s.region)return s.decision==='Por evaluar'?'Por evaluar':'Conservar';
    if(s.region===REGION)return 'Tomar';
    if(origin===REGION)return 'Ceder';
    return 'Reasignar';
  }
  function proposalUpdate(original,region){
    if(!regions.includes(region))throw new Error('Región destino inválida.');
    const s={...original,origin_region:original.region,region,decision:'Conservar'};
    return {region,decision:movement(s)};
  }
  function balance(base,state){
    const proposed=current(base,state),original=base.stores.filter(s=>s.region===REGION);
    const incoming=proposed.filter(s=>s.origin_region!==REGION&&inRegion(s));
    const outgoing=proposed.filter(s=>s.origin_region===REGION&&!inRegion(s));
    const kept=proposed.filter(s=>s.origin_region===REGION&&inRegion(s));
    const included=proposed.filter(s=>inRegion(s));
    const excluded=outgoing.filter(s=>s.decision==='No considerar');
    return {base:original.length,baseCurrent:original.filter(s=>s.status==='Actual').length,baseOpenings:original.filter(s=>s.status==='Apertura').length,incoming,outgoing,excluded,kept,included,total:included.length,current:included.filter(s=>s.status==='Actual').length,openings:included.filter(s=>s.status==='Apertura').length,delta:included.length-original.length};
  }
  const escape = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function coordinate(value) {
    const text = clean(value).replace(/^([+-]?\d+(?:\.\d+)?)\s*,$/, '$1');
    return text === '' ? NaN : Number(text);
  }
  function validPoint(lat, lng) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }
  function distance(a, b) {
    const r = Math.PI/180, dlat = (b.latitude-a.latitude)*r, dlng = (b.longitude-a.longitude)*r;
    const h = Math.sin(dlat/2)**2 + Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlng/2)**2;
    return 6371.0088*2*Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0,1-h)));
  }
  function inRing(point, ring) {
    let inside = false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const [x,y]=point, [xi,yi]=ring[i], [xj,yj]=ring[j];
      if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    return inside;
  }
  function contains(point, geometry) {
    const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
    return polygons.some(p=>inRing(point,p[0]) && !p.slice(1).some(h=>inRing(point,h)));
  }
  function findArea(lat, lng, geo) {
    if(!validPoint(lat,lng))return undefined;
    return geo.municipalities.features.find(f=>{
      const b=f.properties.bbox;
      return lng>=b[0] && lat>=b[1] && lng<=b[2] && lat<=b[3] && contains([lng,lat],f.geometry);
    });
  }
  function suggestedRegion(lat,lng) {
    const dx=(lng+99.1332)*0.943, dy=lat-19.4326;
    if(dx*dx+dy*dy <= 0.115**2) return 'Centro';
    return Math.abs(dx)>Math.abs(dy) ? (dx>0?'Oriente':'Poniente') : (dy>0?'Norte':'Sur');
  }
  function signature(stores) {
    let hash=2166136261;
    const s=JSON.stringify(stores.map(s=>[s.cc,s.store_name,s.dm,s.region,s.opening_date,s.latitude,s.longitude]).sort((a,b)=>a[0].localeCompare(b[0])));
    for(let i=0;i<s.length;i++) hash=Math.imul(hash ^ s.charCodeAt(i),16777619);
    return 'import-'+(hash>>>0).toString(16);
  }
  function excelDate(value) {
    if(!clean(value)) return null;
    if(value instanceof Date) return value.toISOString().slice(0,10);
    if(typeof value==='number') return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
    const text=clean(value);
    if(/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const d=new Date(text+'T00:00:00Z');
      if(Number.isFinite(+d) && d.toISOString().slice(0,10)===text)return text;
    }
    const m=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if(m) {const yy=m[3].length===2?2000+Number(m[3]):Number(m[3]); const d=new Date(Date.UTC(yy,Number(m[2])-1,Number(m[1])));if(d.getUTCDate()===Number(m[1])&&d.getUTCMonth()===Number(m[2])-1)return d.toISOString().slice(0,10);}
    throw new Error('Fecha inválida: '+text);
  }
  function parseLocations(rows,geo) {
    const stores=[], seen=new Set(), errors=[];
    const required=['CC','Nombre Tienda','DM','Fecha Apertura','Municipio','Cobertura','Latitud','Longitud'];
    if(!rows.length)throw new Error('La hoja Ubicaciones está vacía.');
    const headers=Object.keys(rows[0]);
    const missing=required.filter(h=>!headers.includes(h));
    if(missing.length)throw new Error('Faltan columnas: '+missing.join(', '));
    rows.forEach((row,i)=>{
      if(!required.some(h=>clean(row[h])))return;
      const cc=clean(row.CC), label='Fila '+(i+2)+': ';
      if(!/^\d{5}$/.test(cc)){errors.push(label+'CeCo debe tener cinco dígitos.');return;}
      if(seen.has(cc)){errors.push(label+'CeCo duplicado '+cc);return;}seen.add(cc);
      const latitude=coordinate(row.Latitud),longitude=coordinate(row.Longitud);
      if(!validPoint(latitude,longitude)){errors.push(label+'coordenadas inválidas.');return;}
      if(!clean(row['Nombre Tienda']) || !clean(row.DM)){errors.push(label+'nombre y DM son obligatorios.');return;}
      let date;
      try{date=excelDate(row['Fecha Apertura']);}catch(e){errors.push(label+e.message);return;}
      const area=findArea(latitude,longitude,geo);
      stores.push({cc,store_name:clean(row['Nombre Tienda']),dm:clean(row.DM),opening_date:date,municipality:clean(row.Municipio),coverage:clean(row.Cobertura),format:clean(row.Formato),commercial_format:clean(row['Formato Comercial']),tier:clean(row.Tier),latitude,longitude,active:!['no','false','0','inactiva'].includes(norm(row.Activa)),municipality_id:area?area.properties.id:null,geo_municipality:area?area.properties.name:null,region:originRegion(row.DM,row['Región']),zone:area?(area.properties.zone||area.properties.region):suggestedRegion(latitude,longitude),status:date?'Actual':'Apertura'});
    });
    if(errors.length)throw new Error(errors.slice(0,12).join('\n'));
    if(!stores.length)throw new Error('No se encontraron ubicaciones.');
    return stores.sort((a,b)=>a.cc.localeCompare(b.cc));
  }
  function freshState() {return {name:'Propuesta Centro Norte',updates:{},areas:{},dmColors:{},extraDms:[]};}
  function current(base,state,view='proposal') {
    return base.stores.map(s=>{
      const update=view==='base'?{}:(state.updates[s.cc]||{});
      const result={...s,decision:'Por evaluar',notes:'',...update,origin_region:s.region};
      // El origen es inmutable; los cambios de DM nunca infieren un cambio regional.
      if(!regions.includes(result.region))result.region=s.region;
      result.movement=movement(result);
      return result;
    });
  }
  function filtered(stores,filter) {
    return stores.filter(s=>(!filter.search || norm([s.cc,s.store_name,s.dm,dmLabel(s.dm),s.region,s.origin_region,s.municipality,s.geo_municipality].join(' ')).includes(norm(filter.search))) && (!filter.dm||s.dm===filter.dm)&&(!filter.zone||s.zone===filter.zone)&&(!filter.status||s.status===filter.status)&&(!filter.decision||s.movement===filter.decision||s.decision===filter.decision)&&(!filter.region||s.region===filter.region)&&(!filter.origin||s.origin_region===filter.origin)&&(!filter.scope||filter.scope==='all'||(filter.scope==='home'&&inRegion(s))||(filter.scope==='moves'&&(s.region!==s.origin_region||s.decision==='No considerar'))||(filter.scope==='external'&&s.origin_region!==REGION)||(filter.scope==='outgoing'&&s.origin_region===REGION&&!inRegion(s))));
  }
  function nearest(store,stores,n=3) {if(!hasPoint(store))return [];return stores.filter(s=>s.cc!==store.cc&&hasPoint(s)).map(s=>({...s,km:distance(store,s)})).sort((a,b)=>a.km-b.km).slice(0,n);}
  function validateBase(base) {
    if(!base || !base.metadata || typeof base.metadata.signature!=='string'||!Array.isArray(base.stores)||!base.stores.length||base.stores.length>10000) throw new Error('Base del escenario inválida.');
    const seen=new Set();
    base.stores.forEach(s=>{
      // Migrar la referencia geográfica de 3.0 sin convertirla en región comercial.
      if(!s.zone && zones.includes(s.region)){s.zone=s.region;s.region=originRegion(s.dm);}
      if(!/^\d{5}$/.test(s.cc)||seen.has(s.cc)||(!hasPoint(s)&&!(s.latitude===null&&s.longitude===null&&s.mapping_status==='Pendiente'))||!clean(s.store_name)||!clean(s.dm)||!regions.includes(s.region)||!(zones.includes(s.zone)||!hasPoint(s)&&s.zone===null)) throw new Error('La base contiene una ubicación inválida o duplicada.');
      if(s.opening_date!=null)excelDate(s.opening_date);
      seen.add(s.cc);
    });
    return base;
  }
  function readScenario(doc,existingBase,geo) {
    if(!doc || doc.schema!=='centronorte.scenario' || ![1,2].includes(doc.version)) throw new Error('No es un escenario compatible de Centro Norte.');
    const base=validateBase(doc.base || existingBase);
    if(doc.baseSignature!==base.metadata.signature)throw new Error('La firma de la base no coincide con el escenario.');
    const codes=new Set(base.stores.map(s=>s.cc)), areas=new Set(geo.municipalities.features.map(f=>f.properties.id));
    const state=freshState();state.name=clean(doc.name).slice(0,80)||state.name;
    for(const [cc,u] of Object.entries(doc.updates||{})) {
      if(!codes.has(cc)||!u||typeof u!=='object')throw new Error('El escenario tiene CeCo desconocidos.');
      const update={};
      if(u.dm!=null){if(!clean(u.dm)||clean(u.dm).length>80)throw new Error('DM inválido.');update.dm=clean(u.dm);}
      if(u.region!=null){if(doc.version===1&&zones.includes(u.region))update.zone=u.region;else {if(!regions.includes(u.region))throw new Error('Región inválida.');update.region=u.region;}}
      if(u.zone!=null){if(!zones.includes(u.zone))throw new Error('Zona inválida.');update.zone=u.zone;}
      if(u.decision!=null){if(!decisions.includes(u.decision))throw new Error('Decisión inválida.');update.decision=u.decision;}
      if(u.notes!=null)update.notes=clean(u.notes).slice(0,2000);
      if(u.latitude!=null||u.longitude!=null){if(!validPoint(u.latitude,u.longitude))throw new Error('Coordenadas del escenario inválidas.');update.latitude=u.latitude;update.longitude=u.longitude;}
      state.updates[cc]=update;
    }
    for(const [id,zone] of Object.entries(doc.areas||{})){if(!areas.has(id)||!zones.includes(zone))throw new Error('Asignación de fondo inválida.');state.areas[id]=zone;}
    for(const [dm,color] of Object.entries(doc.dmColors||{})){if(!clean(dm)||clean(dm).length>80||!/^#[a-fA-F0-9]{6}$/.test(color))throw new Error('Color de DM inválido.');Object.defineProperty(state.dmColors,dm,{value:color,enumerable:true,writable:true,configurable:true});}
    if(!Array.isArray(doc.extraDms||[]))throw new Error('Lista de DM inválida.');
    state.extraDms=[...new Set((doc.extraDms||[]).map(clean).filter(s=>s&&s.length<=80))].slice(0,100);
    return {base,state};
  }
  function pack(base,state){return {schema:'centronorte.scenario',version:2,baseSignature:base.metadata.signature,exportedAt:new Date().toISOString(),base,...state};}
  function csvCell(value) {
    let s=String(value??'');
    if(typeof value!=='number' && /^[=+@\-\t\r]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function csv(base,state,settings={}) {
    const byId=new Map(base.stores.map(s=>[s.cc,s]));
    const headers=['CeCo','Tienda','Región origen','Región propuesta','Movimiento','En Centro Norte propuesta','Estatus','Fecha apertura','Municipio Excel','Municipio por coordenada','DM base','DM propuesta','Zona base','Zona propuesta','Decisión','Notas','Latitud base','Longitud base','Latitud propuesta','Longitud propuesta','DM directorio','Estatus operativo','Fuente Región DM'];
    const rows=current(base,state).filter(s=>!settings.openOnly||isOpen(s)).map(s=>{const b=byId.get(s.cc);return [s.cc,s.store_name,b.region,s.region,s.movement,inRegion(s)?'Sí':'No',s.status,s.opening_date||'',s.municipality,s.geo_municipality,b.dm,s.dm,b.zone,s.zone,s.decision,s.notes,b.latitude,b.longitude,s.latitude,s.longitude,b.dm_directory||'',b.operating_status||'',b.directory_source||''];});
    return '\uFEFF'+[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
  }
  return {REGION,decisions,regions,rules,regionColors,isOpen,hasPoint,directoryTree,regionalCounts,reconcileState,auditRegions,originRegion,dmLabel,inRegion,movement,proposalUpdate,balance,zones,zoneColors,mapZone,cartographicStyle,setMapZone,dmColors,palette,clean,norm,escape,coordinate,validPoint,distance,contains,findArea,suggestedRegion,signature,excelDate,parseLocations,freshState,current,filtered,nearest,validateBase,readScenario,pack,csv};
});
