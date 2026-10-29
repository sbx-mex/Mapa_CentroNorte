/* Centro Norte 3.0 · Los cambios son escenarios locales, con base recuperable. */
(() => {
  'use strict';
  const C=window.PlanningCore, geo=window.MAPA_GEO, $=id=>document.getElementById(id), e=C?C.escape:String;
  if(!C || !geo || !window.MAPA_BASE || !window.L) {
    document.body.innerHTML='<p style="padding:30px">No se pudo abrir el mapa. Extrae todo el ZIP y abre index.html dentro de la carpeta completa.</p>';return;
  }
  const STORAGE='centronorte-planning-v3';
  let base=window.MAPA_BASE,state=C.freshState(), view='proposal', colorMode='dm', focus=null, areaFocus=null;
  let inspectorMode=null,selected=new Set(), history=[], nearbyOn=false, moving=false, showBackground=true, showLabels=false,showNeighbors=true, opacity=0.18;
  let areaMode=false,areaStart=null,areaRectangle=null, toastTimer, tileErrors=0;
  let cachedStores=[],visible=[], markers=new Map();
  const filter={search:'',dm:'',zone:'',status:'',decision:''};
  const geoById=new Map(geo.municipalities.features.map(f=>[f.properties.id,f]));
  const STATE_NAMES={'09':'Ciudad de México','13':'Hidalgo','15':'Estado de México','17':'Morelos','21':'Puebla','29':'Tlaxcala','16':'Michoacán','22':'Querétaro'};
  let scenarioNotice='';
  const insights=window.MAPA_INSIGHTS||{status:'missing',errors:['La revisión de datos no está disponible.']};
  const healthy=insights.status==='valid'&&insights.signature===base.metadata.signature;
  try {
    const saved=localStorage.getItem(STORAGE);
    if(saved){
      const loaded=C.readScenario(JSON.parse(saved),base,geo);
      if(C.signature(loaded.base.stores)===C.signature(base.stores))state=loaded.state;
      else {localStorage.setItem(STORAGE+'-respaldo-anterior',saved);scenarioNotice='La base cambió. Se inicia una propuesta nueva y se conserva un respaldo del escenario anterior en este equipo.';}
    }
  }catch(error){scenarioNotice='No se pudo recuperar la propuesta anterior. La base publicada permanece disponible.';}
  $('scenarioName').value=state.name;
  const map=L.map('map',{zoomControl:false,preferCanvas:true,minZoom:6,maxZoom:19}).setView([19.65,-99.12],10);
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
    layer.on('mouseover',()=>{if(inspectorMode==='background')layer.setStyle({weight:2,color:'#375b3a',fillOpacity:Math.min(.6,opacity+.13)});});
    layer.on('mouseout',()=>layer.setStyle(areaStyle(feature)));
    layer.bindTooltip(()=>'<b>'+e(feature.properties.name)+'</b><br>'+e(areaZone(feature.properties)),{sticky:true});
  }}).addTo(map);
  const neighborLayer=L.geoJSON(geo.neighbors,{pane:'regions',style:{color:'#9ba58c',weight:1.1,dashArray:'5 4',fillColor:'#b4b9a5',fillOpacity:.09},onEachFeature:(f,l)=>l.bindTooltip(e(f.properties.name),{sticky:true})}).addTo(map);
  neighborLayer.bringToBack();
  const labelLayer=L.layerGroup().addTo(map), nearLayer=L.layerGroup().addTo(map);
  const cluster=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:zoom=>zoom>=16?9:38,spiderfyOnMaxZoom:true,spiderfyDistanceMultiplier:1.8,zoomToBoundsOnClick:true,animate:false,iconCreateFunction:group=>{
    const children=group.getAllChildMarkers(),counts=new Map();children.forEach(m=>counts.set(m.options.pinColor,(counts.get(m.options.pinColor)||0)+1));
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
  function pinColor(s){return colorMode==='dm'?dmColor(s.dm):C.zoneColors[s.zone];}
  function geoZone(prop){return prop.zone||prop.region;}
  function areaZone(prop){return view==='proposal'?(state.areas[prop.id]||geoZone(prop)):geoZone(prop);}
  function areaStyle(feature){return {color:areaFocus===feature.properties.id&&inspectorMode==='background'?'#1b4f36':'#ffffff',weight:areaFocus===feature.properties.id&&inspectorMode==='background'?2.3:1,fillColor:C.zoneColors[areaZone(feature.properties)],fillOpacity:showBackground?opacity:0,opacity:showBackground?0.88:0.18};}
  function badge(s){const css={'Por evaluar':'review','Conservar':'keep','Reasignar':'move','No considerar':'drop'}[s.decision];return '<span class="badge '+css+'">'+e(s.decision)+'</span>';}
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
    renderFilters();renderList();renderPins();renderLegend();renderDock();renderBackground();renderStats();renderHealth();
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
    document.querySelectorAll('[data-color]').forEach(b=>{b.classList.toggle('active',b.dataset.color===colorMode);b.setAttribute('aria-pressed',String(b.dataset.color===colorMode));});
    $('backgroundBtn').classList.toggle('active',inspectorMode==='background');$('backgroundBtn').setAttribute('aria-pressed',String(inspectorMode==='background'));
    $('undoBtn').disabled=!history.length;
    if(inspectorMode==='store'&&focus)renderStoreInspector();
    else if(inspectorMode==='background')renderBackgroundInspector();
    renderNearby();
  }
  function renderStats(){
    $('scopeSummary').innerHTML='<div class="scope-stat"><strong>'+base.stores.length+'</strong><small>ubicaciones</small></div><div class="scope-stat"><strong>'+allDms().length+'</strong><small>DM disponibles</small></div><div class="scope-stat"><strong>'+base.stores.filter(s=>s.status==='Apertura').length+'</strong><small>aperturas</small></div>';
  }
  function renderHealth(){
    const warnings=insights.warnings||[],count=new Set(warnings.map(w=>w.cc)).size;
    $('reviewBtn').classList.toggle('blocked',!healthy);
    $('healthText').textContent=healthy?'Datos listos · '+base.stores.length:'Revisar base';
    $('qualityCard').classList.toggle('blocked',!healthy);
    $('qualityCard').innerHTML='<span class="quality-icon">'+(healthy?'✓':'!')+'</span><span><strong>'+(healthy?'Base validada para decidir':'Revisión necesaria')+'</strong><small>'+(healthy?base.stores.length+' ubicaciones · Región Centro Norte':'Consulta el detalle antes de continuar')+'</small></span><span class="review-count">'+(healthy?(count?count+' por revisar':'Ver detalle'):'Ver errores')+' ›</span>';
    const done=C.current(base,state).filter(s=>s.decision!=='Por evaluar').length,percent=Math.round(done/base.stores.length*100);
    $('completionMeter').innerHTML='<span><b>'+done+'</b> / '+base.stores.length+' evaluadas</span><div><i style="width:'+percent+'%"></i></div>';
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
    const checklist='<div class="check-grid">'+['CeCo únicos','Coordenadas numéricas','Fechas consistentes','Región Centro Norte'].map(t=>'<span class="'+(healthy?'check-ok':'check-pending')+'">'+(healthy?'✓':'○')+' '+t+'</span>').join('')+'</div>';
    const issues=warnings.map(w=>{const s=base.stores.find(s=>s.cc===w.cc);return '<button class="review-issue" data-action="review-focus" data-cc="'+e(w.cc)+'"><span class="review-issue-icon">!</span><span><strong>'+e(w.cc+' · '+(s?s.store_name:''))+'</strong><small>'+e(w.detail)+'</small></span><b>Ver en mapa ›</b></button>';}).join('');
    const errors=healthy?'':'<div class="error-text">'+e((insights.errors||['La revisión y la base no coinciden. Ejecuta ACTUALIZAR_MAPA.py para revisar la información.']).join('\n'))+'</div>';
    modal(healthy?'Tu información está lista.':'Revisemos la información.','Todas las tiendas pertenecen a Región Centro Norte. Las zonas del mapa sirven como referencia geográfica.',
      errors+cards+checklist+'<div class="review-section-title">'+(warnings.length?'Puntos para validar en el mapa':'Sin puntos pendientes de ubicación')+'</div>'+issues+'<div class="note">'+(healthy?'La estructura de la base es correcta. Los avisos señalan datos de origen que conviene revisar antes de decidir.':'La base anterior se conserva; corrige los errores para recuperar el estado verde.')+' Las aperturas sin fecha se muestran con un rombo +.</div><p class="validation-stamp">Validación de Python'+(date?' · '+e(date):'')+(insights.signature?' · Base '+e(insights.signature.slice(0,8)):'')+'</p>',
      '<button class="secondary" data-action="guide">Cómo usar el mapa</button><button class="secondary" data-action="summary">Ver reparto</button><button class="primary" data-action="close-modal">Ir al mapa</button>');
  }
  function renderFilters(){
    $('dmFilter').innerHTML=options(allDms(),filter.dm,'Todos los DM');
    $('zoneFilter').innerHTML=options(C.zones,filter.zone,'Todas las zonas');
    $('decisionFilter').innerHTML=options(C.decisions,filter.decision,'Todas las decisiones');
    $('filterCount').textContent=visible.length+' de '+base.stores.length+' ubicaciones';
    const selectedVisible=visible.filter(s=>selected.has(s.cc)).length;
    $('selectVisible').checked=!!visible.length&&selectedVisible===visible.length;
    $('selectVisible').indeterminate=selectedVisible>0&&selectedVisible<visible.length;
  }
  function renderList(){
    const sort=$('sortSelect').value;
    const list=[...visible].sort((a,b)=>sort==='cc'?a.cc.localeCompare(b.cc):(a[sort].localeCompare(b[sort],'es')||a.cc.localeCompare(b.cc)));
    $('storeList').innerHTML=list.length?list.map(s=>'<article class="store-row'+(focus===s.cc?' active':'')+(selected.has(s.cc)?' checked':'')+'" data-row="'+s.cc+'"><input type="checkbox" data-select="'+s.cc+'" aria-label="Seleccionar '+e(s.cc+' '+s.store_name)+'"'+(selected.has(s.cc)?' checked':'')+'><button data-action="focus" data-cc="'+s.cc+'" aria-label="Ver '+e(s.store_name)+' en el mapa"><i class="dm-swatch" style="--pin:'+pinColor(s)+'"></i><span class="row-content"><span class="store-meta"><span class="ceco">'+s.cc+'</span>'+(s.status==='Apertura'?'<span class="badge opening">APERTURA</span>':'')+(s.decision!=='Por evaluar'?badge(s):'')+'</span><span class="store-name">'+e(s.store_name)+'</span><span class="store-sub">'+e(s.dm)+' · Zona '+e(s.zone)+'</span></span><span class="row-arrow">›</span></button></article>').join(''):'<div class="empty">No hay tiendas con estos filtros.<br>Usa «Limpiar filtros» para volver al mapa completo.</div>';
  }
  function makeIcon(s){
    const cls=['pin-shell',s.status==='Apertura'?'opening':'',s.decision==='No considerar'?'drop':'',selected.has(s.cc)?'selected':'',focus===s.cc?'focused':''].filter(Boolean).join(' ');
    const content=s.decision==='No considerar'?'×':s.status==='Apertura'?'+':s.decision==='Conservar'?'✓':s.decision==='Reasignar'?'↗':'•';
    return L.divIcon({className:'map-pin',html:'<div class="'+cls+'" style="--pin:'+pinColor(s)+'"><div class="pin-head"><span>'+content+'</span></div></div>',iconSize:[28,34],iconAnchor:[14,31],tooltipAnchor:[0,-29]});
  }
  function renderPins(){
    cluster.clearLayers();markers.clear();const ms=[];
    visible.forEach(s=>{
      const marker=L.marker([s.latitude,s.longitude],{icon:makeIcon(s),title:s.cc+' · '+s.store_name,alt:s.cc+' '+s.store_name,pinColor:pinColor(s),draggable:moving&&s.cc===focus,zIndexOffset:focus===s.cc?1200:0});
      marker.bindTooltip('<b>'+e(s.cc+' · '+s.store_name)+'</b><br>'+e(s.dm)+' · Zona '+e(s.zone)+(s.status==='Apertura'?'<br>Apertura · sin fecha':''));
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
    const keys=colorMode==='dm'?allDms():C.zones;
    const counts=new Map();visible.forEach(s=>{const k=colorMode==='dm'?s.dm:s.zone;counts.set(k,(counts.get(k)||0)+1);});
    $('legend').innerHTML='<div class="legend-title">'+(colorMode==='dm'?'PINES POR DM':'PINES POR ZONA')+' <span>'+visible.length+'</span></div><div class="legend-items">'+keys.map(k=>'<div class="legend-row"><i style="background:'+(colorMode==='dm'?dmColor(k):C.zoneColors[k])+'"></i><span>'+e(k)+'</span><b>'+(counts.get(k)||0)+'</b></div>').join('')+'</div><div class="legend-footer"><span><i class="pin-tiny"></i>Actual</span><span><i class="diamond-tiny"></i>Apertura</span><span>× Fuera</span></div>';
  }
  function renderBackground(){areasLayer.setStyle(areaStyle);if(showNeighbors&&!map.hasLayer(neighborLayer))neighborLayer.addTo(map).bringToBack();if(!showNeighbors&&map.hasLayer(neighborLayer))map.removeLayer(neighborLayer);renderLabels();}
  function renderLabels(){
    labelLayer.clearLayers();
    if(showLabels&&showBackground&&map.getZoom()>=9){
      geo.municipalities.features.forEach(f=>{
        const p=f.properties;
        if(!map.getBounds().intersects([[p.bbox[1],p.bbox[0]],[p.bbox[3],p.bbox[2]]]))return;
        if(map.getZoom()<10 && p.state==='09')return;
        L.marker([p.center[1],p.center[0]],{pane:'labels',interactive:false,icon:L.divIcon({className:'municipal-label',html:e(p.name),iconSize:[100,22],iconAnchor:[50,11]})}).addTo(labelLayer);
      });
    }
  }
  map.on('moveend',()=>{if(showLabels)renderLabels();});
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
    const location=shown||s;
    const liveArea=C.findArea(location.latitude,location.longitude,geo), geomName=liveArea?liveArea.properties.name:'Fuera del fondo disponible';
    const stateMismatch=liveArea&&C.norm(STATE_NAMES[liveArea.properties.state])!==C.norm(s.coverage);
    const geoNotes=stateMismatch?'<div class="alert"><b>Validar ubicación</b><br>Excel: '+e(s.municipality)+' · '+e(s.coverage)+'<br>Coordenada: '+e(geomName)+' · '+e(STATE_NAMES[liveArea.properties.state])+'. Revisa antes de decidir.</div>':'';
    const nearest=closest(location,cachedStores,3);
    $('inspector').innerHTML='<div class="inspector-header"><span class="eyebrow">EVALUAR UBICACIÓN</span><button data-action="close-inspector" aria-label="Cerrar evaluación">×</button></div><div class="inspector-body"><span class="ceco">CECO '+s.cc+'</span><h2>'+e(s.store_name)+'</h2><p class="location-meta">'+e(s.municipality)+' · '+e(s.coverage)+'<br>'+e(dateLabel(s.opening_date))+'</p><div class="detail-tags"><span class="detail-tag">'+e(s.format.replace('_',' '))+'</span><span class="detail-tag">'+e(s.commercial_format)+'</span>'+(s.status==='Apertura'?'<span class="badge opening">APERTURA</span>':'<span class="detail-tag">TIENDA ACTUAL</span>')+'</div>'+geoNotes+'<div class="original-info">Región: <b>Centro Norte</b><br>DM base: <b>'+e(original.dm)+'</b><br>Zona geográfica base: <b>'+e(original.zone)+'</b><br>Municipio por coordenada: <b>'+e(geomName)+'</b></div><form id="storeForm"><div class="form-grid"><label class="full">DM propuesto<select id="storeDm">'+options(allDms(),s.dm)+'</select></label><label>Zona geográfica<select id="storeZone">'+options(C.zones,s.zone)+'</select></label><label>Decisión<select id="storeDecision">'+options(C.decisions,s.decision)+'</select></label><label class="full">Motivo / puntos a validar<textarea id="storeNotes" maxlength="2000" placeholder="Ej. revisar continuidad con el distrito vecino…">'+e(s.notes)+'</textarea></label></div><button class="primary" type="submit">Guardar evaluación</button></form><p class="hint">Los ajustes se guardan en este escenario. La base original permanece disponible en «Base».</p><div class="inline-actions"><button data-action="toggle-compare" data-cc="'+s.cc+'">'+(selected.has(s.cc)?'✓ En selección':'+ Añadir a selección')+'</button><button data-action="move-pin">'+(moving?'Terminar ajuste':'⌖ Ajustar pin')+'</button><button data-action="reset-store" data-cc="'+s.cc+'">Restablecer</button></div>'+(moving?'<div class="area-instruction">Arrastra el pin a su ubicación correcta. Se guarda al soltarlo y puedes usar ↶ para deshacer.</div>':'')+'<p class="hint">'+location.latitude.toFixed(6)+', '+location.longitude.toFixed(6)+(isPositionChanged(location)?' · Coordenada ajustada':' · Coordenada del Excel')+'</p><div class="nearby-heading"><h3>Ubicaciones más cercanas</h3><button data-action="nearby">'+(nearbyOn?'Ocultar líneas':'Ver cercanía')+'</button></div>'+nearest.map(n=>'<button class="nearby-row" data-action="near-focus" data-cc="'+n.cc+'"><i class="dm-swatch" style="--pin:'+dmColor(n.dm)+'"></i><span>'+e(n.store_name)+'<small>'+n.cc+' · '+e(n.dm)+'</small></span><b>'+number(n.km)+' km</b></button>').join('')+'<p class="hint">Distancias en línea recta en la vista '+(view==='base'?'Base':'Propuesta')+'; no representan recorridos ni tiempos. Incluye toda la base.</p></div>';
    $('storeForm').addEventListener('submit',event=>{
      event.preventDefault();const update={...(state.updates[focus]||{}),dm:$('storeDm').value,zone:$('storeZone').value,decision:$('storeDecision').value,notes:$('storeNotes').value.trim()};
      transact(()=>{view='proposal';state.updates[focus]=update;},'Evaluación guardada · '+s.cc+' '+s.store_name);
    });
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
    const stores=p?C.current(base,state).filter(s=>{const f=C.findArea(s.latitude,s.longitude,geo);return f&&f.properties.id===p.id;}):[];
    const selectedArea=p?'<h3>'+e(p.name)+'</h3><p class="location-meta">'+e(STATE_NAMES[p.state])+' · INEGI '+p.id+'</p><div class="area-stats"><div><strong>'+stores.length+'</strong><small>ubicaciones</small></div><div><strong>'+stores.filter(s=>s.status==='Apertura').length+'</strong><small>aperturas</small></div></div><label>Zona de este municipio<select id="areaZone">'+options(C.zones,state.areas[p.id]||geoZone(p))+'</select></label><button class="primary" data-action="save-area">Aplicar color al fondo</button><label class="switch-row"><input id="applyAreaStores" type="checkbox">También asignar esa zona a sus '+stores.length+' tiendas</label><p class="hint">El fondo y la zona de los pines se pueden evaluar por separado. Activa la casilla para cambiar ambos.</p><div class="selected-zone-info">Sugerencia inicial: <b>'+e(geoZone(p))+'</b><br>Propuesta actual: <b>'+e(state.areas[p.id]||geoZone(p))+'</b></div><button class="quiet" data-action="reset-area" style="margin-top:10px;width:100%">Restablecer solo este fondo</button>':'<div class="area-instruction"><b>Selecciona un municipio en el mapa.</b><br>Elige su zona y aplica el color para probar una distribución territorial.</div>';
    $('inspector').innerHTML='<div class="inspector-header"><span class="eyebrow">ZONAS DE REFERENCIA</span><button data-action="close-inspector" aria-label="Cerrar zonas de referencia">×</button></div><div class="inspector-body"><h2>El territorio también<br>se puede ajustar.</h2><p class="location-meta">Límites INEGI · 225 municipios y alcaldías de Edomex, CDMX e Hidalgo.</p><label class="switch-row"><input id="showBackground" type="checkbox"'+(showBackground?' checked':'')+'>Mostrar colores de fondo</label><label>Intensidad de color<div class="opacity-row"><input type="range" id="backgroundOpacity" min="5" max="55" value="'+Math.round(opacity*100)+'"><span id="opacityValue">'+Math.round(opacity*100)+'%</span></div></label><label class="switch-row"><input id="showLabels" type="checkbox"'+(showLabels?' checked':'')+'>Nombres de municipios</label><label class="switch-row"><input id="showNeighbors" type="checkbox"'+(showNeighbors?' checked':'')+'>Entidades vecinas</label><div class="zone-key">'+C.zones.map(r=>'<span><i style="background:'+C.zoneColors[r]+'"></i>'+r+'</span>').join('')+'</div>'+selectedArea+'<div class="note">Las zonas son referencias geográficas editables. Todas las tiendas pertenecen a Región Centro Norte. Cambiar el color del fondo conserva esa región y los límites de INEGI.</div></div>';
    $('showBackground').addEventListener('change',ev=>{showBackground=ev.target.checked;renderBackground();});
    $('showLabels').addEventListener('change',ev=>{showLabels=ev.target.checked;renderLabels();});
    $('showNeighbors').addEventListener('change',ev=>{showNeighbors=ev.target.checked;renderBackground();});
    $('backgroundOpacity').addEventListener('input',ev=>{opacity=Number(ev.target.value)/100;$('opacityValue').textContent=ev.target.value+'%';renderBackground();});
  }
  function saveArea(){
    if(!areaFocus)return;const zone=$('areaZone').value,apply=$('applyAreaStores').checked,id=areaFocus;
    const codes=apply?C.current(base,state).filter(s=>{const f=C.findArea(s.latitude,s.longitude,geo);return f&&f.properties.id===id;}).map(s=>s.cc):[];
    transact(()=>{view='proposal';state.areas[id]=zone;codes.forEach(cc=>state.updates[cc]={...(state.updates[cc]||{}),zone});},'Fondo actualizado'+(apply?' y '+codes.length+(codes.length===1?' tienda asignada a ':' tiendas asignadas a ')+zone:'.'));
  }
  function toggleSelected(cc){selected.has(cc)?selected.delete(cc):selected.add(cc);render();}
  function renderDock(){
    const dock=$('selectionDock');dock.classList.toggle('hidden',!selected.size);
    if(!selected.size)return;
    $('mapSteps').classList.add('hidden');const hidden=[...selected].filter(cc=>!visible.some(s=>s.cc===cc)).length;
    dock.innerHTML='<div class="selection-label"><strong>'+selected.size+'</strong> seleccionadas<small>'+(hidden?hidden+' fuera de los filtros':'Listas para comparar o reasignar')+'</small></div><button class="secondary selection-compare" data-action="compare">Comparar cercanía</button><button class="primary" data-action="bulk">Evaluar selección</button><button class="clear-selection" data-action="clear-selection" aria-label="Limpiar selección">×</button>';
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
    modal('Tres pasos. Una mejor decisión.','Empieza en el listado y realiza los ajustes directamente en el mapa.',
      '<div class="guide-grid guide-three"><div class="guide-card"><span>01</span><h3>Encuentra la tienda</h3><p>Busca por CeCo o filtra por DM. Las aperturas sin fecha tienen un rombo +. Todas las tiendas son de Región Centro Norte.</p></div><div class="guide-card"><span>02</span><h3>Evalúa su entorno</h3><p>Abre la ficha, revisa la ubicación y sus tiendas cercanas. Elige Conservar, Reasignar o No considerar y guarda el motivo.</p></div><div class="guide-card"><span>03</span><h3>Revisa la propuesta</h3><p>Compara Base y Propuesta, consulta Ver reparto y guarda el resumen para Excel. Las casillas permiten evaluar varias tiendas juntas.</p></div></div><div class="note">«Datos listos» muestra la revisión de la base. «Zonas del mapa» ajusta el fondo geográfico sin cambiar Región Centro Norte. Los cambios se guardan en este navegador y puedes exportar una copia.</div>',
      '<button class="primary" data-action="close-modal">Empezar en el mapa</button>');
  }
  function showBulk(){
    if(!selected.size)return;
    const stores=C.current(base,state).filter(s=>selected.has(s.cc));
    modal('Evaluar '+selected.size+' ubicaciones','Estos ajustes se aplicarán a toda tu selección, incluidas las tiendas fuera del filtro.',
      '<div class="form-grid"><label>DM propuesto<select id="bulkDm">'+options(allDms(),'','Sin cambio')+'</select></label><label>Zona geográfica<select id="bulkZone">'+options(C.zones,'','Sin cambio')+'</select></label><label class="full">Decisión<select id="bulkDecision">'+options(C.decisions,'','Sin cambio')+'</select></label><label class="full">Motivo común (opcional)<textarea id="bulkNotes" maxlength="2000" placeholder="Se agregará a las notas existentes de cada tienda."></textarea></label></div><div class="note">'+stores.slice(0,9).map(s=>e(s.cc+' '+s.store_name)).join(' · ')+(stores.length>9?' · y '+(stores.length-9)+' más':'')+'</div>',
      '<button class="secondary" data-action="close-modal">Volver al mapa</button>'+(selected.size>1?'<button class="secondary" data-action="compare">Comparar cercanía</button>':'')+'<button class="primary" data-action="apply-bulk">Guardar en la propuesta</button>',true);
  }
  function applyBulk(){
    const dm=$('bulkDm').value,zone=$('bulkZone').value,decision=$('bulkDecision').value,notes=$('bulkNotes').value.trim();
    if(!dm&&!zone&&!decision&&!notes){toast('Elige al menos un ajuste para guardar.');return;}
    transact(()=>{view='proposal';selected.forEach(cc=>{const u={...(state.updates[cc]||{})};if(dm)u.dm=dm;if(zone)u.zone=zone;if(decision)u.decision=decision;if(notes)u.notes=((u.notes?u.notes+'\n':'')+notes).slice(0,2000);state.updates[cc]=u;});},selected.size+' evaluaciones guardadas.');$('modal').close();
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
    const proposed=C.current(base,state),kept=proposed.filter(s=>s.decision!=='No considerar');
    const changed=proposed.filter(s=>s.dm!==base.stores.find(b=>b.cc===s.cc).dm).length;
    const largest=Math.max(1,...allDms().map(dm=>Math.max(base.stores.filter(s=>s.dm===dm).length,kept.filter(s=>s.dm===dm).length)));
    const cards=allDms().map(dm=>{
      const original=base.stores.filter(s=>s.dm===dm).length,current=kept.filter(s=>s.dm===dm).length,delta=current-original,info=(insights.dms||[]).find(x=>x.dm===dm);
      return '<button class="balance-card" data-action="focus-dm" data-dm="'+e(dm)+'"><span class="balance-title"><i style="background:'+dmColor(dm)+'"></i><strong>'+e(dm)+'</strong><b>'+(delta>0?'+':'')+delta+'</b></span><span class="balance-line"><small>Base</small><i><em style="width:'+original/largest*100+'%"></em></i><b>'+original+'</b></span><span class="balance-line proposed"><small>Propuesta</small><i><em style="width:'+current/largest*100+'%;background:'+dmColor(dm)+'"></em></i><b>'+current+'</b></span><span class="balance-detail">'+(info?'Extensión base: '+number(info.span_km)+' km':'Nuevo DM en la propuesta')+'<span>Ver tiendas ›</span></span></button>';
    }).join('');
    modal('Un reparto que puedes comparar.','Todas las tiendas son Región Centro Norte. Selecciona un DM para ver sus ubicaciones en el mapa.',
      '<div class="comparison-stats"><div><b>'+kept.length+'</b><small>EN LA PROPUESTA</small></div><div><b>'+proposed.filter(s=>s.decision==='No considerar').length+'</b><small>NO CONSIDERAR</small></div><div><b>'+changed+'</b><small>CAMBIOS DE DM</small></div><div><b>'+proposed.filter(s=>s.decision==='Por evaluar').length+'</b><small>POR EVALUAR</small></div></div><div class="balance-grid">'+cards+'</div><div class="note">El reparto propuesto excluye «No considerar». La extensión base es la distancia máxima en línea recta entre las tiendas de cada DM, calculada por Python; sirve como referencia geográfica y no como tiempo de traslado.</div>',
      '<button class="secondary" data-action="close-modal">Volver al mapa</button><button class="primary" data-action="export-csv">Guardar resumen para Excel</button>');
  }
  function team(){
    const stores=C.current(base,state);
    modal('Un color para cada DM.','Los ocho DM del Excel están incluidos. Puedes añadir responsables para probar otro reparto.',
      '<div>'+allDms().map(dm=>'<div class="team-row"><input type="color" value="'+dmColor(dm)+'" data-dm-color="'+e(dm)+'" aria-label="Color de '+e(dm)+'"><div><strong>'+e(dm)+'</strong><small>Color de pin en la propuesta</small></div><b>'+stores.filter(s=>s.dm===dm&&s.decision!=='No considerar').length+' tiendas</b></div>').join('')+'</div><div class="add-dm"><input id="newDm" placeholder="Nombre del nuevo DM" maxlength="80" aria-label="Nombre del nuevo DM"><button class="primary" data-action="add-dm">Añadir DM</button></div><div class="note">Las nuevas asignaciones se realizan desde la ficha de una tienda o «Evaluar selección». El color se conserva al exportar el escenario.</div>',
      '<button class="primary" data-action="close-modal">Listo</button>',true);
  }
  function addDm(){const dm=$('newDm').value.trim();if(!dm){toast('Escribe el nombre del DM.');return;}if(allDms().some(x=>C.norm(x)===C.norm(dm))){toast('Este DM ya está disponible.');return;}transact(()=>state.extraDms.push(dm),'DM añadido al escenario.');team();}
  function showExport(){modal('Tu propuesta, lista para continuar.','Exporta el escenario completo o la tabla de decisiones.',
    '<div class="modal-card-grid"><button class="option-card" data-action="export-json"><span>↗</span><strong>Escenario completo · JSON</strong><p>Base, evaluaciones, notas, coordenadas, colores y ajustes de fondo. Conserva una copia completa de la propuesta para revisión o continuidad técnica.</p></button><button class="option-card" data-action="export-csv"><span>▥</span><strong>Decisiones · CSV para Excel</strong><p>Una fila por tienda con DM y zona de base y propuesta, decisión, motivo y coordenadas.</p></button></div><div class="note">'+e(state.name)+' · '+base.stores.length+' ubicaciones · '+Object.keys(state.updates).length+' fichas con ajustes. Exporta antes de borrar los datos de tu navegador.</div>',
    '<button class="secondary" data-action="new-scenario">Nueva propuesta</button><button class="secondary" data-action="close-modal">Volver al mapa</button>');}
  function download(content,type,filename){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function filename(suffix){const date=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Mexico_City'});return 'CentroNorte_'+state.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,50)+'_'+date+suffix;}
  function exportJson(){download(JSON.stringify(C.pack(base,state),null,2),'application/json',filename('.json'));toast('Escenario exportado con su base y todos los ajustes.');}
  function exportCsv(){download(C.csv(base,state),'text/csv;charset=utf-8',filename('_decisiones.csv'));toast('Tabla de decisiones exportada para Excel.');}
  function sources(){
    modal('Región y zona: una referencia clara.','El mapa conserva una sola región comercial: Centro Norte.',
      '<div class="source-list"><div><strong>Región Centro Norte</strong><p>Todas las tiendas de la base pertenecen a esta región. Cambiar DM, zona o color no cambia la región.</p></div><div><strong>Zonas geográficas de referencia</strong><p>Norte, Poniente, Centro, Oriente y Sur describen la orientación del fondo. Son editables y no representan otras regiones comerciales.</p></div><div><strong>Límites y mapa base</strong><p>Límites del Marco Geoestadístico INEGI, diciembre de 2025. El fondo local permanece al perder conexión; las calles requieren el servicio de mapas de INEGI.<br><a href="https://www.inegi.org.mx/servicios/catalogounico.html" target="_blank" rel="noopener">Consultar fuente INEGI ↗</a></p></div><div><strong>Cercanía y decisiones</strong><p>Distancia Haversine en línea recta, validada por Python para la base. Si ajustas un pin, la propuesta recalcula las distancias. No son tiempos ni rutas de traslado.</p></div><div><strong>Información futura</strong><p>El responsable actualiza el Excel del proyecto y ejecuta ACTUALIZAR_MAPA.py. La revisión comprueba la información antes de publicar la vista. La navegación no requiere subir archivos.</p></div></div>',
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
        case 'review-focus':$('modal').close();clearFilters();focusStore(cc);break;
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
    const viewButton=event.target.closest('[data-view]');if(viewButton){view=viewButton.dataset.view;moving=false;render();}
    const colorButton=event.target.closest('[data-color]');if(colorButton){colorMode=colorButton.dataset.color;render();}
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.select){toggleSelected(input.dataset.select);}
    if(input.dataset.dmColor){transact(()=>Object.defineProperty(state.dmColors,input.dataset.dmColor,{value:input.value,enumerable:true,configurable:true,writable:true}),'Color de DM actualizado.');}
  });
  function clearFilters(){Object.keys(filter).forEach(k=>filter[k]='');$('search').value='';$('statusFilter').value='';render();}
  $('search').addEventListener('input',ev=>{filter.search=ev.target.value;render();});
  for(const [id,key] of [['dmFilter','dm'],['zoneFilter','zone'],['statusFilter','status'],['decisionFilter','decision']])$(id).addEventListener('change',event=>{filter[key]=event.target.value;render();fitVisible();});
  $('sortSelect').addEventListener('change',renderList);
  $('clearFilters').addEventListener('click',()=>{clearFilters();fitVisible();});
  $('selectVisible').addEventListener('change',event=>{visible.forEach(s=>event.target.checked?selected.add(s.cc):selected.delete(s.cc));render();});
  $('scenarioName').addEventListener('change',()=>{const name=$('scenarioName').value.trim()||'Propuesta Centro Norte';transact(()=>state.name=name);});
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
