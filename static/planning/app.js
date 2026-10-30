/* Centro Norte 4.1 · Fondo cartográfico y regiones internas independientes. */
(() => {
  'use strict';
  const C=window.PlanningCore, geo=window.MAPA_GEO, $=id=>document.getElementById(id), e=C?C.escape:String;
  if(!C || !geo || !window.MAPA_BASE || !window.L) {
    document.body.innerHTML='<p style="padding:30px">No se pudo abrir el mapa. Extrae todo el ZIP y abre index.html dentro de la carpeta completa.</p>';return;
  }
  const STORAGE='centronorte-planning-v4';
  let base=window.MAPA_BASE,state=C.freshState(), view='proposal', colorMode='regional', focus=null, areaFocus=null;
  let inspectorMode=null,selected=new Set(), history=[], nearbyOn=false, moving=false, showBackground=true, showLabels=false,showZoneLabels=true,showNeighbors=true, opacity=0.27;
  let areaMode=false,areaStart=null,areaRectangle=null, toastTimer, tileErrors=0;
  let cachedStores=[],visible=[], markers=new Map();
  const filter={search:'',dm:'',zone:'',status:'',decision:'',origin:'',scope:'all'};
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
      else {localStorage.setItem(STORAGE+'-respaldo-anterior',saved);scenarioNotice='La base cambió. Se inicia una propuesta nueva y se conserva un respaldo del escenario anterior en este equipo.';}
    }
  }catch(error){scenarioNotice='No se pudo recuperar la propuesta anterior. La base publicada permanece disponible.';}
  $('scenarioName').value=state.name;
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
    layer.on('mouseover',()=>{if(inspectorMode==='background')layer.setStyle({weight:2,color:C.zoneColors[areaZone(feature.properties)],fillOpacity:showBackground?Math.min(.6,opacity+.1):0});});
    layer.on('mouseout',()=>layer.setStyle(areaStyle(feature)));
    layer.bindTooltip(()=>'<b>'+e(feature.properties.name)+'</b><br>'+e('Zona geográfica: '+areaZone(feature.properties))+'<br><small>Límite municipal INEGI</small>',{sticky:true});
  }}).addTo(map);
  const neighborLayer=L.geoJSON(geo.neighbors,{pane:'regions',style:{color:'#9ba58c',weight:1.1,dashArray:'5 4',fillColor:'#b4b9a5',fillOpacity:.09},onEachFeature:(f,l)=>l.bindTooltip(e(f.properties.name),{sticky:true})}).addTo(map);
  neighborLayer.bringToBack();
  const labelLayer=L.layerGroup().addTo(map),zoneNameLayer=L.layerGroup().addTo(map), nearLayer=L.layerGroup().addTo(map);
  const cluster=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:zoom=>zoom>=16?9:38,spiderfyOnMaxZoom:true,spiderfyDistanceMultiplier:1.8,zoomToBoundsOnClick:true,animate:false,iconCreateFunction:group=>{
    const children=group.getAllChildMarkers(),counts=new Map();
    if(colorMode==='regional'){const included=children.filter(m=>m.options.regionIncluded).length,total=children.length;return L.divIcon({html:'<div class="regional-cluster '+(!included?'external-cluster':'')+'" title="'+total+' ubicaciones · '+included+' en Centro Norte"><span>'+total+'</span></div>',className:'cluster-icon',iconSize:[36,36]});}
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
  function allDms() {return [...new Set([...base.stores.map(s=>s.dm),...Object.values(state.updates).map(s=>s.dm).filter(Boolean),...state.extraDms])].sort((a,b)=>a.localeCompare(b,'es'));}
  function dmColor(dm){const custom=Object.prototype.hasOwnProperty.call(state.dmColors,dm)?state.dmColors[dm]:null;const standard=Object.prototype.hasOwnProperty.call(C.dmColors,dm)?C.dmColors[dm]:null;return custom || standard || C.palette[Math.max(0,allDms().indexOf(dm))%C.palette.length];}
  function pinColor(s){return colorMode==='dm'?dmColor(s.dm):'#006241';}
  function geoZone(prop){return C.mapZone(prop);}
  function areaZone(prop){return C.mapZone(prop,state.areas);}
  function areaStyle(feature){return C.cartographicStyle(feature.properties,state.areas,{visible:showBackground,opacity,selectedId:inspectorMode==='background'?areaFocus:null});}
  function badge(s){const decision=s.movement||s.decision;const css={'Por evaluar':'review','Conservar':'keep','Tomar':'keep','Ceder':'move','Reasignar':'move','No considerar':'drop'}[decision];return '<span class="badge '+css+'">'+e(decision)+'</span>';}
  function number(value){return new Intl.NumberFormat('es-MX',{maximumFractionDigits:1}).format(value);}
  function dateLabel(date){if(!date)return 'Sin fecha · apertura';return new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));}
  function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4200);}
  function persist(){
    try{localStorage.setItem(STORAGE,JSON.stringify(C.pack(base,state)));$('saveState').textContent='Guardado en este equipo';}
    catch(error){$('saveState').textContent='Exporta para conservar tus cambios';}
  }
  function transact(change,message){
    history.push(JSON.stringify({base,state}));if(history.length>35)history.shift();
    change();$('scenarioName').value=state.name;persist();render();if(message)toast(message);
  }
  function undo(){if(!history.length)return;const old=JSON.parse(history.pop());base=old.base;state=old.state;moving=false;persist();render();toast('Último cambio deshecho.');}
  function getStore(cc){return cachedStores.find(s=>s.cc===cc);}
  function proposedStore(cc){return C.current(base,state).find(s=>s.cc===cc);}
  function isPositionChanged(s){const b=base.stores.find(b=>b.cc===s.cc);return b&&(b.latitude!==s.latitude||b.longitude!==s.longitude);}

  function render(){
    cachedStores=C.current(base,state,view);visible=C.filtered(cachedStores,filter);
    renderFilters();renderList();renderPins();renderLegend();renderDock();renderBackground();renderStats();renderHealth();renderRegionalBalance();
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
    document.body.classList.toggle('regional-view',colorMode==='regional');
    $('dmToggleText').textContent=colorMode==='dm'?'Ocultar DM':'Mostrar DM';$('dmToggle').setAttribute('aria-pressed',String(colorMode==='dm'));
    $('viewHelper').textContent=colorMode==='dm'?'Pines por DM · fondo por zonas':'Pines verdes · fondo por zonas';
    $('viewLabel').textContent=view==='base'?'VISTA BASE ACTUAL':'VISTA PROPUESTA';
    $('backgroundBtn').classList.toggle('active',inspectorMode==='background');$('backgroundBtn').setAttribute('aria-pressed',String(inspectorMode==='background'));
    $('undoBtn').disabled=!history.length;
    if(inspectorMode==='store'&&focus)renderStoreInspector();
    else if(inspectorMode==='background')renderBackgroundInspector();
    renderNearby();
  }
  function renderStats(){
    const b=C.balance(base,state),external=base.stores.length-b.base;
    $('scopeSummary').innerHTML='<div class="baseline-top"><span>BASE CENTRO NORTE</span><b>'+b.base+' ubicaciones</b></div><div class="baseline-equation"><strong>'+b.baseCurrent+'</strong><span>tiendas actuales</span><i>+</i><strong>'+b.baseOpenings+'</strong><span>aperturas</span></div><div class="baseline-foot">'+external+' tiendas de otras regiones como opciones</div>';
  }
  function renderRegionalBalance(){
    const b=C.balance(base,view==='base'?C.freshState():state);
    const entries=[['kept',b.kept.length,'Se conservan','en Centro Norte'],['incoming','+'+b.incoming.length,'Tomar','de otras regiones'],['outgoing','−'+b.outgoing.length,b.excluded.length?'Ceder / excluir':'Ceder',b.excluded.length?'fuera de propuesta':'a otra región']];
    $('regionalBalance').innerHTML=entries.map(([key,count,label,hint])=>'<button class="balance-metric" data-action="balance-filter" data-group="'+key+'"><span>'+label+'</span><strong>'+count+'</strong><small>'+hint+'</small></button>').join('')+'<button class="balance-total" data-action="summary"><span>Tu región propuesta <i>↗</i></span><strong>'+b.total+'<small>ubicaciones</small></strong><div>'+b.current+' actuales + '+b.openings+' aperturas <b>'+(b.delta>0?'+':'')+b.delta+' vs. base</b></div></button>';
    const all=C.current(base,state,view),counts={all:all.length,home:all.filter(s=>C.inRegion(s)).length,external:all.filter(x=>x.origin_region!==C.REGION).length,moves:all.filter(x=>x.region!==x.origin_region||x.decision==='No considerar').length};
    $('scopeTabs').innerHTML=[['all','Todas'],['home','Mi región'],['external','Opciones'],['moves','Cambios']].map(([key,label])=>'<button data-scope="'+key+'" aria-pressed="'+(filter.scope===key)+'" class="'+(filter.scope===key?'active':'')+'">'+label+'<b>'+counts[key]+'</b></button>').join('');
  }
  function renderHealth(){
    const warnings=insights.warnings||[],count=new Set(warnings.map(w=>w.cc)).size;
    $('reviewBtn').classList.toggle('blocked',!healthy);
    $('healthText').textContent=healthy?'Base validada':'Revisar base';
    $('qualityCard').classList.toggle('blocked',!healthy);
    $('qualityCard').innerHTML='<span class="quality-icon">'+(healthy?'✓':'!')+'</span><span><strong>'+(healthy?'Lista para proponer':'Revisión necesaria')+'</strong><small>'+(healthy?base.stores.length+' ubicaciones · origen verificado':'Consulta el detalle antes de continuar')+'</small></span><span class="review-count">'+(healthy?(count?count+' por revisar':'Ver detalle'):'Ver errores')+' ›</span>';
    const done=C.current(base,state).filter(s=>s.decision!=='Por evaluar').length,percent=Math.round(done/base.stores.length*100);
    $('completionMeter').innerHTML='<span><b>'+done+'</b> / '+base.stores.length+' revisadas</span><div><i style="width:'+percent+'%"></i></div>';
  }
  function closest(s,stores,n=3){
    const moved=Object.values(state.updates).some(u=>u.latitude!=null||u.longitude!=null);
    if(healthy&&!moved&&insights.nearest&&insights.nearest[s.cc]){
      const byId=new Map(stores.map(s=>[s.cc,s]));
      return insights.nearest[s.cc].filter(x=>byId.has(x.cc)).slice(0,n).map(x=>({...byId.get(x.cc),km:x.km}));
    }
    return C.nearest(s,stores,n);
  }
  function reviewData(){
    const warnings=insights.warnings||[],c=insights.counts||{},date=insights.validated_at?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(insights.validated_at)):'';
    const cards='<div class="review-metrics"><div><strong>'+base.stores.length+'</strong><span>tiendas verificadas</span></div><div><strong>'+(c.current??'—')+'</strong><span>tiendas actuales</span></div><div><strong>'+(c.openings??'—')+'</strong><span>aperturas sin fecha</span></div><div><strong>'+(c.dms??'—')+'</strong><span>responsables DM</span></div></div>';
    const checklist='<div class="check-grid">'+['CeCo únicos','Coordenadas numéricas','Fechas consistentes','Regiones de origen'].map(t=>'<span class="'+(healthy?'check-ok':'check-pending')+'">'+(healthy?'✓':'○')+' '+t+'</span>').join('')+'</div>';
    const issues=warnings.map(w=>{const s=base.stores.find(s=>s.cc===w.cc);return '<button class="review-issue" data-action="review-focus" data-cc="'+e(w.cc)+'"><span class="review-issue-icon">!</span><span><strong>'+e(w.cc+' · '+(s?s.store_name:''))+'</strong><small>'+e(w.detail)+'</small></span><b>Ver en mapa ›</b></button>';}).join('');
    const errors=healthy?'':'<div class="error-text">'+e((insights.errors||['La revisión y la base no coinciden. Ejecuta ACTUALIZAR_MAPA.py para revisar la información.']).join('\n'))+'</div>';
    modal(healthy?'Tu información está lista.':'Revisemos la información.','Centro Norte parte de '+(c.regional_current??0)+' tiendas actuales y '+(c.regional_openings??0)+' aperturas. Las otras '+(c.external??0)+' tiendas son opciones para tomar.',
      errors+cards+checklist+'<div class="note">David Carrasco: Bajío · Mónica Morales: Centro Sur. '+(base.stores.some(s=>s.cc==='43302'&&s.location_verification)?'Toreo Walmart (43302): ubicación confirmada; se conservan sus coordenadas.':'Las confirmaciones de ubicación se muestran en cada ficha.')+'</div>'+'<div class="review-section-title">'+(warnings.length?'Puntos para validar en el mapa':'Sin puntos pendientes de ubicación')+'</div>'+issues+'<div class="note">'+(healthy?'La estructura de la base es correcta. Los avisos señalan datos de origen que conviene revisar antes de decidir.':'La base anterior se conserva; corrige los errores para recuperar el estado verde.')+' Las aperturas sin fecha se muestran con un rombo +.</div><p class="validation-stamp">Validación de Python'+(date?' · '+e(date):'')+(insights.signature?' · Base '+e(insights.signature.slice(0,8)):'')+'</p>',
      '<button class="secondary" data-action="guide">Cómo usar el mapa</button><button class="secondary" data-action="summary">Ver reparto</button><button class="primary" data-action="close-modal">Ir al mapa</button>');
  }
  function renderFilters(){
    $('dmFilter').innerHTML='<option value="">Todos los DM</option>'+allDms().map(dm=>'<option value="'+e(dm)+'"'+(filter.dm===dm?' selected':'')+'>'+e(C.dmLabel(dm))+'</option>').join('');
    $('regionFilter').innerHTML=options(C.regions,filter.origin,'Todas las regiones internas');
    $('zoneFilter').innerHTML=options(C.zones,filter.zone,'Todas las zonas');
    $('decisionFilter').innerHTML=options(C.decisions,filter.decision,'Todas las decisiones');
    $('filterCount').textContent=visible.length+' de '+base.stores.length+' ubicaciones'+(filter.region?' · Destino: '+filter.region:'');
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
    const cls=['pin-shell',s.status==='Apertura'?'opening':'',!C.inRegion(s)?'context-pin':'',s.movement==='Tomar'?'incoming-pin':'',s.movement==='Ceder'?'outgoing-pin':'',s.decision==='No considerar'?'drop':'',selected.has(s.cc)?'selected':'',focus===s.cc?'focused':''].filter(Boolean).join(' ');
    const content=s.movement==='Ceder'?'↗':s.movement==='Tomar'?'+':s.decision==='No considerar'?'×':s.status==='Apertura'?'+':s.decision==='Conservar'?'✓':'•';
    return L.divIcon({className:'map-pin',html:'<div class="'+cls+'" style="--pin:'+pinColor(s)+'"><div class="pin-head"><span>'+content+'</span></div></div>',iconSize:[28,34],iconAnchor:[14,31],tooltipAnchor:[0,-29]});
  }
  function renderPins(){
    cluster.clearLayers();markers.clear();const ms=[];
    visible.forEach(s=>{
      const marker=L.marker([s.latitude,s.longitude],{icon:makeIcon(s),title:s.cc+' · '+s.store_name,alt:s.cc+' '+s.store_name,pinColor:pinColor(s),regionIncluded:C.inRegion(s),draggable:moving&&s.cc===focus,zIndexOffset:focus===s.cc?1200:0});
      marker.bindTooltip('<b>'+e(s.cc+' · '+s.store_name)+'</b><br>'+e(s.origin_region)+(s.region!==s.origin_region?' → '+e(s.region):'')+(colorMode==='dm'?'<br>'+e(C.dmLabel(s.dm)):'')+(s.status==='Apertura'?'<br>Apertura · sin fecha':''));
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
    let pins;
    if(colorMode==='regional'){
      const count=visible.filter(s=>C.inRegion(s)).length;
      pins='<div class="legend-title">TIENDAS · STARBUCKS <span>'+count+' en CN</span></div><div class="regional-key"><span><i class="key-dot solid"></i>En tu región interna</span><span><i class="key-dot hollow"></i>Opción de otra región</span><span><i class="key-dot plus">+</i>Propuesta para tomar</span><span><i class="key-dot arrow">↗</i>Propuesta para ceder</span></div><div class="pin-shape-note"><i class="diamond-tiny"></i>Rombo: apertura</div>';
    }else{
      const counts=new Map();visible.forEach(s=>counts.set(s.dm,(counts.get(s.dm)||0)+1));
      pins='<div class="legend-title">PINES · DM STARBUCKS <span>'+visible.length+'</span></div><div class="legend-items">'+allDms().map(dm=>'<div class="legend-row"><i style="background:'+dmColor(dm)+'"></i><span>'+e(C.dmLabel(dm))+'</span><b>'+(counts.get(dm)||0)+'</b></div>').join('')+'</div>';
    }
    $('legend').innerHTML=pins+'<section class="cartography-legend" aria-label="Colores del fondo geográfico"><div class="legend-title">FONDO · ZONAS GEOGRÁFICAS</div><p>Límites municipales INEGI</p><div class="cartography-swatches">'+C.zones.map(zone=>'<span><i style="background:'+C.zoneColors[zone]+'"></i>'+e(zone)+'</span>').join('')+'</div><button class="map-extent-link" data-action="fit-cartography">Ver territorio completo ↗</button><small>'+(showBackground?'Agrupación por orientación':'Colores de fondo ocultos')+'</small></section>';
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

  function renderZoneNames(){
    zoneNameLayer.clearLayers();
    if(!showZoneLabels||!showBackground||map.getZoom()>12)return;
    const bounds=map.getBounds(),size=map.getSize();
    // Elegir una referencia visible de cada zona, sin mover ni colorear los pines.
    const candidates=geo.municipalities.features.filter(f=>{
      const p=f.properties,latlng=[p.center[1],p.center[0]],screen=map.latLngToContainerPoint(latlng);
      return bounds.contains(latlng)&&screen.y>260&&screen.y<size.y-90&&screen.x>60&&screen.x<size.x-70;
    });
    C.zones.forEach(zone=>{
      const group=candidates.filter(f=>areaZone(f.properties)===zone);if(!group.length)return;
      const x=group.reduce((n,f)=>n+f.properties.center[0],0)/group.length,y=group.reduce((n,f)=>n+f.properties.center[1],0)/group.length;
      const target=map.latLngToContainerPoint([y,x]),pinPoints=visible.map(store=>map.latLngToContainerPoint([store.latitude,store.longitude]));
      const score=f=>{const point=map.latLngToContainerPoint([f.properties.center[1],f.properties.center[0]]),distance=Math.min(Infinity,...pinPoints.map(pin=>point.distanceTo(pin)));return point.distanceTo(target)+Math.max(0,58-distance)*5+(point.x<250&&point.y>size.y-410?500:0);};
      const nearest=group.reduce((a,b)=>score(b)<score(a)?b:a);
      const p=nearest.properties;
      L.marker([p.center[1],p.center[0]],{pane:'labels',interactive:false,icon:L.divIcon({className:'geographic-zone-label',html:'<span style="--zone:'+C.zoneColors[zone]+'">'+e(zone)+'</span>',iconSize:[102,25],iconAnchor:[51,12]})}).addTo(zoneNameLayer);
    });
  }
  map.on('moveend',()=>{if(showLabels||showZoneLabels)renderLabels();});
  function fitCartography(){
    map.fitBounds(areasLayer.getBounds(),{paddingTopLeft:[55,275],paddingBottomRight:[inspectorMode?350:45,105],maxZoom:10,animate:false});
  }
  function fitVisible(){
    if(!visible.length){toast('No hay ubicaciones visibles con estos filtros.');return;}
    const right=inspectorMode?330:50;
    map.fitBounds(L.latLngBounds(visible.map(s=>[s.latitude,s.longitude])),{paddingTopLeft:[65,185],paddingBottomRight:[Math.min(right,map.getSize().x*.35),110],maxZoom:14,animate:false});
  }
  function setInspector(mode){
    inspectorMode=mode;$('inspector').classList.toggle('hidden',!mode);document.querySelector('.map-workspace').classList.toggle('has-inspector',!!mode);
    if(mode)$('mapSteps').classList.add('hidden');
    $('backgroundBtn').classList.toggle('active',mode==='background');renderDock();
  }
  function focusStore(cc,pan=true){
    const store=getStore(cc);if(!store)return;
    moving=false;focus=cc;setInspector('store');renderList();renderPins();renderStoreInspector();renderNearby();
    $('sidebar').classList.remove('open');
    if(pan){
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
    const geoNotes=confirmed?'<div class="confirmed-location">✓ Ubicación confirmada por el Regional</div>':mismatch?'<div class="alert"><b>Validar ubicación</b><br>Excel: '+e(s.municipality)+' · '+e(s.coverage)+'<br>Coordenada: '+e(geomName)+'.</div>':'';
    const nearest=closest(location,cachedStores,3);
    $('inspector').innerHTML='<div class="inspector-header"><span class="eyebrow">PROPONER TIENDA</span><button data-action="close-inspector" aria-label="Cerrar evaluación">×</button></div><div class="inspector-body"><span class="ceco">CECO '+s.cc+'</span><h2>'+e(s.store_name)+'</h2><p class="location-meta">'+e(s.municipality)+' · '+e(s.coverage)+(s.status==='Apertura'?'<br>Apertura · sin fecha':'')+'</p>'+geoNotes+'<div class="region-route"><div><small>ORIGEN STARBUCKS</small><b>'+e(original.region)+'</b></div><span>→</span><div><small>PROPUESTA STARBUCKS</small><b>'+e(s.region)+'</b></div></div><div class="proposal-message">'+(s.movement==='Tomar'?'Esta tienda se suma a Centro Norte.':s.movement==='Ceder'?'Se propone ceder esta tienda a '+e(s.region)+'.':home?'Tu tienda permanece en Centro Norte.':'Opción de '+e(original.region)+' para sumar a tu región.')+'</div>'+(view==='base'?'<div class="note base-notice">Estás viendo la base. Al guardar pasarás a Mi propuesta.</div>':'')+'<form id="storeForm"><label class="region-destination">Región interna propuesta<select id="storeRegion">'+options(C.regions,s.region)+'</select></label><div class="quick-proposals"><button type="button" data-action="choose-home">'+(home?'✓ Conservar en Centro Norte':'+ Tomar para Centro Norte')+'</button>'+(home?'<button type="button" data-action="choose-away">↗ Ceder a otra región</button>':'')+'</div><label class="proposal-notes">Motivo de la propuesta <span>(opcional)</span><textarea id="storeNotes" maxlength="2000" placeholder="¿Qué mejora esta decisión en el territorio?">'+e(s.notes)+'</textarea></label><details class="assignment-details"><summary>Asignación DM y zona</summary><div class="form-grid"><label class="full">DM propuesto<select id="storeDm">'+allDms().map(dm=>'<option value="'+e(dm)+'"'+(dm===s.dm?' selected':'')+'>'+e(C.dmLabel(dm))+'</option>').join('')+'</select></label><label class="full">Zona geográfica<select id="storeZone">'+options(C.zones,s.zone)+'</select></label></div><p class="hint">Cambiar DM o zona no modifica la región elegida.</p></details><button class="primary save-proposal" type="submit">Guardar en la propuesta</button></form><div class="inline-actions"><button data-action="toggle-compare" data-cc="'+s.cc+'">'+(selected.has(s.cc)?'✓ En selección':'+ Seleccionar varias')+'</button><button data-action="reset-store" data-cc="'+s.cc+'">Restablecer</button></div><details class="location-details"><summary>Ubicación y cercanía</summary><div class="original-info">DM base: <b>'+e(C.dmLabel(original.dm))+'</b><br>'+e(dateLabel(s.opening_date))+'<br>Municipio por coordenada: '+e(geomName)+'</div><button data-action="move-pin" class="quiet">'+(moving?'Terminar ajuste':'Ajustar ubicación del pin')+'</button>'+(moving?'<div class="area-instruction">Arrastra el pin. La nueva coordenada se guarda al soltarlo; puedes deshacer.</div>':'')+'<p class="hint">'+location.latitude.toFixed(6)+', '+location.longitude.toFixed(6)+'</p><div class="nearby-heading"><h3>Tiendas cercanas</h3><button data-action="nearby">'+(nearbyOn?'Ocultar líneas':'Ver cercanía')+'</button></div>'+nearest.map(n=>'<button class="nearby-row" data-action="near-focus" data-cc="'+n.cc+'"><i class="dm-swatch" style="--pin:'+pinColor(n)+'"></i><span>'+e(n.store_name)+'<small>'+n.cc+' · '+e(n.region)+'</small></span><b>'+number(n.km)+' km</b></button>').join('')+'<p class="hint">Distancias en línea recta; no son recorridos ni tiempos.</p></details></div>';
    $('storeForm').addEventListener('submit',event=>{
      event.preventDefault();const update={...(state.updates[focus]||{}),...C.proposalUpdate(original,$('storeRegion').value),dm:$('storeDm').value,zone:$('storeZone').value,notes:$('storeNotes').value.trim()};
      transact(()=>{view='proposal';state.updates[focus]=update;},'Propuesta guardada · '+s.cc+' '+s.store_name);
    });
    $('storeRegion').addEventListener('change',()=>updateDraftMessage(original));
  }
  function updateDraftMessage(original){
    const region=$('storeRegion').value,u=C.proposalUpdate(original,region),b=C.balance(base,state),was=C.inRegion(proposedStore(original.cc)),will=region===C.REGION;
    const total=b.total+(will?1:0)-(was?1:0),message=document.querySelector('.proposal-message');
    message.textContent=(u.decision==='Tomar'?'Tomar para Centro Norte':u.decision==='Ceder'?'Ceder a '+region:u.decision==='Conservar'?'Conservar en '+region:'Proponer para '+region)+' · Al guardar: '+total+' ubicaciones en Centro Norte';
    message.classList.add('draft-message');
  }
  function renderNearby(){
    nearLayer.clearLayers();if(!nearbyOn||!focus||inspectorMode!=='store')return;
    const s=getStore(focus);if(!s)return;
    L.circle([s.latitude,s.longitude],{radius:3000,color:'#3d7950',fillColor:'#7ca46b',fillOpacity:.055,weight:1,dashArray:'5 5',interactive:false}).bindTooltip('Radio de referencia: 3 km').addTo(nearLayer);
    closest(s,cachedStores,3).forEach(n=>L.polyline([[s.latitude,s.longitude],[n.latitude,n.longitude]],{color:'#315e48',weight:1.5,dashArray:'5 7',opacity:.8,interactive:false}).addTo(nearLayer));
  }
  function closeInspector(){setInspector(null);moving=false;focus=null;areaFocus=null;render();$('mapStatus').lastElementChild.textContent='Explora el mapa o selecciona una tienda';}

  function openBackground(){moving=false;focus=null;setInspector(inspectorMode==='background'?null:'background');render();}
  function renderBackgroundInspector(){
    const feature=geoById.get(areaFocus),p=feature&&feature.properties;
    const selectedArea=p?'<h3>'+e(p.name)+'</h3><p class="location-meta">'+e(STATE_NAMES[p.state])+' · INEGI '+p.id+'</p><label>Zona geográfica del municipio<select id="areaZone">'+options(C.zones,areaZone(p))+'</select></label><button class="primary" data-action="save-area">Pintar solo este fondo</button><div class="selected-zone-info">Orientación inicial: <b>'+e(geoZone(p))+'</b><br>Zona del fondo: <b>'+e(areaZone(p))+'</b></div><button class="quiet" data-action="reset-area" style="margin-top:10px;width:100%">Restablecer este municipio</button>':'<div class="area-instruction"><b>Selecciona un municipio en el mapa.</b><br>Puedes ajustar su zona geográfica y el color de su fondo.</div>';
    $('inspector').innerHTML='<div class="inspector-header"><span class="eyebrow">CAPA CARTOGRÁFICA</span><button data-action="close-inspector" aria-label="Cerrar fondo geográfico">×</button></div><div class="inspector-body"><h2>Las zonas del territorio.</h2><p class="location-meta">Límites municipales de INEGI · '+geo.municipalities.features.length+' municipios y alcaldías.</p><div class="cartography-explanation">Los colores muestran orientación geográfica. Las regiones internas de Starbucks se asignan en la ficha de cada tienda.</div><label class="switch-row"><input id="showBackground" type="checkbox"'+(showBackground?' checked':'')+'>Pintar zonas del fondo</label><label>Intensidad del fondo<div class="opacity-row"><input type="range" id="backgroundOpacity" min="5" max="55" value="'+Math.round(opacity*100)+'"><span id="opacityValue">'+Math.round(opacity*100)+'%</span></div></label><label class="switch-row"><input id="showZoneLabels" type="checkbox"'+(showZoneLabels?' checked':'')+'>Nombres de zonas geográficas</label><label class="switch-row"><input id="showLabels" type="checkbox"'+(showLabels?' checked':'')+'>Nombres de municipios</label><label class="switch-row"><input id="showNeighbors" type="checkbox"'+(showNeighbors?' checked':'')+'>Entidades vecinas</label><button class="quiet cartography-extent" data-action="fit-cartography">Ver las cinco zonas en el mapa ↗</button><div class="zone-key">'+C.zones.map(zone=>'<span><i style="background:'+C.zoneColors[zone]+'"></i>'+e(zone)+'</span>').join('')+'</div>'+selectedArea+'<div class="note">INEGI aporta los límites municipales. Las cinco zonas son una agrupación de referencia por orientación, ajustable por municipio; no son una regionalización oficial de INEGI.</div></div>';
    $('showBackground').addEventListener('change',ev=>{showBackground=ev.target.checked;renderBackground();renderLegend();});
    $('showZoneLabels').addEventListener('change',ev=>{showZoneLabels=ev.target.checked;renderLabels();});
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
    areaMode=true;areaStart=null;$('areaBtn').classList.add('active');document.body.classList.add('crosshair');toast('Marca dos esquinas en el mapa para seleccionar tiendas. Esc cancela.');
    $('mapStatus').lastElementChild.textContent='Selección de área · marca la primera esquina';
  }
  function stopArea(){areaMode=false;areaStart=null;if(areaRectangle){map.removeLayer(areaRectangle);areaRectangle=null;}$('areaBtn').classList.remove('active');document.body.classList.remove('crosshair');}
  function onAreaClick(latlng){
    if(!areaStart){areaStart=latlng;$('mapStatus').lastElementChild.textContent='Marca la segunda esquina del área';return;}
    const bounds=L.latLngBounds(areaStart,latlng),found=visible.filter(s=>bounds.contains([s.latitude,s.longitude]));found.forEach(s=>selected.add(s.cc));stopArea();render();toast(found.length+' tiendas del área añadidas a la selección.');$('mapStatus').lastElementChild.textContent='Selección de área lista';
  }
  function modal(title,subtitle,body,actions='',small=false){
    $('modal').classList.toggle('small-modal',small);
    $('modalContent').innerHTML='<div class="modal-head"><div><div class="eyebrow">CENTRO NORTE · MESA DE TRABAJO</div><h2>'+e(title)+'</h2>'+(subtitle?'<p>'+e(subtitle)+'</p>':'')+'</div><button data-action="close-modal" aria-label="Cerrar ventana">×</button></div><div class="modal-body">'+body+'</div>'+(actions?'<div class="modal-actions">'+actions+'</div>':'');
    if(!$('modal').open)$('modal').showModal();
  }
  function guide(){
    const b=C.balance(base,state);
    modal('Tu región, en tres pasos.','Parte de '+b.baseCurrent+' tiendas actuales + '+b.baseOpenings+' aperturas y construye la siguiente estructura.',
      '<div class="guide-grid guide-three"><div class="guide-card"><span>01</span><h3>Elige las tiendas</h3><p>Selecciona un pin o busca el CeCo. «Mi región» muestra Centro Norte; «Opciones» muestra tiendas de otras regiones. Usa casillas o selección por área para agrupar.</p></div><div class="guide-card"><span>02</span><h3>Conserva, toma o cede</h3><p>En Región propuesta elige Centro Norte para tomar una tienda externa o mantener una propia. Elige otra región para ceder. Guarda la propuesta.</p></div><div class="guide-card"><span>03</span><h3>Mira el resultado</h3><p>El balance se actualiza al instante. «Ocultar DM» deja los pines en verde; el fondo mantiene sus cinco colores geográficos. Compara Base actual con Mi propuesta y exporta el detalle para Excel.</p></div></div><div class="note">Los cambios forman una propuesta y se guardan en este navegador. La base publicada permanece como referencia. Deshacer recupera el último cambio.</div>',
      '<button class="primary" data-action="close-modal">Ir al mapa</button>');
  }
  function showBulk(){
    if(!selected.size)return;
    const stores=C.current(base,state).filter(s=>selected.has(s.cc)),home=stores.filter(s=>s.origin_region===C.REGION).length;
    modal('Proponer '+selected.size+' tiendas','El destino se aplicará a toda la selección, incluidas las tiendas fuera del filtro.',
      '<div class="bulk-origin">'+home+' de Centro Norte · '+(stores.length-home)+' de otras regiones</div><label class="region-destination">Región interna propuesta<select id="bulkRegion">'+options(C.regions,'','Elige la región destino')+'</select></label><div class="quick-proposals"><button data-action="bulk-home">+ Llevar a Centro Norte</button></div><label>Motivo común (opcional)<textarea id="bulkNotes" maxlength="2000" placeholder="Se agregará a las notas existentes."></textarea></label><details class="assignment-details"><summary>Asignar también DM o zona</summary><div class="form-grid"><label>DM propuesto<select id="bulkDm">'+options(allDms(),'','Sin cambio')+'</select></label><label>Zona geográfica<select id="bulkZone">'+options(C.zones,'','Sin cambio')+'</select></label></div></details><div class="note">'+stores.slice(0,8).map(s=>e(s.cc+' '+s.store_name)).join(' · ')+(stores.length>8?' · y '+(stores.length-8)+' más':'')+'</div>',
      '<button class="secondary" data-action="close-modal">Volver</button><button class="primary" data-action="apply-bulk">Guardar selección en propuesta</button>',true);
  }
  function applyBulk(){
    const region=$('bulkRegion').value,dm=$('bulkDm').value,zone=$('bulkZone').value,notes=$('bulkNotes').value.trim();
    if(!region){toast('Elige la región destino de la selección.');$('bulkRegion').focus();return;}
    const count=selected.size;
    transact(()=>{view='proposal';selected.forEach(cc=>{const original=base.stores.find(s=>s.cc===cc),u={...(state.updates[cc]||{}),...C.proposalUpdate(original,region)};if(dm)u.dm=dm;if(zone)u.zone=zone;if(notes)u.notes=((u.notes?u.notes+'\n':'')+notes).slice(0,2000);state.updates[cc]=u;});selected.clear();},count+' tiendas propuestas para '+region+'.');$('modal').close();
  }
  function compare(){
    if(selected.size<2){toast('Selecciona al menos dos tiendas para comparar cercanía.');return;}
    const stores=C.current(base,state).filter(s=>selected.has(s.cc));
    const pairs=[];for(let i=0;i<stores.length;i++)for(let j=i+1;j<stores.length;j++)pairs.push({a:stores[i],b:stores[j],km:C.distance(stores[i],stores[j])});pairs.sort((a,b)=>a.km-b.km);
    modal('Comparar ubicaciones','Distancias en línea recta de la propuesta, calculadas entre las tiendas seleccionadas.',
      '<div class="comparison-stats"><div><b>'+stores.length+'</b><small>TIENDAS SELECCIONADAS</small></div><div><b>'+number(pairs[0].km)+' km</b><small>PAR MÁS CERCANO</small></div><div><b>'+number(pairs[pairs.length-1].km)+' km</b><small>PAR MÁS LEJANO</small></div></div><div class="table-wrap"><table><thead><tr><th>Ubicación A</th><th>Ubicación B</th><th>Distancia</th></tr></thead><tbody>'+pairs.slice(0,120).map(p=>'<tr><td><button data-action="compare-focus" data-cc="'+p.a.cc+'">'+e(p.a.store_name)+'<small>'+p.a.cc+' · '+e(p.a.dm)+'</small></button></td><td><button data-action="compare-focus" data-cc="'+p.b.cc+'">'+e(p.b.store_name)+'<small>'+p.b.cc+' · '+e(p.b.dm)+'</small></button></td><td>'+number(p.km)+' km</td></tr>').join('')+'</tbody></table></div><div class="note">'+(pairs.length>120?'Se muestran los 120 pares más cercanos de '+pairs.length+'. ':'')+'La cercanía es una referencia geográfica. Para recorridos, revisa vialidades y traslados antes de definir una asignación.</div>',
      '<button class="secondary" data-action="show-selection-map">Ver selección en el mapa</button><button class="primary" data-action="bulk">Evaluar selección</button>');
  }
  function summary(){
    const b=C.balance(base,state),proposed=C.current(base,state),moves=proposed.filter(s=>s.region!==s.origin_region||s.decision==='No considerar');
    const regionalRows=C.regions.map(region=>{const before=base.stores.filter(s=>s.region===region).length,after=proposed.filter(s=>C.inRegion(s,region)).length,delta=after-before;return '<tr'+(region===C.REGION?' class="home-region-row"':'')+'><td><button data-action="focus-region" data-region="'+e(region)+'">'+e(region)+(region===C.REGION?' · Nuestra región':'')+'</button></td><td>'+before+'</td><td><b>'+after+'</b></td><td>'+(delta>0?'+':'')+delta+'</td></tr>';}).join('');
    const details=moves.length?'<div class="table-wrap"><table><thead><tr><th>Tienda</th><th>Origen</th><th>Propuesta</th><th>Movimiento</th></tr></thead><tbody>'+moves.map(s=>'<tr><td><button data-action="review-focus" data-cc="'+s.cc+'">'+e(s.store_name)+'<small>'+s.cc+'</small></button></td><td>'+e(s.origin_region)+'</td><td>'+e(s.region)+'</td><td>'+e(s.movement)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty-proposal">Todavía no hay movimientos. Selecciona una tienda en el mapa y elige su región propuesta.</div>';
    const dmRows=allDms().map(dm=>{const count=b.included.filter(s=>s.dm===dm).length;return '<div class="summary-dm-row"><span>'+e(C.dmLabel(dm))+'</span><b>'+count+'</b></div>';}).join('');
    modal('Así quedaría Centro Norte.','Balance completo de tu propuesta, independiente de los filtros del mapa.',
      '<div class="summary-hero"><strong>'+b.total+'<small>ubicaciones propuestas</small></strong><div>'+b.current+' tiendas actuales + '+b.openings+' aperturas<br><b>'+(b.delta>0?'+':'')+b.delta+' ubicaciones frente a la base</b></div></div><div class="proposal-equation"><span>'+b.base+' base</span><i>+</i><span>'+b.incoming.length+' tomar</span><i>−</i><span>'+b.outgoing.length+' ceder / excluir</span><i>=</i><b>'+b.total+' propuesta</b></div><h3 class="review-section-title">Balance entre regiones</h3><div class="table-wrap"><table><thead><tr><th>Región</th><th>Base</th><th>Propuesta</th><th>Cambio</th></tr></thead><tbody>'+regionalRows+'</tbody></table></div><p class="hint">Los totales de las otras regiones corresponden a las ubicaciones disponibles en este mapa.</p><h3 class="review-section-title">Movimientos propuestos · '+moves.length+'</h3>'+details+'<details class="assignment-details"><summary>Distribución por DM en Centro Norte</summary>'+dmRows+'</details>',
      '<button class="secondary" data-action="close-modal">Seguir proponiendo</button><button class="primary" data-action="export-csv">Exportar para Excel</button>');
  }
  function team(){
    const stores=C.current(base,state);
    modal('Un color para cada DM.','Todos los DM del Excel están incluidos. Puedes añadir responsables para probar otro reparto.',
      '<div>'+allDms().map(dm=>'<div class="team-row"><input type="color" value="'+dmColor(dm)+'" data-dm-color="'+e(dm)+'" aria-label="Color de '+e(dm)+'"><div><strong>'+e(C.dmLabel(dm))+'</strong><small>Color de pin en la propuesta</small></div><b>'+stores.filter(s=>s.dm===dm&&s.decision!=='No considerar').length+' tiendas</b></div>').join('')+'</div><div class="add-dm"><input id="newDm" placeholder="Nombre del nuevo DM" maxlength="80" aria-label="Nombre del nuevo DM"><button class="primary" data-action="add-dm">Añadir DM</button></div><div class="note">Las nuevas asignaciones se realizan desde la ficha de una tienda o «Evaluar selección». El color se conserva al exportar el escenario.</div>',
      '<button class="primary" data-action="close-modal">Listo</button>',true);
  }
  function addDm(){const dm=$('newDm').value.trim();if(!dm){toast('Escribe el nombre del DM.');return;}if(allDms().some(x=>C.norm(x)===C.norm(dm))){toast('Este DM ya está disponible.');return;}transact(()=>state.extraDms.push(dm),'DM añadido al escenario.');team();}
  function showExport(){modal('Tu propuesta, lista para continuar.','Exporta el escenario completo o la tabla de decisiones.',
    '<div class="modal-card-grid"><button class="option-card" data-action="export-json"><span>↗</span><strong>Escenario completo · JSON</strong><p>Base, evaluaciones, notas, coordenadas, colores y ajustes de fondo. Conserva una copia completa de la propuesta para revisión o continuidad técnica.</p></button><button class="option-card" data-action="export-csv"><span>▥</span><strong>Decisiones · CSV para Excel</strong><p>Región de origen y destino, tomar / ceder, DM, motivo, aperturas y coordenadas. Una fila por tienda.</p></button></div><div class="note">'+e(state.name)+' · '+base.stores.length+' ubicaciones · '+Object.keys(state.updates).length+' fichas con ajustes. Exporta antes de borrar los datos de tu navegador.</div>',
    '<button class="secondary" data-action="new-scenario">Nueva propuesta</button><button class="secondary" data-action="close-modal">Volver al mapa</button>');}
  function download(content,type,filename){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function filename(suffix){const date=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Mexico_City'});return 'CentroNorte_'+state.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,50)+'_'+date+suffix;}
  function exportJson(){download(JSON.stringify(C.pack(base,state),null,2),'application/json',filename('.json'));toast('Escenario exportado con su base y todos los ajustes.');}
  function exportCsv(){download(C.csv(base,state),'text/csv;charset=utf-8',filename('_decisiones.csv'));toast('Tabla de decisiones exportada para Excel.');}
  function sources(){
    const b=C.balance(base,state),count=r=>base.stores.filter(s=>s.region===r).length;
    modal('Un origen claro para cada decisión.','La región de origen y la región propuesta se mantienen separadas.',
      '<div class="source-list"><div><strong>Fondo cartográfico: zonas geográficas</strong><p>Centro, Norte, Poniente, Sur y Oriente colorean únicamente municipios y alcaldías. Los límites son del Marco Geoestadístico de INEGI, diciembre de 2025. Las zonas son agrupaciones de referencia por orientación, ajustables; no son una regionalización oficial de INEGI.</p></div><div><strong>Regiones internas de Starbucks</strong><p>Centro Norte: '+b.baseCurrent+' tiendas actuales + '+b.baseOpenings+' aperturas. David Carrasco: Bajío, '+count('Bajío')+' tiendas. Mónica Morales (Moni Morales en el Excel): Centro Sur, '+count('Centro Sur')+' tiendas.</p></div><div><strong>Opciones de destino</strong><p>Centro Sur, Centro Norte, Bajío, Centro Centro y Centro Poniente. Las dos últimas quedan disponibles como destinos; la base actual no trae tiendas de esas regiones.</p></div><div><strong>Toreo Walmart · 43302</strong><p>'+e(base.stores.some(s=>s.cc==='43302'&&s.location_verification)?'Ubicación confirmada por el Regional. Las coordenadas del Excel permanecen sin cambios; la diferencia del límite municipal no se trata como un error pendiente.':'Consulta la ficha para revisar la ubicación vigente del Excel.')+'</p></div><div><strong>Fondo y cercanía</strong><p>Límites del Marco Geoestadístico INEGI, diciembre de 2025. El fondo local y los pines funcionan sin calles. Las zonas son referencias geográficas y no determinan la región de una tienda. Las distancias son en línea recta.</p></div><div><strong>Conservar la propuesta</strong><p>Guardado automático en este navegador. Exporta CSV para revisar en Excel o JSON para conservar una copia completa. Los cambios no se convierten en una asignación oficial.</p></div></div>',
      '<button class="primary" data-action="close-modal">Volver al mapa</button>');
  }
  function resetStore(cc){if(!state.updates[cc]){toast('Esta tienda conserva los datos de base.');return;}transact(()=>{delete state.updates[cc];moving=false;},'Evaluación de la tienda restablecida a la base.');}
  function showSelectionMap(){
    $('modal').close();const stores=cachedStores.filter(s=>selected.has(s.cc));if(!stores.length)return;
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
        case 'choose-home':$('storeRegion').value=C.REGION;updateDraftMessage(base.stores.find(s=>s.cc===focus));break;
        case 'choose-away':$('storeRegion').focus();document.querySelector('.proposal-message').textContent='Elige la región que recibiría esta tienda y guarda tu propuesta.';try{if($('storeRegion').showPicker)$('storeRegion').showPicker();}catch(error){}break;
        case 'bulk-home':$('bulkRegion').value=C.REGION;break;
        case 'balance-filter':clearFilters();if(action.dataset.group==='kept'){filter.origin=C.REGION;filter.scope='home';}else {if(action.dataset.group==='incoming')filter.decision='Tomar';else filter.scope='outgoing';}render();fitVisible();break;
        case 'focus-region':$('modal').close();view='proposal';clearFilters();filter.scope='all';filter.origin='';filter.region=action.dataset.region;render();fitVisible();break;
        case 'fit-cartography':fitCartography();break;
        case 'guide':guide();break;
        case 'summary':summary();break;
        case 'focus-dm':$('modal').close();clearFilters();filter.dm=action.dataset.dm;render();fitVisible();break;
        case 'near-focus':case 'compare-focus':if($('modal').open)$('modal').close();if(!visible.some(s=>s.cc===cc)){clearFilters();}focusStore(cc);break;
        case 'close-inspector':closeInspector();break;
        case 'toggle-compare':toggleSelected(cc);break;
        case 'close-modal':$('modal').close();break;
        case 'nearby':nearbyOn=!nearbyOn;renderStoreInspector();renderNearby();break;
        case 'move-pin':moving=!moving;view='proposal';render();if(moving){const s=getStore(focus);map.setView([s.latitude,s.longitude],17,{animate:false});const pt=map.project([s.latitude,s.longitude],17);map.panTo(map.unproject(L.point(pt.x+100,pt.y),17),{animate:false});toast('Arrastra el pin. El cambio se guarda al soltarlo.');}break;
        case 'reset-store':resetStore(cc);break;
        case 'save-area':saveArea();break;
        case 'reset-area':if(areaFocus)transact(()=>delete state.areas[areaFocus],'Fondo de ese municipio restablecido.');break;
        case 'bulk':showBulk();break;
        case 'apply-bulk':applyBulk();break;
        case 'compare':compare();break;
        case 'clear-selection':selected.clear();render();break;
        case 'add-dm':addDm();break;
        case 'export-json':exportJson();break;
        case 'export-csv':exportCsv();break;
        case 'new-scenario':modal('Comenzar otra propuesta.','Se conserva la base de ubicaciones y se reinician las evaluaciones y el fondo.','<div class="note">Puedes exportar el escenario actual antes de empezar. También podrás usar Deshacer durante esta sesión.</div>','<button class="secondary" data-action="export-json">Exportar el actual</button><button class="primary" data-action="confirm-new">Crear propuesta vacía</button>',true);break;
        case 'confirm-new':transact(()=>{state=C.freshState();selected.clear();view='proposal';},'Nueva propuesta lista.');$('modal').close();break;
        case 'show-selection-map':showSelectionMap();break;
      }
    }
    const scopeButton=event.target.closest('[data-scope]');if(scopeButton){filter.scope=scopeButton.dataset.scope;render();fitVisible();}
    const viewButton=event.target.closest('[data-view]');if(viewButton){view=viewButton.dataset.view;moving=false;render();}
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.select){toggleSelected(input.dataset.select);}
    if(input.dataset.dmColor){transact(()=>Object.defineProperty(state.dmColors,input.dataset.dmColor,{value:input.value,enumerable:true,configurable:true,writable:true}),'Color de DM actualizado.');}
  });
  function clearFilters(){Object.keys(filter).forEach(k=>filter[k]='');filter.scope='all';$('search').value='';$('statusFilter').value='';render();}
  $('search').addEventListener('input',ev=>{filter.search=ev.target.value;render();});
  for(const [id,key] of [['regionFilter','origin'],['dmFilter','dm'],['zoneFilter','zone'],['statusFilter','status'],['decisionFilter','decision']])$(id).addEventListener('change',event=>{filter[key]=event.target.value;render();fitVisible();});
  $('sortSelect').addEventListener('change',renderList);
  $('clearFilters').addEventListener('click',()=>{clearFilters();fitVisible();});
  $('selectVisible').addEventListener('change',event=>{visible.forEach(s=>event.target.checked?selected.add(s.cc):selected.delete(s.cc));render();});
  $('scenarioName').addEventListener('change',()=>{const name=$('scenarioName').value.trim()||'Propuesta Centro Norte';transact(()=>state.name=name);});
  $('dmToggle').addEventListener('click',()=>{colorMode=colorMode==='dm'?'regional':'dm';if(colorMode==='regional'){filter.dm='';if($('sortSelect').value==='dm')$('sortSelect').value='cc';}render();});
  $('backgroundBtn').addEventListener('click',openBackground);
  $('fitBtn').addEventListener('click',fitVisible);$('undoBtn').addEventListener('click',undo);$('areaBtn').addEventListener('click',startArea);
  $('guideBtn').addEventListener('click',guide);$('summaryBtn').addEventListener('click',summary);$('teamBtn').addEventListener('click',team);
  $('exportBtn').addEventListener('click',showExport);$('reviewBtn').addEventListener('click',reviewData);$('qualityCard').addEventListener('click',reviewData);$('sourcesBtn').addEventListener('click',sources);
  $('mobileListBtn').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
  $('closeListBtn').addEventListener('click',()=>$('sidebar').classList.remove('open'));
  $('dismissSteps').addEventListener('click',()=>$('mapSteps').classList.add('hidden'));
  document.addEventListener('keydown',event=>{
    const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(event.key==='Escape'){stopArea();if(!$('modal').open){closeInspector();$('sidebar').classList.remove('open');}}
    if(!typing&&event.key==='/'&&!$('modal').open){event.preventDefault();$('sidebar').classList.add('open');$('search').focus();}
    if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo();}
  });
  render();fitVisible();if(scenarioNotice){persist();toast(scenarioNotice);}
})();
