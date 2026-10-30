/* 4.4 · Un CMS: Región > DM > Tienda. El directorio conserva el origen. */
(() => {
  'use strict';
  const C=window.PlanningCore, geo=window.MAPA_GEO, $=id=>document.getElementById(id), e=C?C.escape:String;
  if(!C || !geo || !window.MAPA_BASE || !window.L) {
    document.body.innerHTML='<p style="padding:30px">No se pudo abrir el mapa. Extrae todo el ZIP y abre index.html dentro de la carpeta completa.</p>';return;
  }
  const STORAGE='centronorte-planning-v4';
  let base=window.MAPA_BASE,state=C.freshState(), view='base', focus=null, areaFocus=null;
  let inspectorMode=null,selected=new Set(), history=[], nearbyOn=false, moving=false, showBackground=true, showLabels=false,showNeighbors=true, opacity=0.38;
  let menusVisible=true,pinsVisible=true;
  let areaMode=false,areaStart=null,areaRectangle=null, toastTimer, tileErrors=0;
  let cachedStores=[],visible=[], markers=new Map();
  const filter={search:'',dm:'',zone:'',status:'Actual',decision:'',origin:'',region:C.REGION,scope:'all'};
  let drafts={};
  try{drafts=JSON.parse(localStorage.getItem(STORAGE+'-drafts')||'{}');}catch(error){}
  let auditResult={checked:0,items:[]};
  const geoById=new Map(geo.municipalities.features.map(f=>[f.properties.id,f]));
  const STATE_NAMES={'09':'Ciudad de México','13':'Hidalgo','15':'Estado de México','17':'Morelos','21':'Puebla','29':'Tlaxcala','16':'Michoacán','22':'Querétaro'};
  let scenarioNotice='';
  const insights=window.MAPA_INSIGHTS||{status:'missing',errors:['La revisión de datos no está disponible.']};
  const healthy=insights.status==='valid'&&insights.signature===base.metadata.signature;
  try {
    const saved=localStorage.getItem(STORAGE)||localStorage.getItem('centronorte-planning-v3');
    if(saved){
      const loaded=C.readScenario(JSON.parse(saved),base,geo);
      const sameSource=loaded.base.stores.length===base.stores.length&&base.stores.every(b=>loaded.base.stores.some(x=>x.cc===b.cc&&x.dm===b.dm&&x.latitude===b.latitude&&x.longitude===b.longitude&&x.opening_date===b.opening_date&&x.store_name===b.store_name));
      if(C.signature(loaded.base.stores)===C.signature(base.stores))state=loaded.state;
      else if(sameSource){localStorage.setItem(STORAGE+'-respaldo-anterior',saved);state=loaded.state;scenarioNotice='Propuesta anterior recuperada con las regiones de origen corregidas.';}
      else {localStorage.setItem(STORAGE+'-respaldo-anterior',saved);state=C.reconcileState(loaded.state,base,geo);scenarioNotice='Base actualizada: conservamos los ajustes de las tiendas identificadas y un respaldo completo del avance anterior.';}
    }
  }catch(error){scenarioNotice='No se pudo recuperar la propuesta anterior. La base publicada permanece disponible.';}
  if(Object.keys(state.updates).length)view='proposal';
  const map=L.map('map',{zoomControl:false,preferCanvas:true,minZoom:6,maxZoom:19,zoomSnap:.25,zoomDelta:.5}).setView([19.65,-99.12],10);
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.control.scale({position:'bottomright',imperial:false,maxWidth:100}).addTo(map);
  map.createPane('regions');map.getPane('regions').style.zIndex=250;
  map.createPane('labels');map.getPane('labels').style.zIndex=420;map.getPane('labels').style.pointerEvents='none';
  const inegiCrs=L.extend({},L.CRS.EPSG3857,{code:'EPSG:900913'});
  const tiles=L.tileLayer.wms('https://gaiamapas3.inegi.org.mx/mdmCache/service/wms',{crs:inegiCrs,layers:'MapaBaseTopograficov61_sinsombreado_gris',format:'image/jpeg',transparent:false,version:'1.1.1',maxZoom:19,attribution:'Cartografía y límites: <a href="https://www.inegi.org.mx/servicios/wsinfogeo/default.html" target="_blank" rel="noopener">INEGI</a> · Marco Geoestadístico, dic. 2025'}).addTo(map);
  tiles.on('tileload',()=>{$('tileStatus').textContent='Mapa base · INEGI';});
  tiles.on('tileerror',()=>{if(++tileErrors>2){map.removeLayer(tiles);$('tileStatus').textContent='Cartografía local · mapa base no disponible';}});
  const areasLayer=L.geoJSON(geo.municipalities,{pane:'regions',bubblingMouseEvents:false,style:areaStyle,onEachFeature:(feature,layer)=>{
    layer.on('click',event=>{
      if(areaMode){onAreaClick(event.latlng);return;}
      if(inspectorMode==='background'){areaFocus=feature.properties.id;renderBackgroundInspector();renderBackground();L.DomEvent.stopPropagation(event);}
    });
    layer.on('mouseover',()=>{if(inspectorMode==='background')layer.setStyle({weight:2,color:C.zoneColors[areaZone(feature.properties)],fillOpacity:showBackground?Math.min(.85,opacity+.1):0});});
    layer.on('mouseout',()=>layer.setStyle(areaStyle(feature)));
    layer.bindTooltip(()=>'<b>'+e(feature.properties.name)+'</b><br>'+e('Zona geográfica: '+areaZone(feature.properties))+'<br><small>Límite municipal INEGI</small>',{sticky:true});
  }}).addTo(map);
  const neighborLayer=L.geoJSON(geo.neighbors,{pane:'regions',style:{color:'#9ba58c',weight:1.1,dashArray:'5 4',fillColor:'#b4b9a5',fillOpacity:.09},onEachFeature:(f,l)=>l.bindTooltip(e(f.properties.name),{sticky:true})}).addTo(map);
  neighborLayer.bringToBack();
  const labelLayer=L.layerGroup().addTo(map),zoneNameLayer=L.layerGroup().addTo(map), nearLayer=L.layerGroup().addTo(map);
  const cluster=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:zoom=>zoom>=16?9:38,spiderfyOnMaxZoom:true,spiderfyDistanceMultiplier:1.8,zoomToBoundsOnClick:true,animate:false,iconCreateFunction:group=>{
    const children=group.getAllChildMarkers(),counts=new Map();
    children.forEach(m=>counts.set(m.options.pinColor,(counts.get(m.options.pinColor)||0)+1));
    let angle=0;const stops=[];counts.forEach((count,color)=>{const next=angle+count/children.length*360;stops.push(color+' '+angle+'deg '+next+'deg');angle=next;});
    const multiple=counts.size>1,background=multiple?'conic-gradient('+stops.join(',')+')':children[0].options.pinColor;
    return L.divIcon({html:'<div class="'+(multiple?'cluster-ring':'')+'" style="background:'+background+'"><span>'+group.getChildCount()+'</span></div>',className:'cluster-icon',iconSize:[36,36]});
  }}).addTo(map);
  map.on('zoomend',renderLabels);
  map.on('click',event=>{if(areaMode)onAreaClick(event.latlng);});
  map.on('mousemove',event=>{if(areaMode&&areaStart){const bounds=L.latLngBounds(areaStart,event.latlng);if(!areaRectangle)areaRectangle=L.rectangle(bounds,{color:'#006241',weight:1.5,dashArray:'4 4',fillOpacity:.12}).addTo(map);else areaRectangle.setBounds(bounds);}});

  function options(values,current,placeholder) {
    return (placeholder!==undefined?'<option value="">'+e(placeholder)+'</option>':'')+values.map(v=>'<option value="'+e(v)+'"'+(v===current?' selected':'')+'>'+e(v)+'</option>').join('');
  }
  function dmsForRegion(region){return [...new Set(base.stores.filter(s=>s.region===region&&C.isOpen(s)).map(s=>s.dm))].sort((a,b)=>C.dmLabel(a).localeCompare(C.dmLabel(b),'es'));}
  function populateStoreDms(region,requested){
    const values=dmsForRegion(region);$('storeDm').innerHTML=options(values,values.includes(requested)?requested:'','Por asignar');
  }
  function populateBulkDms(){const current=$('bulkDm').value;$('bulkDm').innerHTML=options(dmsForRegion($('bulkRegion').value),current,'Por asignar / conservar si corresponde');}
  function allDms() {return [...new Set([...base.stores.map(s=>s.dm),...Object.values(state.updates).map(s=>s.dm).filter(Boolean),...state.extraDms])].sort((a,b)=>a.localeCompare(b,'es'));}
  function pinColor(s){return C.regionColors[s.region];}
  function areaZone(prop){return C.mapZone(prop,state.areas);}
  function areaStyle(feature){return C.cartographicStyle(feature.properties,state.areas,{visible:showBackground,opacity,selectedId:inspectorMode==='background'?areaFocus:null});}
  function badge(s){const decision=s.movement||s.decision;const css={'Por evaluar':'review','Conservar':'keep','Tomar':'keep','Ceder':'move','Reasignar':'move','No considerar':'drop'}[decision];return '<span class="badge '+css+'">'+e(decision)+'</span>';}
  function number(value){return new Intl.NumberFormat('es-MX',{maximumFractionDigits:1}).format(value);}
  function dateLabel(date){if(!date)return 'Sin fecha · apertura';return new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));}
  function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4200);}
  function persist(){
    try{localStorage.setItem(STORAGE,JSON.stringify(C.pack(base,state)));if($('saveState'))$('saveState').textContent='Guardado en este equipo';}
    catch(error){if($('saveState'))$('saveState').textContent='Exporta para conservar tus cambios';toast('No se pudo guardar en este navegador. Exporta tu avance.');}
  }
  function transact(change,message){
    history.push(JSON.stringify({base,state}));if(history.length>35)history.shift();
    captureDraft();change();$('storeForm')?.remove();persist();render();if(message)toast(message);
  }
  function undo(){if(!history.length)return;captureDraft();$('storeForm')?.remove();const old=JSON.parse(history.pop());base=old.base;state=old.state;moving=false;persist();render();toast('Último cambio deshecho.');}
  function getStore(cc){return cachedStores.find(s=>s.cc===cc);}
  function proposedStore(cc){return C.current(base,state).find(s=>s.cc===cc);}
  function refreshMapSize(){
    requestAnimationFrame(()=>{map.invalidateSize({pan:false,animate:false});renderLabels();});
  }
  function syncMenus(){
    document.body.classList.toggle('menus-hidden',!menusVisible);
    document.querySelector('.topbar').hidden=!menusVisible;
    document.querySelector('.map-launchers').hidden=!menusVisible;
    document.querySelector('.map-tools').hidden=!menusVisible;
    document.querySelector('.map-context').hidden=!menusVisible;
    $('legend').hidden=!menusVisible;
    $('mapStatus').hidden=!menusVisible;
    $('sidebar').hidden=!menusVisible||!$('sidebar').classList.contains('open');
    $('regionLegend').hidden=!menusVisible;
    $('storeCounter').hidden=!menusVisible;
    $('inspector').hidden=!menusVisible||!inspectorMode;
    $('selectionDock').hidden=!menusVisible;
    $('menusToggleText').textContent=menusVisible?'Ocultar menús':'Mostrar menús';
    $('menusToggle').setAttribute('aria-pressed',String(!menusVisible));
    $('menusToggle').setAttribute('aria-label',menusVisible?'Ocultar menús y ampliar el mapa':'Mostrar menús del mapa');
    $('mobileListBtn').setAttribute('aria-expanded',String(!$('sidebar').hidden));

  }
  function setMenusVisible(visible){
    menusVisible=visible;syncMenus();refreshMapSize();
  }
  function setSidebar(open,focusSearch=false){
    if(open){menusVisible=true;captureDraft();closeInspector();}
    else if($('sidebar').contains(document.activeElement))$('mobileListBtn').focus();
    $('sidebar').classList.toggle('open',open);syncMenus();renderZoneNames();
    if(open&&focusSearch)$('search').focus();
  }
  function render(){
    captureDraft();cachedStores=C.current(base,state,view).filter(C.isOpen);visible=C.filtered(cachedStores,filter);
    auditResult=C.auditRegions(base,state,geo,view);
    renderFilters();renderList();renderPins();renderLegend();renderDock();renderBackground();renderStats();renderHealth();
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
    $('backgroundBtn').setAttribute('aria-pressed',String(inspectorMode==='background'));
    $('undoBtn').disabled=!history.length;
    if(inspectorMode==='store'&&focus)renderStoreInspector();
    else if(inspectorMode==='background')renderBackgroundInspector();
    renderNearby();syncMenus();
  }
  function renderStats(){
    const counts=C.regionalCounts(base,state,view),chosen=filter.region?counts.find(x=>x.region===filter.region):null;
    let totals=chosen||{region:'Todas las disponibles',base:counts.reduce((n,x)=>n+x.base,0),total:counts.reduce((n,x)=>n+x.total,0),delta:counts.reduce((n,x)=>n+x.delta,0),incoming:0,outgoing:0,available:true};
    if(filter.dm){
      const matches=s=>(!filter.region||s.region===filter.region)&&s.dm===filter.dm&&s.decision!=='No considerar';
      const original=base.stores.filter(C.isOpen),proposed=cachedStores,byId=new Map(original.map(s=>[s.cc,s]));
      const before=original.filter(matches),included=proposed.filter(matches);
      totals={region:C.dmLabel(filter.dm),base:before.length,total:included.length,delta:included.length-before.length,incoming:included.filter(s=>!matches(byId.get(s.cc))).length,outgoing:before.filter(s=>!proposed.some(x=>x.cc===s.cc&&matches(x))).length,available:true};
    }
    const pending=!totals.available,partial=chosen&&!base.metadata.directory&&chosen.region!==C.REGION;
    const amount=pending&&totals.total===0?'—':totals.total;
    $('storeCounter').innerHTML='<div><span class="counter-kicker">'+(view==='base'?'BASE ACTUAL':'MI PROPUESTA')+'</span><b>'+e(totals.region)+'</b></div><strong>'+amount+'<small>'+(pending?'disponibles':'abiertas')+'</small></strong><span class="counter-change">'+(pending?'Total regional pendiente':view==='base'?(partial?'Disponibles · total regional pendiente':'Tiendas en esta base'):(totals.delta>0?'+':'')+totals.delta+' vs. base '+totals.base+(partial?' · total pendiente':''))+'</span>';
    $('scopeSummary').innerHTML='<div class="span-header"><span>SPAN DE TIENDAS</span><b>'+amount+'</b></div><div class="span-caption">'+(pending?'Total regional pendiente de validar':view==='base'?'Abiertas en la base actual':'Abiertas en la propuesta')+'</div>'+((chosen||filter.dm)?'<div class="span-delta"><span>Base <b>'+(pending?'—':totals.base)+'</b></span><span>Se suman <b>+'+totals.incoming+'</b></span><span>Se ceden <b>−'+totals.outgoing+'</b></span></div>'+(partial?'<p class="hint">Catálogo parcial: faltan tiendas por validar de esta región.</p>':''):'<p class="hint">Directorio CMS: '+counts.filter(r=>r.available).map(r=>r.base+' '+e(r.region)).join(', ')+'. Región y DM conservan el origen del directorio.</p>');
    const group=cachedStores.filter(s=>(!filter.region||s.region===filter.region)&&s.decision!=='No considerar'),dms=[...new Set(group.map(s=>s.dm))];
    $('dmCount').textContent=dms.length;
    $('dmSpan').innerHTML=dms.map(dm=>{const total=group.filter(s=>s.dm===dm).length;return '<button data-action="filter-dm" data-dm="'+e(dm)+'" class="dm-span-row'+(filter.dm===dm?' active':'')+'"><span>'+e(C.dmLabel(dm))+'</span><b>'+total+'</b><i style="width:'+Math.max(8,total/Math.max(1,group.length)*100)+'%"></i></button>';}).join('')||'<p class="hint">DM y tiendas pendientes de información.</p>';
    $('regionLegend').innerHTML='<span class="pin-key-title">PINES · STARBUCKS</span>'+counts.map(r=>'<button title="'+(r.available?'Región del directorio CMS':'Sin catálogo · total pendiente')+'" data-action="filter-region" data-region="'+e(r.region)+'" aria-pressed="'+(filter.region===r.region)+'" style="--region:'+C.regionColors[r.region]+'"><i></i><span>'+e(r.region)+'</span><b>'+(r.available?r.total:r.total?'+'+r.total:'Pendiente')+'</b></button>').join('')+(filter.region?'<button data-action="all-regions" class="all-regions">Todas</button>':'');
    $('auditCount').textContent=auditResult.items.filter(s=>!filter.region||s.region===filter.region).length;
    const moves=C.current(base,state).filter(s=>C.isOpen(s)&&(s.region!==s.origin_region||s.decision==='No considerar'));
    $('changesCount').textContent=moves.length;
  }
  function renderHealth(){
    $('reviewBtn').classList.toggle('blocked',!healthy);
    $('healthText').textContent=healthy?'Base validada':'Revisar base';
    const stores=C.current(base,state).filter(C.isOpen),done=stores.filter(s=>s.decision!=='Por evaluar').length,percent=Math.round(done/Math.max(1,stores.length)*100);
    $('completionMeter').innerHTML='<span>'+done+' revisadas</span><div><i style="width:'+percent+'%"></i></div>';
  }
  function closest(s,stores,n=3){
    const moved=Object.values(state.updates).some(u=>u.latitude!=null||u.longitude!=null);
    if(healthy&&!moved&&stores.length===base.stores.length&&insights.nearest&&insights.nearest[s.cc]){
      const byId=new Map(stores.map(s=>[s.cc,s]));
      return insights.nearest[s.cc].filter(x=>byId.has(x.cc)).slice(0,n).map(x=>({...byId.get(x.cc),km:x.km}));
    }
    return C.nearest(s,stores,n);
  }
  function reviewData(){
    const open=base.stores.filter(C.isOpen),baseline=C.regionalCounts(base,C.freshState(),'base'),warnings=(insights.warnings||[]).filter(w=>open.some(s=>s.cc===w.cc));
    modal(healthy?'Base validada':'Revisar base','Validación de datos; la cobertura regional se revisa aparte en Auditoría.',
      '<div class="review-metrics"><div><strong>'+open.length+'</strong><span>abiertas disponibles</span></div><div><strong>'+open.filter(s=>s.region===C.REGION).length+'</strong><span>Centro Norte</span></div><div><strong>'+base.stores.filter(s=>s.status==='Apertura').length+'</strong><span>aperturas excluidas</span></div></div><div class="check-grid">'+['CeCo únicos','Coordenadas numéricas','Fechas consistentes','Regiones de origen'].map(t=>'<span class="'+(healthy?'check-ok':'check-pending')+'">'+(healthy?'✓':'○')+' '+t+'</span>').join('')+'</div>'+(healthy?'':'<div class="error-text">'+e((insights.errors||['La validación no coincide con la base.']).join('\n'))+'</div>')+warnings.map(w=>'<button class="review-issue" data-action="review-focus" data-cc="'+e(w.cc)+'"><strong>'+e(w.cc)+'</strong><span>'+e(w.detail)+'</span></button>').join('')+'<div class="note">'+baseline.filter(r=>r.available).map(r=>e(r.region)+': '+r.base+' abiertas disponibles').join('. ')+'. Las cinco regiones, DM y estatus proceden del mismo CMS. Se conserva el estatus operativo de Ops en los casos distintos de Alsea. Las aperturas se conservan en el respaldo, fuera del mapa y los conteos.</div><div class="confirmed-location">Toreo Walmart · 43302: ubicación confirmada por el Regional. Coordenadas conservadas.</div>',
      '<button class="primary" data-action="close-modal">Volver al mapa</button>');
  }
  function renderFilters(){
    $('dmFilter').innerHTML='<option value="">Todos los DM</option>'+[...new Set(cachedStores.filter(s=>!filter.region||s.region===filter.region).map(s=>s.dm))].map(dm=>'<option value="'+e(dm)+'"'+(filter.dm===dm?' selected':'')+'>'+e(C.dmLabel(dm))+'</option>').join('');
    const counts=C.regionalCounts(base,state,view);
    $('regionFilter').innerHTML='<option value="">Todas las disponibles · '+cachedStores.length+'</option>'+counts.map(r=>'<option value="'+e(r.region)+'"'+(filter.region===r.region?' selected':'')+'>'+e(r.region)+' · '+(r.available?r.total+' abiertas':r.total?'+'+r.total+' propuestas · total pendiente':'Total pendiente')+'</option>').join('');
    $('zoneFilter').innerHTML=options(C.zones,filter.zone,'Todas las zonas');
    $('decisionFilter').innerHTML=options(C.decisions,filter.decision,'Todas las decisiones');
    $('filterCount').textContent=visible.length+(visible.length===1?' tienda abierta visible':' tiendas abiertas visibles');
    const selectedVisible=visible.filter(s=>selected.has(s.cc)).length;
    $('selectVisible').checked=!!visible.length&&selectedVisible===visible.length;
    $('selectVisible').indeterminate=selectedVisible>0&&selectedVisible<visible.length;
  }
  function renderList(){
    const sort=$('sortSelect').value;
    const list=[...visible].sort((a,b)=>sort==='cc'?a.cc.localeCompare(b.cc):(a[sort].localeCompare(b[sort],'es')||a.cc.localeCompare(b.cc)));
    $('storeList').innerHTML=list.length?list.map(s=>'<article class="store-row'+(focus===s.cc?' active':'')+(selected.has(s.cc)?' checked':'')+(!C.inRegion(s)?' external-row':'')+'" data-row="'+s.cc+'"><input type="checkbox" data-select="'+s.cc+'" aria-label="Seleccionar '+e(s.cc+' '+s.store_name)+'"'+(selected.has(s.cc)?' checked':'')+'><button data-action="focus" data-cc="'+s.cc+'" aria-label="Ver '+e(s.store_name)+' en el mapa"><i class="dm-swatch" style="--pin:'+pinColor(s)+'"></i><span class="row-content"><span class="store-meta"><span class="ceco">'+s.cc+'</span>'+(s.status==='Apertura'?'<span class="badge opening">APERTURA</span>':'')+(s.movement!=='Por evaluar'?badge(s):'')+'</span><span class="store-name">'+e(s.store_name)+'</span><span class="store-sub">'+e(s.origin_region)+(s.region!==s.origin_region?' → '+e(s.region):'')+'<span class="dm-only"> · '+e(C.dmLabel(s.dm))+'</span></span></span><span class="row-arrow">›</span></button></article>').join(''):'<div class="empty">No hay tiendas con estos filtros.<br>Usa «Limpiar filtros» para volver al mapa completo.</div>';
  }
  function makeIcon(s){
    const cls=['pin-shell',s.status==='Apertura'?'opening':'',s.movement==='Tomar'?'incoming-pin':'',s.movement==='Ceder'?'outgoing-pin':'',s.decision==='No considerar'?'drop':'',selected.has(s.cc)?'selected':'',focus===s.cc?'focused':''].filter(Boolean).join(' ');
    const content=s.movement==='Ceder'?'↗':s.movement==='Tomar'?'+':s.decision==='No considerar'?'×':s.status==='Apertura'?'+':s.decision==='Conservar'?'✓':'•';
    return L.divIcon({className:'map-pin',html:'<div class="'+cls+'" style="--pin:'+pinColor(s)+'"><div class="pin-head"><span>'+content+'</span></div></div>',iconSize:[28,34],iconAnchor:[14,31],tooltipAnchor:[0,-29]});
  }
  function renderPins(){
    cluster.clearLayers();markers.clear();if(!pinsVisible)return;const ms=[];
    visible.filter(C.hasPoint).forEach(s=>{
      const marker=L.marker([s.latitude,s.longitude],{icon:makeIcon(s),title:s.cc+' · '+s.store_name,alt:s.cc+' '+s.store_name,pinColor:pinColor(s),regionIncluded:C.inRegion(s),draggable:moving&&s.cc===focus,zIndexOffset:focus===s.cc?1200:0});
      marker.bindTooltip('<b>'+e(s.cc+' · '+s.store_name)+'</b><br>'+e(s.origin_region)+(s.region!==s.origin_region?' → '+e(s.region):'')+'<br>'+e(C.dmLabel(s.dm))+(s.status==='Apertura'?'<br>Apertura · sin fecha':''));
      marker.on('click',event=>{
        if(areaMode){onAreaClick(event.latlng);return;}
        if(moving&&focus===s.cc)return;
        if(event.originalEvent&&(event.originalEvent.ctrlKey||event.originalEvent.metaKey)){toggleSelected(s.cc);return;}
        focusStore(s.cc);
      });
      marker.on('dragend',()=>{
        const p=marker.getLatLng();
        transact(()=>{view='proposal';state.updates[s.cc]={...(state.updates[s.cc]||{}),latitude:Number(p.lat.toFixed(6)),longitude:Number(p.lng.toFixed(6))};moving=false;},'Ubicación ajustada en la propuesta. Puedes deshacer el cambio.');
      });
      markers.set(s.cc,marker);ms.push(marker);
    });cluster.addLayers(ms);
  }
  function renderLegend(){
    $('legend').innerHTML='<span class="background-legend-title">FONDO · ORIENTACIÓN</span><div class="cartography-swatches">'+C.zones.map(zone=>'<span><i style="background:'+C.zoneColors[zone]+'"></i>'+e(zone)+'</span>').join('')+'</div>';
    $('legend').classList.toggle('background-off',!showBackground);
  }
  function renderBackground(){areasLayer.setStyle(areaStyle);if(showNeighbors&&!map.hasLayer(neighborLayer))neighborLayer.addTo(map).bringToBack();if(!showNeighbors&&map.hasLayer(neighborLayer))map.removeLayer(neighborLayer);renderLabels();}
  function renderLabels(){
    labelLayer.clearLayers();renderZoneNames();
    if(showLabels&&showBackground&&map.getZoom()>=9){
      geo.municipalities.features.forEach(f=>{
        const p=f.properties;
        if(!map.getBounds().intersects([[p.bbox[1],p.bbox[0]],[p.bbox[3],p.bbox[2]]]))return;
        if(map.getZoom()<10 && p.state==='09')return;
        L.marker([p.center[1],p.center[0]],{pane:'labels',interactive:false,icon:L.divIcon({className:'municipal-label',html:e(p.name),iconSize:[100,22],iconAnchor:[50,11]})}).addTo(labelLayer);
      });
    }
  }

  function renderZoneNames(){zoneNameLayer.clearLayers();}
  map.on('moveend',()=>{if(showLabels)renderLabels();});
  function fitCartography(){
    const size=map.getSize(),left=menusVisible&&$('sidebar').classList.contains('open')?Math.min(380,size.x*.4):35,right=menusVisible&&inspectorMode?Math.min(380,size.x*.4):35;
    map.fitBounds(areasLayer.getBounds(),{paddingTopLeft:[left,menusVisible?85:35],paddingBottomRight:[right,menusVisible?100:35],maxZoom:12,animate:false});
  }
  function fitVisible(){
    const located=visible.filter(C.hasPoint);if(!located.length){toast(visible.length?'Las coordenadas de estas tiendas están pendientes en el CMS.':'No hay tiendas abiertas con estos filtros.');return;}
    const size=map.getSize(),left=menusVisible&&$('sidebar').classList.contains('open')?Math.min(380,size.x*.4):35,right=menusVisible&&inspectorMode?Math.min(380,size.x*.4):35;
    map.fitBounds(L.latLngBounds(located.map(s=>[s.latitude,s.longitude])),{paddingTopLeft:[left,menusVisible?85:35],paddingBottomRight:[right,menusVisible?100:35],maxZoom:14,animate:false});
  }
  function setInspector(mode){
    inspectorMode=mode;
    if(mode){setMenusVisible(true);setSidebar(false);}
    $('inspector').classList.toggle('hidden',!mode);document.querySelector('.map-workspace').classList.toggle('has-inspector',!!mode);
    if(mode)$('mapSteps').classList.add('hidden');
    $('backgroundBtn').classList.toggle('active',mode==='background');renderDock();syncMenus();renderBackground();
  }
  function focusStore(cc,pan=true){
    const store=getStore(cc);if(!store)return;
    captureDraft();moving=false;pinsVisible=true;focus=cc;setSidebar(false);setInspector('store');renderList();renderPins();renderStoreInspector();renderNearby();
    setSidebar(false);
    if(pan&&C.hasPoint(store)){
      const zoom=Math.max(map.getZoom(),14);
      const point=map.project([store.latitude,store.longitude],zoom),offset=map.getSize().x>600?155:105;
      map.setView(map.unproject(L.point(point.x+offset,point.y),zoom),zoom,{animate:false});
      cluster.zoomToShowLayer(markers.get(cc),()=>{});
    }
    $('mapStatus').lastElementChild.textContent=store.cc+' · '+store.store_name;
  }
  function renderStoreInspector(){
    const shown=getStore(focus),s=proposedStore(focus),original=base.stores.find(s=>s.cc===focus);if(!s){closeInspector();return;}
    const location=shown||s,home=original.region===C.REGION;
    const liveArea=C.findArea(location.latitude,location.longitude,geo),geomName=liveArea?liveArea.properties.name:'Fuera del fondo disponible';
    const confirmed=original.location_verification;
    const mismatch=!confirmed&&liveArea&&C.norm(STATE_NAMES[liveArea.properties.state])!==C.norm(s.coverage);
    const geoNotes=!C.hasPoint(location)?'<div class="alert">Coordenadas pendientes. La tienda se conserva en el directorio sin estimar su pin.</div>':confirmed?'<div class="confirmed-location">✓ Ubicación confirmada por el Regional</div>':mismatch?'<div class="alert"><b>Validar ubicación</b><br>Excel: '+e(s.municipality)+' · '+e(s.coverage)+'<br>Coordenada: '+e(geomName)+'.</div>':'';
    const nearest=C.hasPoint(location)?closest(location,cachedStores.filter(C.hasPoint),3):[];
    $('inspector').innerHTML='<div class="inspector-header"><span class="eyebrow">PROPONER TIENDA</span><button data-action="close-inspector" aria-label="Cerrar evaluación">×</button></div><div class="inspector-body"><span class="ceco">CECO '+s.cc+'</span><h2>'+e(s.store_name)+'</h2><p class="location-meta">'+e(s.municipality)+' · '+e(s.coverage)+(s.status==='Apertura'?'<br>Apertura · sin fecha':'')+'</p>'+geoNotes+'<div class="region-route"><div><small>ORIGEN STARBUCKS</small><b>'+e(original.region)+'</b></div><span>→</span><div><small>PROPUESTA STARBUCKS</small><b>'+e(s.region)+'</b></div></div><div class="proposal-message">'+(s.movement==='Tomar'?'Esta tienda se suma a Centro Norte.':s.movement==='Ceder'?'Se propone ceder esta tienda a '+e(s.region)+'.':home?'Tu tienda permanece en Centro Norte.':'Opción de '+e(original.region)+' para sumar a tu región.')+'</div>'+(view==='base'?'<div class="note base-notice">Estás viendo la base. Al guardar pasarás a Mi propuesta.</div>':'')+'<form id="storeForm"><label class="region-destination">Región interna propuesta<select id="storeRegion">'+options(C.regions,s.region)+'</select></label><div class="quick-proposals"><button type="button" data-action="choose-home">'+(home?'✓ Conservar en Centro Norte':'+ Tomar para Centro Norte')+'</button>'+(home?'<button type="button" data-action="choose-away">↗ Ceder a otra región</button>':'')+'</div><label class="proposal-notes">Motivo de la propuesta <span>(opcional)</span><textarea id="storeNotes" maxlength="2000" placeholder="¿Qué mejora esta decisión en el territorio?">'+e(s.notes)+'</textarea></label><details class="assignment-details"><summary>Asignación DM y zona</summary><div class="form-grid"><label class="full">DM de destino (opcional)<select id="storeDm">'+allDms().map(dm=>'<option value="'+e(dm)+'"'+(dm===s.dm?' selected':'')+'>'+e(C.dmLabel(dm))+'</option>').join('')+'</select></label><label class="full">Zona geográfica<select id="storeZone">'+options(C.zones,s.zone)+'</select></label></div><p class="hint">Solo se ofrecen DM de la región destino. Puedes dejarlo Por asignar. La zona del fondo es independiente.</p></details><span id="draftStatus" class="draft-status"></span><button class="primary save-proposal" type="submit">Guardar y actualizar conteo</button></form><div class="inline-actions"><button data-action="toggle-compare" data-cc="'+s.cc+'">'+(selected.has(s.cc)?'✓ En selección':'+ Seleccionar varias')+'</button><button data-action="reset-store" data-cc="'+s.cc+'">Restablecer</button></div><details class="location-details"><summary>Ubicación y cercanía</summary><div class="original-info">DM base: <b>'+e(C.dmLabel(original.dm))+'</b><br>'+e(dateLabel(s.opening_date))+'<br>Municipio por coordenada: '+e(geomName)+'</div><button data-action="move-pin" class="quiet">'+(moving?'Terminar ajuste':'Ajustar ubicación del pin')+'</button>'+(moving?'<div class="area-instruction">Arrastra el pin. La nueva coordenada se guarda al soltarlo; puedes deshacer.</div>':'')+'<p class="hint">'+(C.hasPoint(location)?location.latitude.toFixed(6)+', '+location.longitude.toFixed(6):'Coordenadas pendientes en el CMS')+'</p><div class="nearby-heading"><h3>Tiendas cercanas</h3><button data-action="nearby">'+(nearbyOn?'Ocultar líneas':'Ver cercanía')+'</button></div>'+nearest.map(n=>'<button class="nearby-row" data-action="near-focus" data-cc="'+n.cc+'"><i class="dm-swatch" style="--pin:'+pinColor(n)+'"></i><span>'+e(n.store_name)+'<small>'+n.cc+' · '+e(n.region)+'</small></span><b>'+number(n.km)+' km</b></button>').join('')+'<p class="hint">Distancias en línea recta; no son recorridos ni tiempos.</p></details></div>';
    populateStoreDms(s.region,s.dm);restoreDraft();
    $('storeForm').addEventListener('input',captureDraft);
    $('storeForm').addEventListener('change',captureDraft);
    $('storeForm').addEventListener('submit',event=>{
      event.preventDefault();const update={...(state.updates[focus]||{}),...C.proposalUpdate(original,$('storeRegion').value),dm:$('storeDm').value||'Por asignar',zone:$('storeZone').value,notes:$('storeNotes').value.trim()};
      transact(()=>{view='proposal';state.updates[focus]=update;delete drafts[focus];saveDrafts();},'Propuesta guardada · '+s.cc+' '+s.store_name);
    });
    $('storeRegion').addEventListener('change',()=>{populateStoreDms($('storeRegion').value,$('storeDm').value);updateDraftMessage(original);});
  }
  function saveDrafts(){try{localStorage.setItem(STORAGE+'-drafts',JSON.stringify(drafts));}catch(error){if($('draftStatus'))$('draftStatus').textContent='No se pudo guardar el borrador en este equipo.';}}
  function captureDraft(){
    if(!focus||!$('storeForm'))return;
    const saved=proposedStore(focus);if(!saved)return;
    const draft={region:$('storeRegion').value,dm:$('storeDm').value||'Por asignar',zone:$('storeZone').value,notes:$('storeNotes').value};
    if(draft.region===saved.region&&draft.dm===saved.dm&&draft.zone===saved.zone&&draft.notes===saved.notes)delete drafts[focus];else drafts[focus]=draft;
    saveDrafts();if($('draftStatus'))$('draftStatus').textContent=drafts[focus]?'Borrador guardado en este equipo · aplica al guardar.':'';
  }
  function restoreDraft(){
    const draft=drafts[focus];if(!draft)return;
    populateStoreDms(draft.region,draft.dm);
    for(const [id,key] of [['storeRegion','region'],['storeDm','dm'],['storeZone','zone'],['storeNotes','notes']])if(draft[key]!=null)$(id).value=draft[key];
    if($('draftStatus'))$('draftStatus').textContent='Borrador recuperado · aplica al guardar.';
    updateDraftMessage(base.stores.find(s=>s.cc===focus));
  }
  function updateDraftMessage(original){
    const region=$('storeRegion').value,u=C.proposalUpdate(original,region),row=C.regionalCounts(base,state).find(r=>r.region===region),was=C.inRegion(proposedStore(original.cc),region);
    document.querySelector('.proposal-message').textContent=(u.decision==='Tomar'?'Tomar para ':u.decision==='Ceder'?'Ceder a ':u.decision==='Conservar'?'Conservar en ':'Proponer para ')+region+' · Al guardar: '+(row.total+1-(was?1:0))+' abiertas disponibles en '+region+(!$('storeDm').value?' · DM por asignar':'');
    document.querySelector('.proposal-message').classList.add('draft-message');captureDraft();
  }
  function renderNearby(){
    nearLayer.clearLayers();if(!nearbyOn||!focus||inspectorMode!=='store')return;
    const s=getStore(focus);if(!s||!C.hasPoint(s))return;
    L.circle([s.latitude,s.longitude],{radius:3000,color:'#3d7950',fillColor:'#7ca46b',fillOpacity:.055,weight:1,dashArray:'5 5',interactive:false}).bindTooltip('Radio de referencia: 3 km').addTo(nearLayer);
    closest(s,cachedStores,3).forEach(n=>L.polyline([[s.latitude,s.longitude],[n.latitude,n.longitude]],{color:'#315e48',weight:1.5,dashArray:'5 7',opacity:.8,interactive:false}).addTo(nearLayer));
  }
  function closeInspector(){captureDraft();setInspector(null);moving=false;focus=null;areaFocus=null;render();$('mapStatus').lastElementChild.textContent='Explora el mapa o selecciona una tienda';}

  function openBackground(){captureDraft();moving=false;focus=null;setInspector(inspectorMode==='background'?null:'background');render();}
  function renderBackgroundInspector(){
    const feature=geoById.get(areaFocus),p=feature&&feature.properties;
    const selectedArea=p?'<h3>'+e(p.name)+'</h3><p class="location-meta">'+e(STATE_NAMES[p.state])+' · INEGI '+p.id+'</p><label>Zona geográfica del municipio<select id="areaZone">'+options(C.zones,areaZone(p))+'</select></label><button class="primary" data-action="save-area">Pintar solo este fondo</button><div class="selected-zone-info">Orientación inicial: <b>'+e(geoZone(p))+'</b><br>Zona del fondo: <b>'+e(areaZone(p))+'</b></div><button class="quiet" data-action="reset-area" style="margin-top:10px;width:100%">Restablecer este municipio</button>':'<div class="area-instruction"><b>Selecciona un municipio en el mapa.</b><br>Puedes ajustar su zona geográfica y el color de su fondo.</div>';
    $('inspector').innerHTML='<div class="inspector-header"><span class="eyebrow">CAPA CARTOGRÁFICA</span><button data-action="close-inspector" aria-label="Cerrar fondo geográfico">×</button></div><div class="inspector-body"><h2>Las zonas del territorio.</h2><p class="location-meta">Límites municipales de INEGI · '+geo.municipalities.features.length+' municipios y alcaldías.</p><div class="cartography-explanation">Los colores muestran orientación geográfica. Las regiones internas de Starbucks se asignan en la ficha de cada tienda.</div><label class="switch-row"><input id="showBackground" type="checkbox"'+(showBackground?' checked':'')+'>Pintar zonas del fondo</label><label>Intensidad del fondo<div class="opacity-row"><input type="range" id="backgroundOpacity" min="5" max="75" value="'+Math.round(opacity*100)+'"><span id="opacityValue">'+Math.round(opacity*100)+'%</span></div></label><label class="switch-row"><input id="showLabels" type="checkbox"'+(showLabels?' checked':'')+'>Nombres de municipios</label><label class="switch-row"><input id="showNeighbors" type="checkbox"'+(showNeighbors?' checked':'')+'>Entidades vecinas</label><button class="quiet cartography-extent" data-action="fit-cartography">Ver las cinco zonas en el mapa ↗</button><div class="zone-key">'+C.zones.map(zone=>'<span><i style="background:'+C.zoneColors[zone]+'"></i>'+e(zone)+'</span>').join('')+'</div>'+selectedArea+'<div class="note">INEGI aporta los límites municipales. Las cinco zonas son una agrupación de referencia por orientación, ajustable por municipio; no son una regionalización oficial de INEGI.</div></div>';
    $('showBackground').addEventListener('change',ev=>{showBackground=ev.target.checked;renderBackground();renderLegend();});
    $('showLabels').addEventListener('change',ev=>{showLabels=ev.target.checked;renderLabels();});
    $('showNeighbors').addEventListener('change',ev=>{showNeighbors=ev.target.checked;renderBackground();});
    $('backgroundOpacity').addEventListener('input',ev=>{opacity=Number(ev.target.value)/100;$('opacityValue').textContent=ev.target.value+'%';renderBackground();});
  }
  function saveArea(){
    if(!areaFocus)return;
    const zone=$('areaZone').value,id=areaFocus;
    transact(()=>C.setMapZone(state,id,zone),'Fondo del municipio actualizado · '+zone+'.');
  }
  function toggleSelected(cc){selected.has(cc)?selected.delete(cc):selected.add(cc);render();}
  function renderDock(){
    const dock=$('selectionDock');dock.classList.toggle('hidden',!selected.size);
    if(!selected.size)return;
    $('mapSteps').classList.add('hidden');const hidden=[...selected].filter(cc=>!visible.some(s=>s.cc===cc)).length;
    dock.innerHTML='<div class="selection-label"><strong>'+selected.size+'</strong> seleccionadas<small>'+(hidden?hidden+' fuera de los filtros':'Propón un destino para todas')+'</small></div><button class="secondary selection-compare" data-action="compare">Comparar</button><button class="primary" data-action="bulk">Proponer selección</button><button class="clear-selection" data-action="clear-selection" aria-label="Limpiar selección">×</button>';
  }
  function startArea(){
    if(areaMode){stopArea();return;}
    pinsVisible=true;renderPins();areaMode=true;areaStart=null;$('areaBtn').classList.add('active');document.body.classList.add('crosshair');toast('Marca dos esquinas en el mapa para seleccionar tiendas. Esc cancela.');
    $('mapStatus').lastElementChild.textContent='Selección de área · marca la primera esquina';
  }
  function stopArea(){areaMode=false;areaStart=null;if(areaRectangle){map.removeLayer(areaRectangle);areaRectangle=null;}$('areaBtn').classList.remove('active');document.body.classList.remove('crosshair');}
  function onAreaClick(latlng){
    if(!areaStart){areaStart=latlng;$('mapStatus').lastElementChild.textContent='Marca la segunda esquina del área';return;}
    const bounds=L.latLngBounds(areaStart,latlng),found=visible.filter(s=>C.hasPoint(s)&&bounds.contains([s.latitude,s.longitude]));found.forEach(s=>selected.add(s.cc));stopArea();render();toast(found.length+' tiendas del área añadidas a la selección.');$('mapStatus').lastElementChild.textContent='Selección de área lista';
  }
  function modal(title,subtitle,body,actions='',small=false){
    $('modal').classList.toggle('small-modal',small);
    $('modalContent').innerHTML='<div class="modal-head"><div><div class="eyebrow">CENTRO NORTE · MESA DE TRABAJO</div><h2>'+e(title)+'</h2>'+(subtitle?'<p>'+e(subtitle)+'</p>':'')+'</div><button data-action="close-modal" aria-label="Cerrar ventana">×</button></div><div class="modal-body">'+body+'</div>'+(actions?'<div class="modal-actions">'+actions+'</div>':'');
    if(!$('modal').open)$('modal').showModal();
  }
  function guide(){
    modal('Región, tiendas y propuesta.','Solo tiendas abiertas. El mapa ocupa toda la superficie de trabajo.',
      '<div class="guide-grid guide-three"><div class="guide-card"><span>01</span><h3>Filtra la región</h3><p>Abre Región o pulsa su color en la leyenda. Verás las tiendas disponibles y podrás desplegar el span por DM.</p></div><div class="guide-card"><span>02</span><h3>Ajusta una tienda</h3><p>Selecciona el pin, elige su región destino y guarda. El pin y los conteos cambian con la propuesta. Las casillas permiten proponer varias juntas.</p></div><div class="guide-card"><span>03</span><h3>Valida y conserva</h3><p>Auditoría sugiere puntos para revisar por orientación y cercanía. Mis cambios muestra los movimientos. Exportar guarda el detalle.</p></div></div><div class="note">Base actual y Mi propuesta se comparan sin borrar ajustes. Guardamos la propuesta y los borradores en este navegador. Ocultar menús deja el mapa libre. INEGI aporta límites; las zonas del fondo no son regiones comerciales ni una regionalización oficial.</div>',
      '<button class="primary" data-action="close-modal">Entendido</button>');
  }
  function showBulk(){
    if(!selected.size)return;
    const stores=C.current(base,state).filter(s=>C.isOpen(s)&&selected.has(s.cc)),home=stores.filter(s=>s.origin_region===C.REGION).length;
    modal('Proponer '+selected.size+' tiendas','El destino se aplicará a toda la selección, incluidas las tiendas fuera del filtro.',
      '<div class="bulk-origin">'+home+' de Centro Norte · '+(stores.length-home)+' de otras regiones</div><label class="region-destination">Región interna propuesta<select id="bulkRegion">'+options(C.regions,'','Elige la región destino')+'</select></label><div class="quick-proposals"><button data-action="bulk-home">+ Llevar a Centro Norte</button></div><label>Motivo común (opcional)<textarea id="bulkNotes" maxlength="2000" placeholder="Se agregará a las notas existentes."></textarea></label><details class="assignment-details"><summary>Asignar también DM o zona</summary><div class="form-grid"><label>DM propuesto<select id="bulkDm">'+options(dmsForRegion($('bulkRegion')?.value),'','Por asignar / sin cambio si conserva región')+'</select></label><label>Zona geográfica<select id="bulkZone">'+options(C.zones,'','Sin cambio')+'</select></label></div></details><div class="note">'+stores.slice(0,8).map(s=>e(s.cc+' '+s.store_name)).join(' · ')+(stores.length>8?' · y '+(stores.length-8)+' más':'')+'</div>',
      '<button class="secondary" data-action="close-modal">Volver</button><button class="primary" data-action="apply-bulk">Guardar selección en propuesta</button>',true);
  }
  function applyBulk(){
    const region=$('bulkRegion').value,dm=$('bulkDm').value,zone=$('bulkZone').value,notes=$('bulkNotes').value.trim();
    if(!region){toast('Elige la región destino de la selección.');$('bulkRegion').focus();return;}
    const count=selected.size;
    transact(()=>{view='proposal';selected.forEach(cc=>{const original=base.stores.find(s=>s.cc===cc),u={...(state.updates[cc]||{}),...C.proposalUpdate(original,region)};u.dm=dm||(dmsForRegion(region).includes(proposedStore(cc).dm)?proposedStore(cc).dm:'Por asignar');if(zone)u.zone=zone;if(notes)u.notes=((u.notes?u.notes+'\n':'')+notes).slice(0,2000);state.updates[cc]=u;delete drafts[cc];});saveDrafts();selected.clear();},count+' tiendas propuestas para '+region+'.');$('modal').close();
  }
  function compare(){
    if(selected.size<2){toast('Selecciona al menos dos tiendas para comparar cercanía.');return;}
    const stores=C.current(base,state).filter(s=>C.isOpen(s)&&C.hasPoint(s)&&selected.has(s.cc));
    if(stores.length<2){toast('Selecciona al menos dos tiendas con coordenadas para comparar.');return;}
    const pairs=[];for(let i=0;i<stores.length;i++)for(let j=i+1;j<stores.length;j++)pairs.push({a:stores[i],b:stores[j],km:C.distance(stores[i],stores[j])});pairs.sort((a,b)=>a.km-b.km);
    modal('Comparar ubicaciones','Distancias en línea recta de la propuesta, calculadas entre las tiendas seleccionadas.',
      '<div class="comparison-stats"><div><b>'+stores.length+'</b><small>TIENDAS SELECCIONADAS</small></div><div><b>'+number(pairs[0].km)+' km</b><small>PAR MÁS CERCANO</small></div><div><b>'+number(pairs[pairs.length-1].km)+' km</b><small>PAR MÁS LEJANO</small></div></div><div class="table-wrap"><table><thead><tr><th>Ubicación A</th><th>Ubicación B</th><th>Distancia</th></tr></thead><tbody>'+pairs.slice(0,120).map(p=>'<tr><td><button data-action="compare-focus" data-cc="'+p.a.cc+'">'+e(p.a.store_name)+'<small>'+p.a.cc+' · '+e(p.a.dm)+'</small></button></td><td><button data-action="compare-focus" data-cc="'+p.b.cc+'">'+e(p.b.store_name)+'<small>'+p.b.cc+' · '+e(p.b.dm)+'</small></button></td><td>'+number(p.km)+' km</td></tr>').join('')+'</tbody></table></div><div class="note">'+(pairs.length>120?'Se muestran los 120 pares más cercanos de '+pairs.length+'. ':'')+'La cercanía es una referencia geográfica. Para recorridos, revisa vialidades y traslados antes de definir una asignación.</div>',
      '<button class="secondary" data-action="show-selection-map">Ver selección en el mapa</button><button class="primary" data-action="bulk">Evaluar selección</button>');
  }
  function summary(){
    const counts=C.regionalCounts(base,state),moves=C.current(base,state).filter(s=>C.isOpen(s)&&(s.region!==s.origin_region||s.decision==='No considerar'));
    const rows=counts.map(r=>'<tr><td><i class="region-dot" style="background:'+C.regionColors[r.region]+'"></i>'+e(r.region)+'</td><td>'+(r.available?r.base:'Pendiente')+'</td><td><b>'+(r.available?r.total:r.total?r.total+' disponibles':'Pendiente')+'</b></td><td>'+(r.delta>0?'+':'')+r.delta+'</td></tr>').join('');
    modal('Mis cambios','Solo tiendas abiertas. Los conteos incluyen las tiendas disponibles en esta base.',
      '<div class="table-wrap"><table><thead><tr><th>Región Starbucks</th><th>Base</th><th>Propuesta</th><th>Cambio</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="note">'+moves.length+' movimientos guardados. Centro Norte tiene su base de '+counts.find(r=>r.region===C.REGION).base+' abiertas; las cinco regiones usan el directorio CMS de octubre de 2026.</div>'+(moves.length?'<div class="table-wrap"><table><thead><tr><th>Tienda</th><th>Origen</th><th>Propuesta</th></tr></thead><tbody>'+moves.map(s=>'<tr><td><button data-action="review-focus" data-cc="'+s.cc+'">'+e(s.store_name)+'<small>'+s.cc+'</small></button></td><td>'+e(s.origin_region)+'</td><td>'+e(s.region)+(s.decision==='No considerar'?' · No considerar':'')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty-proposal">Sin movimientos todavía. Elige una tienda para proponer su región.</div>'),
      '<button class="secondary" data-action="close-modal">Volver</button><button class="primary" data-action="export-csv">Exportar abiertas a Excel</button>');
  }
  function showDirectory(){
    const opened=base.stores.filter(C.isOpen),teams=new Set(opened.map(s=>s.region+'|'+s.dm));
    modal('Directorio regional','Región → DM → Tienda · origen del CMS',
      '<div class="directory-overview"><strong>'+opened.length+'<small>abiertas</small></strong><span>'+C.regions.length+' regiones</span><span>'+teams.size+' grupos DM</span></div><label class="search-box directory-search"><span aria-hidden="true">⌕</span><input id="directorySearch" type="search" placeholder="Busca región, DM, tienda o CeCo" aria-label="Buscar en el directorio"></label><div class="directory-columns"><span>REGIÓN / DM / TIENDA</span><span>ABIERTAS</span></div><div id="directoryTree"></div><p class="hint">La estructura de origen se conserva al proponer cambios. Aperturas y cierres permanecen en el CMS, fuera de esta lista de abiertas.</p>',
      '<a class="button secondary cms-download" href="cms/Mapa_CentroNorte_CMS.xlsx" download>Descargar CMS Excel ↓</a><button class="primary" data-action="close-modal">Volver al mapa</button>');
    renderDirectoryTree();$('directorySearch').addEventListener('input',renderDirectoryTree);
  }
  function renderDirectoryTree(){
    const search=$('directorySearch').value.trim(),tree=C.directoryTree(base,search),order=[C.REGION,...C.regions.filter(r=>r!==C.REGION)];
    tree.sort((a,b)=>order.indexOf(a.region)-order.indexOf(b.region));
    const body=tree.filter(region=>region.total||!search).map(region=>'<details class="directory-region"'+(search||region.region===C.REGION?' open':'')+'><summary style="--region:'+C.regionColors[region.region]+'"><i class="region-dot"></i><span>'+e(region.region)+'</span><b>'+region.total+'</b></summary><div class="directory-dms">'+region.dms.map(dm=>'<details class="directory-dm"'+(search?' open':'')+'><summary><span>'+e(C.dmLabel(dm.dm))+'</span><b>'+dm.total+'</b></summary><div class="directory-stores">'+dm.stores.map(s=>'<button data-action="directory-focus" data-cc="'+s.cc+'" style="--region:'+C.regionColors[s.region]+'"><span class="directory-store-code">'+s.cc+'</span><span>'+e(s.store_name)+'</span><i aria-hidden="true">↗</i></button>').join('')+'</div></details>').join('')+(region.dms.length?'':'<p class="hint">Sin abiertas disponibles en el CMS.</p>')+'</div></details>').join('');
    $('directoryTree').innerHTML=body||'<div class="empty-proposal">No hay abiertas con esa búsqueda.</div>';
  }
  function showAudit(){
    const scope=filter.region,items=auditResult.items.filter(s=>!scope||s.region===scope),checked=cachedStores.filter(s=>(!scope||s.region===scope)&&s.decision!=='No considerar').length;
    modal('Auditoría orientativa',scope||'Todas las regiones disponibles',
      '<div class="audit-intro"><span class="estimate-label">ESTIMACIÓN · REVISIÓN MANUAL</span><h3>'+items.length+(items.length===1?' tienda para revisar <small>':' tiendas para revisar <small>')+'de '+checked+' abiertas disponibles</small></h3><p>Detecta Centro Norte en zona Sur, aislamiento a más de 20 km de otra tienda de su región, tres vecinas de otra región a menos de 5 km o puntos fuera de la cartografía disponible.</p></div><div class="note">Una zona Sur no hace incorrecta una asignación a Centro Norte. Las distancias son en línea recta y dependen de las tiendas cargadas. La cobertura cartográfica no incluye todos los municipios de Bajío. No se recomienda un cambio automáticamente.</div>'+items.map(s=>'<button class="audit-store" data-action="audit-focus" data-cc="'+s.cc+'"><i class="region-dot" style="background:'+C.regionColors[s.region]+'"></i><span><strong>'+e(s.store_name)+'</strong><small>'+s.cc+' · '+e(s.region)+' · zona '+e(s.zone)+'</small><span>'+s.reasons.map(e).join('<br>')+'</span>'+(s.locationConfirmed?'<small>Coordenada confirmada; revisar únicamente cobertura regional.</small>':'')+'</span><b>Ver ↗</b></button>').join('')+(items.length?'':'<div class="empty-proposal">Sin señales con estas reglas y los datos disponibles. No equivale a una validación completa del territorio.</div>')+'<div class="audit-coverage">'+auditResult.coverage.map(r=>'<span>'+e(r.region)+' <b>'+(r.available?r.available+' disponibles':'Pendiente')+'</b></span>').join('')+'</div>',
      '<button class="primary" data-action="close-modal">Volver al mapa</button>');
  }
  function showExport(){
    modal('Conserva tu propuesta','Guardado automático en este navegador y exportación para respaldo.',
      '<label>Nombre de la propuesta<input id="scenarioName" maxlength="80" value="'+e(state.name)+'"></label><span id="saveState" class="draft-status">Guardado en este equipo</span><div class="modal-card-grid"><button class="option-card" data-action="export-json"><span>↗</span><strong>Respaldo completo · JSON</strong><p>Conserva todas las decisiones, notas y ajustes, incluidas las aperturas ocultas.</p></button><button class="option-card" data-action="export-csv"><span>▥</span><strong>Tiendas abiertas · Excel CSV</strong><p>Solo abiertas, con región de origen y propuesta, DM, notas y coordenadas.</p></button></div><div class="note">Los borradores se guardan por separado en este navegador; aplica Guardar en cada ficha para incluirlos en la propuesta exportada.</div>',
      '<button class="primary" data-action="close-modal">Volver</button>');
    $('scenarioName').addEventListener('input',()=>{state.name=$('scenarioName').value.trim()||'Propuesta Centro Norte';persist();});
  }
  function download(content,type,filename){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function filename(suffix){const date=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Mexico_City'});return 'CentroNorte_'+state.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,50)+'_'+date+suffix;}
  function exportJson(){download(JSON.stringify(C.pack(base,state),null,2),'application/json',filename('.json'));toast('Escenario exportado con su base y todos los ajustes.');}
  function exportCsv(){download(C.csv(base,state,{openOnly:true}),'text/csv;charset=utf-8',filename('_abiertas.csv'));toast('Tabla de decisiones exportada para Excel.');}
  function sources(){
    const baseline=C.regionalCounts(base,C.freshState(),'base'),openCount=base.stores.filter(C.isOpen).length,openingCount=base.stores.filter(s=>s.status==='Apertura').length,closedCount=base.stores.filter(s=>s.status==='Cerrada').length;
    modal('Origen de la información','Cartografía y regiones Starbucks se mantienen independientes.',
      '<div class="source-list"><div><strong>Fondo geográfico</strong><p>Límites municipales y de alcaldías del Marco Geoestadístico INEGI, diciembre de 2025, ya incluidos en el proyecto. Centro, Norte, Poniente, Sur y Oriente son grupos de referencia por orientación, no una regionalización oficial.</p></div><div><strong>Tiendas abiertas</strong><p>'+baseline.filter(r=>r.available).map(r=>e(r.region)+': '+r.base+' disponibles').join('. ')+'. David Carrasco pertenece a Bajío y Mónica Morales a Centro Sur. Las aperturas no participan en mapa, conteos ni auditoría.</p></div><div><strong>Un solo directorio</strong><p>El CMS integra los puntos recibidos, Ops y el directorio Alsea por CeCo. Conserva las cinco regiones: '+openCount+' abiertas, '+openingCount+' aperturas y '+closedCount+' cierres. Los cierres temporales de Ops se mantienen fuera del mapa. No es un total nacional.</p></div><div><strong>Validación</strong><p>Base validada acredita consistencia de datos. Auditoría utiliza reglas espaciales orientativas sobre tiendas disponibles y requiere revisión humana. No valida la organización oficial de Starbucks.</p></div><div><strong>Continuidad</strong><p>Propuesta y borradores guardados en este navegador. Mis cambios y el CSV muestran solo abiertas; el JSON conserva la propuesta completa. Toreo Walmart conserva su coordenada confirmada.</p></div></div>',
      '<button class="primary" data-action="close-modal">Volver</button>');
  }
  function resetStore(cc){if(drafts[cc]){delete drafts[cc];saveDrafts();$('storeForm')?.remove();}if(!state.updates[cc]){render();toast('Esta tienda conserva los datos de base.');return;}transact(()=>{delete state.updates[cc];moving=false;},'Evaluación de la tienda restablecida a la base.');}
  function showSelectionMap(){
    $('modal').close();const stores=cachedStores.filter(s=>selected.has(s.cc)&&C.hasPoint(s));if(!stores.length)return;
    map.fitBounds(L.latLngBounds(stores.map(s=>[s.latitude,s.longitude])),{padding:[100,100],maxZoom:15,animate:false});
    nearLayer.clearLayers();
    if(stores.length===2)L.polyline(stores.map(s=>[s.latitude,s.longitude]),{color:'#174e36',weight:2,dashArray:'6 6'}).bindTooltip(number(C.distance(stores[0],stores[1]))+' km en línea recta',{permanent:true,direction:'center'}).addTo(nearLayer);
  }

  // Eventos delegados: el HTML nunca ejecuta contenido procedente de los archivos.
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]');
    if(action){
      const cc=action.dataset.cc;
      switch(action.dataset.action){
        case 'focus':focusStore(cc);break;
        case 'review-focus':$('modal').close();view='proposal';clearFilters();focusStore(cc);break;
        case 'choose-home':$('storeRegion').value=C.REGION;populateStoreDms(C.REGION,$('storeDm').value);updateDraftMessage(base.stores.find(s=>s.cc===focus));break;
        case 'choose-away':$('storeRegion').focus();document.querySelector('.proposal-message').textContent='Elige la región que recibiría esta tienda y guarda tu propuesta.';try{if($('storeRegion').showPicker)$('storeRegion').showPicker();}catch(error){}break;
        case 'bulk-home':$('bulkRegion').value=C.REGION;populateBulkDms();break;

        case 'focus-region':$('modal').close();view='proposal';clearFilters();filter.scope='all';filter.origin='';filter.region=action.dataset.region;render();fitVisible();break;
        case 'fit-cartography':fitCartography();break;


        case 'guide':guide();break;
        case 'summary':summary();break;
        case 'focus-dm':$('modal').close();clearFilters();filter.dm=action.dataset.dm;render();fitVisible();break;
        case 'filter-dm':filter.dm=filter.dm===action.dataset.dm?'':action.dataset.dm;render();fitVisible();break;
        case 'filter-region':chooseRegion(action.dataset.region);break;
        case 'all-regions':chooseRegion('');break;
        case 'directory-focus':$('modal').close();view='base';clearFilters();focusStore(cc);break;
        case 'directory-toggle':document.querySelectorAll('.directory-region').forEach(d=>d.open=true);break;
        case 'audit-focus':$('modal').close();clearFilters();focusStore(cc);break;
        case 'near-focus':case 'compare-focus':if($('modal').open)$('modal').close();if(!visible.some(s=>s.cc===cc)){clearFilters();}focusStore(cc);break;
        case 'close-inspector':closeInspector();break;
        case 'toggle-compare':toggleSelected(cc);break;
        case 'close-modal':$('modal').close();break;
        case 'nearby':nearbyOn=!nearbyOn;renderStoreInspector();renderNearby();break;
        case 'move-pin':if(!C.hasPoint(getStore(focus))){toast('Completa las coordenadas en el CMS para ubicar esta tienda.');break;}moving=!moving;view='proposal';render();if(moving){const s=getStore(focus);map.setView([s.latitude,s.longitude],17,{animate:false});const pt=map.project([s.latitude,s.longitude],17);map.panTo(map.unproject(L.point(pt.x+100,pt.y),17),{animate:false});toast('Arrastra el pin. El cambio se guarda al soltarlo.');}break;
        case 'reset-store':resetStore(cc);break;
        case 'save-area':saveArea();break;
        case 'reset-area':if(areaFocus)transact(()=>delete state.areas[areaFocus],'Fondo de ese municipio restablecido.');break;
        case 'bulk':showBulk();populateBulkDms();$('bulkRegion').addEventListener('change',populateBulkDms);break;
        case 'apply-bulk':applyBulk();break;
        case 'compare':compare();break;
        case 'clear-selection':selected.clear();render();break;
        case 'export-json':exportJson();break;
        case 'export-csv':exportCsv();break;
        case 'show-selection-map':showSelectionMap();break;
      }
    }
    const viewButton=event.target.closest('[data-view]');if(viewButton){view=viewButton.dataset.view;moving=false;render();}
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.select){toggleSelected(input.dataset.select);}
  });
  function clearFilters(){Object.keys(filter).forEach(k=>filter[k]='');filter.scope='all';filter.status='Actual';$('search').value='';render();}
  function chooseRegion(region){filter.region=region;filter.dm='';filter.search='';$('search').value='';render();fitVisible();}
  $('search').addEventListener('input',ev=>{filter.search=ev.target.value;render();});
  for(const [id,key] of [['dmFilter','dm'],['zoneFilter','zone'],['decisionFilter','decision']])$(id).addEventListener('change',event=>{filter[key]=event.target.value;render();fitVisible();});
  $('regionFilter').addEventListener('change',event=>chooseRegion(event.target.value));
  $('sortSelect').addEventListener('change',renderList);
  $('clearFilters').addEventListener('click',()=>{clearFilters();fitVisible();});
  $('selectVisible').addEventListener('change',event=>{visible.forEach(s=>event.target.checked?selected.add(s.cc):selected.delete(s.cc));render();});
  $('backgroundBtn').addEventListener('click',openBackground);
  $('fitBtn').addEventListener('click',fitVisible);$('undoBtn').addEventListener('click',undo);$('areaBtn').addEventListener('click',startArea);
  $('guideBtn').addEventListener('click',guide);$('summaryBtn').addEventListener('click',summary);
  $('exportBtn').addEventListener('click',showExport);$('reviewBtn').addEventListener('click',reviewData);$('sourcesBtn').addEventListener('click',sources);
  $('mobileListBtn').addEventListener('click',()=>setSidebar(!$('sidebar').classList.contains('open')));
  $('closeListBtn').addEventListener('click',()=>setSidebar(false));
  $('menusToggle').addEventListener('click',()=>setMenusVisible(!menusVisible));
  $('auditBtn').addEventListener('click',showAudit);
  $('directoryBtn').addEventListener('click',showDirectory);
  document.querySelector('.skip-link').addEventListener('click',()=>setSidebar(true,true));
  $('dismissSteps').addEventListener('click',()=>$('mapSteps').classList.add('hidden'));
  document.addEventListener('keydown',event=>{
    const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(event.key==='Escape'){stopArea();if(!$('modal').open){setMenusVisible(true);if(inspectorMode)closeInspector();setSidebar(false);}}
    if(!typing&&event.key==='/'&&!$('modal').open){event.preventDefault();setSidebar(true,true);}
    if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo();}
  });
  syncMenus();render();fitVisible();if(document.body.dataset.openDirectory)showDirectory();if(scenarioNotice){persist();toast(scenarioNotice);}
})();
