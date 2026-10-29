/* Centro Norte 3.0 · Los cambios son escenarios locales, con base recuperable. */
(() => {
  'use strict';
  const C=window.PlanningCore, geo=window.MAPA_GEO, $=id=>document.getElementById(id), e=C.escape;
  if(!C || !geo || !window.MAPA_BASE || !window.L) {
    document.body.innerHTML='<p style="padding:30px">No se pudo abrir el mapa. Extrae todo el ZIP y abre index.html dentro de la carpeta completa.</p>';return;
  }
  const STORAGE='centronorte-planning-v3';
  let base=window.MAPA_BASE,state=C.freshState(), view='proposal', colorMode='dm', focus=null, areaFocus=null;
  let inspectorMode=null,selected=new Set(), history=[], nearbyOn=false, moving=false, showBackground=true, showLabels=false,showNeighbors=true, opacity=0.18;
  let areaMode=false,areaStart=null,areaRectangle=null, toastTimer, pendingImport=null, tileErrors=0, pendingExcel=null;
  let cachedStores=[],visible=[], markers=new Map();
  const filter={search:'',dm:'',region:'',status:'',decision:''};
  const geoById=new Map(geo.municipalities.features.map(f=>[f.properties.id,f]));
  const STATE_NAMES={'09':'Ciudad de México','13':'Hidalgo','15':'Estado de México','17':'Morelos','21':'Puebla','29':'Tlaxcala','16':'Michoacán','22':'Querétaro'};
  try {
    const saved=localStorage.getItem(STORAGE);
    if(saved){const loaded=C.readScenario(JSON.parse(saved),base,geo);base=loaded.base;state=loaded.state;}
  }catch(error){$('saveState').textContent='Escenario previo no disponible · usa Cargar';}
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
    layer.bindTooltip(()=>'<b>'+e(feature.properties.name)+'</b><br>'+e(areaRegion(feature.properties)),{sticky:true});
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
  function pinColor(s){return colorMode==='dm'?dmColor(s.dm):C.regionColors[s.region];}
  function areaRegion(prop){return view==='proposal'?(state.areas[prop.id]||prop.region):prop.region;}
  function areaStyle(feature){return {color:areaFocus===feature.properties.id&&inspectorMode==='background'?'#1b4f36':'#ffffff',weight:areaFocus===feature.properties.id&&inspectorMode==='background'?2.3:1,fillColor:C.regionColors[areaRegion(feature.properties)],fillOpacity:showBackground?opacity:0,opacity:showBackground?0.88:0.18};}
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
    renderFilters();renderList();renderPins();renderLegend();renderDock();renderBackground();renderStats();
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
  function renderFilters(){
    $('dmFilter').innerHTML=options(allDms(),filter.dm,'Todos los DM');
    $('regionFilter').innerHTML=options(C.regions,filter.region,'Todas las regiones');
    $('decisionFilter').innerHTML=options(C.decisions,filter.decision,'Todas las decisiones');
    $('filterCount').textContent=visible.length+' de '+base.stores.length+' ubicaciones';
    const selectedVisible=visible.filter(s=>selected.has(s.cc)).length;
    $('selectVisible').checked=!!visible.length&&selectedVisible===visible.length;
    $('selectVisible').indeterminate=selectedVisible>0&&selectedVisible<visible.length;
  }
  function renderList(){
    const sort=$('sortSelect').value;
    const list=[...visible].sort((a,b)=>sort==='cc'?a.cc.localeCompare(b.cc):(a[sort].localeCompare(b[sort],'es')||a.cc.localeCompare(b.cc)));
    $('storeList').innerHTML=list.length?list.map(s=>'<article class="store-row'+(focus===s.cc?' active':'')+(selected.has(s.cc)?' checked':'')+'" data-row="'+s.cc+'"><input type="checkbox" data-select="'+s.cc+'" aria-label="Seleccionar '+e(s.cc+' '+s.store_name)+'"'+(selected.has(s.cc)?' checked':'')+'><button data-action="focus" data-cc="'+s.cc+'" aria-label="Ver '+e(s.store_name)+' en el mapa"><i class="dm-swatch" style="--pin:'+pinColor(s)+'"></i><span class="row-content"><span class="store-meta"><span class="ceco">'+s.cc+'</span>'+(s.status==='Apertura'?'<span class="badge opening">APERTURA</span>':'')+(s.decision!=='Por evaluar'?badge(s):'')+'</span><span class="store-name">'+e(s.store_name)+'</span><span class="store-sub">'+e(s.dm)+' · '+e(s.region)+'</span></span><span class="row-arrow">›</span></button></article>').join(''):'<div class="empty">No hay tiendas con estos filtros.<br>Usa «Limpiar filtros» para volver al mapa completo.</div>';
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
      marker.bindTooltip('<b>'+e(s.cc+' · '+s.store_name)+'</b><br>'+e(s.dm)+' · '+e(s.region)+(s.status==='Apertura'?'<br>Apertura · sin fecha':''));
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
    const keys=colorMode==='dm'?allDms():C.regions;
    const counts=new Map();visible.forEach(s=>{const k=colorMode==='dm'?s.dm:s.region;counts.set(k,(counts.get(k)||0)+1);});
    $('legend').innerHTML='<div class="legend-title">'+(colorMode==='dm'?'PINES POR DM':'PINES POR REGIÓN')+' <span>'+visible.length+'</span></div><div class="legend-items">'+keys.map(k=>'<div class="legend-row"><i style="background:'+(colorMode==='dm'?dmColor(k):C.regionColors[k])+'"></i><span>'+e(k)+'</span><b>'+(counts.get(k)||0)+'</b></div>').join('')+'</div><div class="legend-footer"><span><i class="pin-tiny"></i>Actual</span><span><i class="diamond-tiny"></i>Apertura</span><span>× Fuera</span></div>';
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
    map.fitBounds(L.latLngBounds(visible.map(s=>[s.latitude,s.longitude])),{paddingTopLeft:[65,120],paddingBottomRight:[Math.min(right,map.getSize().x*.35),110],maxZoom:14,animate:false});
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
    const liveArea=C.findArea(s.latitude,s.longitude,geo), geomName=liveArea?liveArea.properties.name:'Fuera del fondo disponible';
    const stateMismatch=liveArea&&C.norm(STATE_NAMES[liveArea.properties.state])!==C.norm(s.coverage);
    const geoNotes=stateMismatch?'<div class="alert"><b>Validar ubicación</b><br>Excel: '+e(s.municipality)+' · '+e(s.coverage)+'<br>Coordenada: '+e(geomName)+' · '+e(STATE_NAMES[liveArea.properties.state])+'. Revisa antes de decidir.</div>':'';
    const nearest=C.nearest(s,C.current(base,state),3);
    $('inspector').innerHTML='<div class="inspector-header"><span class="eyebrow">EVALUAR UBICACIÓN</span><button data-action="close-inspector" aria-label="Cerrar evaluación">×</button></div><div class="inspector-body"><span class="ceco">CECO '+s.cc+'</span><h2>'+e(s.store_name)+'</h2><p class="location-meta">'+e(s.municipality)+' · '+e(s.coverage)+'<br>'+e(dateLabel(s.opening_date))+'</p><div class="detail-tags"><span class="detail-tag">'+e(s.format.replace('_',' '))+'</span><span class="detail-tag">'+e(s.commercial_format)+'</span>'+(s.status==='Apertura'?'<span class="badge opening">APERTURA</span>':'<span class="detail-tag">TIENDA ACTUAL</span>')+'</div>'+geoNotes+'<div class="original-info">DM base: <b>'+e(original.dm)+'</b><br>Región sugerida: <b>'+e(original.region)+'</b><br>Municipio por coordenada: <b>'+e(geomName)+'</b></div><form id="storeForm"><div class="form-grid"><label class="full">DM propuesto<select id="storeDm">'+options(allDms(),s.dm)+'</select></label><label>Región propuesta<select id="storeRegion">'+options(C.regions,s.region)+'</select></label><label>Decisión<select id="storeDecision">'+options(C.decisions,s.decision)+'</select></label><label class="full">Motivo / puntos a validar<textarea id="storeNotes" maxlength="2000" placeholder="Ej. revisar continuidad con el distrito vecino…">'+e(s.notes)+'</textarea></label></div><button class="primary" type="submit">Guardar evaluación</button></form><p class="hint">Los ajustes se guardan en este escenario. La base original permanece disponible en «Base».</p><div class="inline-actions"><button data-action="toggle-compare" data-cc="'+s.cc+'">'+(selected.has(s.cc)?'✓ En selección':'+ Añadir a selección')+'</button><button data-action="move-pin">'+(moving?'Terminar ajuste':'⌖ Ajustar pin')+'</button><button data-action="reset-store" data-cc="'+s.cc+'">Restablecer</button></div>'+(moving?'<div class="area-instruction">Arrastra el pin a su ubicación correcta. Se guarda al soltarlo y puedes usar ↶ para deshacer.</div>':'')+'<p class="hint">'+s.latitude.toFixed(6)+', '+s.longitude.toFixed(6)+(isPositionChanged(s)?' · Coordenada ajustada':' · Coordenada del Excel')+'</p><div class="nearby-heading"><h3>Ubicaciones más cercanas</h3><button data-action="nearby">'+(nearbyOn?'Ocultar líneas':'Ver cercanía')+'</button></div>'+nearest.map(n=>'<button class="nearby-row" data-action="near-focus" data-cc="'+n.cc+'"><i class="dm-swatch" style="--pin:'+dmColor(n.dm)+'"></i><span>'+e(n.store_name)+'<small>'+n.cc+' · '+e(n.dm)+'</small></span><b>'+number(n.km)+' km</b></button>').join('')+'<p class="hint">Distancias en línea recta entre coordenadas de la propuesta; no representan recorridos ni tiempos. Incluye toda la base.</p></div>';
    $('storeForm').addEventListener('submit',event=>{
      event.preventDefault();const update={...(state.updates[focus]||{}),dm:$('storeDm').value,region:$('storeRegion').value,decision:$('storeDecision').value,notes:$('storeNotes').value.trim()};
      transact(()=>{view='proposal';state.updates[focus]=update;},'Evaluación guardada · '+s.cc+' '+s.store_name);
    });
  }
  function renderNearby(){
    nearLayer.clearLayers();if(!nearbyOn||!focus||inspectorMode!=='store')return;
    const s=getStore(focus);if(!s)return;
    L.circle([s.latitude,s.longitude],{radius:3000,color:'#3d7950',fillColor:'#7ca46b',fillOpacity:.055,weight:1,dashArray:'5 5',interactive:false}).bindTooltip('Radio de referencia: 3 km').addTo(nearLayer);
    C.nearest(s,cachedStores,3).forEach(n=>L.polyline([[s.latitude,s.longitude],[n.latitude,n.longitude]],{color:'#315e48',weight:1.5,dashArray:'5 7',opacity:.8,interactive:false}).addTo(nearLayer));
  }
  function closeInspector(){setInspector(null);moving=false;focus=null;areaFocus=null;render();$('mapStatus').lastElementChild.textContent='Explora el mapa o selecciona una tienda';}

  function openBackground(){moving=false;focus=null;setInspector(inspectorMode==='background'?null:'background');render();}
  function renderBackgroundInspector(){
    const feature=geoById.get(areaFocus),p=feature&&feature.properties;
    const stores=p?C.current(base,state).filter(s=>{const f=C.findArea(s.latitude,s.longitude,geo);return f&&f.properties.id===p.id;}):[];
    const selectedArea=p?'<h3>'+e(p.name)+'</h3><p class="location-meta">'+e(STATE_NAMES[p.state])+' · INEGI '+p.id+'</p><div class="area-stats"><div><strong>'+stores.length+'</strong><small>ubicaciones</small></div><div><strong>'+stores.filter(s=>s.status==='Apertura').length+'</strong><small>aperturas</small></div></div><label>Región propuesta de este municipio<select id="areaRegion">'+options(C.regions,state.areas[p.id]||p.region)+'</select></label><button class="primary" data-action="save-area">Aplicar color al fondo</button><label class="switch-row"><input id="applyAreaStores" type="checkbox">También asignar esa región a sus '+stores.length+' tiendas</label><p class="hint">El fondo y la región de los pines se pueden evaluar por separado. Activa la casilla para cambiar ambos.</p><div class="selected-region-info">Sugerencia inicial: <b>'+e(p.region)+'</b><br>Propuesta actual: <b>'+e(state.areas[p.id]||p.region)+'</b></div><button class="quiet" data-action="reset-area" style="margin-top:10px;width:100%">Restablecer solo este fondo</button>':'<div class="area-instruction"><b>Selecciona un municipio en el mapa.</b><br>Elige su región y aplica el color para probar una distribución territorial.</div>';
    $('inspector').innerHTML='<div class="inspector-header"><span class="eyebrow">EVALUAR FONDO REGIONAL</span><button data-action="close-inspector" aria-label="Cerrar fondo regional">×</button></div><div class="inspector-body"><h2>El territorio también<br>se puede ajustar.</h2><p class="location-meta">Límites INEGI · 225 municipios y alcaldías de Edomex, CDMX e Hidalgo.</p><label class="switch-row"><input id="showBackground" type="checkbox"'+(showBackground?' checked':'')+'>Mostrar colores de fondo</label><label>Intensidad de color<div class="opacity-row"><input type="range" id="backgroundOpacity" min="5" max="55" value="'+Math.round(opacity*100)+'"><span id="opacityValue">'+Math.round(opacity*100)+'%</span></div></label><label class="switch-row"><input id="showLabels" type="checkbox"'+(showLabels?' checked':'')+'>Nombres de municipios</label><label class="switch-row"><input id="showNeighbors" type="checkbox"'+(showNeighbors?' checked':'')+'>Entidades vecinas</label><div class="region-key">'+C.regions.map(r=>'<span><i style="background:'+C.regionColors[r]+'"></i>'+r+'</span>').join('')+'</div>'+selectedArea+'<div class="note">Las cinco regiones son una propuesta visual por orientación geográfica. INEGI aporta los límites, no las asignaciones comerciales. Los cambios de color agrupan municipios; sus límites se conservan.</div></div>';
    $('showBackground').addEventListener('change',ev=>{showBackground=ev.target.checked;renderBackground();});
    $('showLabels').addEventListener('change',ev=>{showLabels=ev.target.checked;renderLabels();});
    $('showNeighbors').addEventListener('change',ev=>{showNeighbors=ev.target.checked;renderBackground();});
    $('backgroundOpacity').addEventListener('input',ev=>{opacity=Number(ev.target.value)/100;$('opacityValue').textContent=ev.target.value+'%';renderBackground();});
  }
  function saveArea(){
    if(!areaFocus)return;const region=$('areaRegion').value,apply=$('applyAreaStores').checked,id=areaFocus;
    const codes=apply?C.current(base,state).filter(s=>{const f=C.findArea(s.latitude,s.longitude,geo);return f&&f.properties.id===id;}).map(s=>s.cc):[];
    transact(()=>{view='proposal';state.areas[id]=region;codes.forEach(cc=>state.updates[cc]={...(state.updates[cc]||{}),region});},'Fondo actualizado'+(apply?' y '+codes.length+(codes.length===1?' tienda asignada a ':' tiendas asignadas a ')+region:'.'));
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
    modal('Del mapa a la decisión.','Un espacio para que Regional evalúe, ajuste y compare ubicaciones.',
      '<div class="guide-grid"><div class="guide-card"><span>01</span><h3>Encuentra tu punto de partida</h3><p>Filtra por DM, región o CeCo. Elige una tienda desde el listado o desde su pin. Los rombos con + son aperturas sin fecha.</p></div><div class="guide-card"><span>02</span><h3>Evalúa donde sucede</h3><p>Revisa su ubicación y las tiendas cercanas. Define Conservar, Reasignar o No considerar, cambia DM o región y escribe el motivo.</p></div><div class="guide-card"><span>03</span><h3>Dibuja una mejor distribución</h3><p>En «Evaluar fondo», toca un municipio y cambia su región. Usa «Por DM» o «Por región» para cambiar los pines. Marca varias tiendas para moverlas juntas.</p></div><div class="guide-card"><span>04</span><h3>Compara y lleva tu propuesta</h3><p>Alterna Base y Propuesta. En «Ver reparto» compara las asignaciones. Exporta el escenario JSON para continuar o el CSV para revisar en Excel.</p></div></div><div class="note">«No considerar» deja la tienda visible con × y la excluye del reparto propuesto. Los cambios se guardan en este navegador. Para compartirlos, exporta y envía el escenario; cada equipo debe cargarlo.</div>',
      '<button class="primary" data-action="close-modal">Empezar a explorar</button>');
  }
  function showBulk(){
    if(!selected.size)return;
    const stores=C.current(base,state).filter(s=>selected.has(s.cc));
    modal('Evaluar '+selected.size+' ubicaciones','Estos ajustes se aplicarán a toda tu selección, incluidas las tiendas fuera del filtro.',
      '<div class="form-grid"><label>DM propuesto<select id="bulkDm">'+options(allDms(),'','Sin cambio')+'</select></label><label>Región propuesta<select id="bulkRegion">'+options(C.regions,'','Sin cambio')+'</select></label><label class="full">Decisión<select id="bulkDecision">'+options(C.decisions,'','Sin cambio')+'</select></label><label class="full">Motivo común (opcional)<textarea id="bulkNotes" maxlength="2000" placeholder="Se agregará a las notas existentes de cada tienda."></textarea></label></div><div class="note">'+stores.slice(0,9).map(s=>e(s.cc+' '+s.store_name)).join(' · ')+(stores.length>9?' · y '+(stores.length-9)+' más':'')+'</div>',
      '<button class="secondary" data-action="close-modal">Volver al mapa</button>'+(selected.size>1?'<button class="secondary" data-action="compare">Comparar cercanía</button>':'')+'<button class="primary" data-action="apply-bulk">Guardar en la propuesta</button>',true);
  }
  function applyBulk(){
    const dm=$('bulkDm').value,region=$('bulkRegion').value,decision=$('bulkDecision').value,notes=$('bulkNotes').value.trim();
    if(!dm&&!region&&!decision&&!notes){toast('Elige al menos un ajuste para guardar.');return;}
    transact(()=>{view='proposal';selected.forEach(cc=>{const u={...(state.updates[cc]||{})};if(dm)u.dm=dm;if(region)u.region=region;if(decision)u.decision=decision;if(notes)u.notes=((u.notes?u.notes+'\n':'')+notes).slice(0,2000);state.updates[cc]=u;});},selected.size+' evaluaciones guardadas.');$('modal').close();
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
    modal('Así se mueve tu territorio.','Reparto de la base y de la propuesta. «No considerar» se excluye solo del reparto propuesto.',
      '<div class="comparison-stats"><div><b>'+kept.length+'</b><small>EN LA PROPUESTA</small></div><div><b>'+proposed.filter(s=>s.decision==='No considerar').length+'</b><small>NO CONSIDERAR</small></div><div><b>'+changed+'</b><small>CAMBIOS DE DM</small></div><div><b>'+proposed.filter(s=>s.decision==='Por evaluar').length+'</b><small>POR EVALUAR</small></div></div><div class="table-wrap"><table><thead><tr><th>DM</th><th>Base</th><th>Propuesta</th><th>Cambio neto</th><th>Aperturas incluidas</th></tr></thead><tbody>'+allDms().map(dm=>{const b=base.stores.filter(s=>s.dm===dm).length,p=kept.filter(s=>s.dm===dm).length;return '<tr><td><i style="background:'+dmColor(dm)+'"></i>'+e(dm)+'</td><td>'+b+'</td><td><b>'+p+'</b></td><td class="delta">'+(p-b>0?'+':'')+(p-b)+'</td><td>'+kept.filter(s=>s.dm===dm&&s.status==='Apertura').length+'</td></tr>';}).join('')+'</tbody></table></div><div class="note">Conservar: '+proposed.filter(s=>s.decision==='Conservar').length+' · Reasignar: '+proposed.filter(s=>s.decision==='Reasignar').length+' · Fondo ajustado: '+Object.keys(state.areas).length+' municipios. Los números incluyen tiendas actuales y aperturas.</div>',
      '<button class="secondary" data-action="close-modal">Volver al mapa</button><button class="primary" data-action="export-csv">Descargar decisiones CSV</button>');
  }
  function team(){
    const stores=C.current(base,state);
    modal('Un color para cada DM.','Los ocho DM del Excel están incluidos. Puedes añadir responsables para probar otro reparto.',
      '<div>'+allDms().map(dm=>'<div class="team-row"><input type="color" value="'+dmColor(dm)+'" data-dm-color="'+e(dm)+'" aria-label="Color de '+e(dm)+'"><div><strong>'+e(dm)+'</strong><small>Color de pin en la propuesta</small></div><b>'+stores.filter(s=>s.dm===dm&&s.decision!=='No considerar').length+' tiendas</b></div>').join('')+'</div><div class="add-dm"><input id="newDm" placeholder="Nombre del nuevo DM" maxlength="80" aria-label="Nombre del nuevo DM"><button class="primary" data-action="add-dm">Añadir DM</button></div><div class="note">Las nuevas asignaciones se realizan desde la ficha de una tienda o «Evaluar selección». El color se conserva al exportar el escenario.</div>',
      '<button class="primary" data-action="close-modal">Listo</button>',true);
  }
  function addDm(){const dm=$('newDm').value.trim();if(!dm){toast('Escribe el nombre del DM.');return;}if(allDms().some(x=>C.norm(x)===C.norm(dm))){toast('Este DM ya está disponible.');return;}transact(()=>state.extraDms.push(dm),'DM añadido al escenario.');team();}
  function showExport(){modal('Tu propuesta, lista para continuar.','Exporta el escenario completo o la tabla de decisiones.',
    '<div class="modal-card-grid"><button class="option-card" data-action="export-json"><span>↗</span><strong>Escenario completo · JSON</strong><p>Base, evaluaciones, notas, coordenadas, colores y ajustes de fondo. Se vuelve a cargar en este mapa, incluso en otro equipo.</p></button><button class="option-card" data-action="export-csv"><span>▥</span><strong>Decisiones · CSV para Excel</strong><p>Una fila por tienda con DM y región de base y propuesta, decisión, motivo y coordenadas.</p></button></div><div class="note">'+e(state.name)+' · '+base.stores.length+' ubicaciones · '+Object.keys(state.updates).length+' fichas con ajustes. Exporta antes de borrar los datos de tu navegador.</div>',
    '<button class="secondary" data-action="new-scenario">Nueva propuesta</button><button class="secondary" data-action="close-modal">Volver al mapa</button>');}
  function showImport(){modal('Retoma o actualiza tu mesa.','Todo se procesa en este equipo. La carga se revisa antes de reemplazar tu escenario.',
    '<div class="modal-card-grid"><button class="option-card" data-action="load-scenario"><span>↙</span><strong>Cargar escenario · JSON</strong><p>Recupera una propuesta exportada, con su base y sus ajustes.</p></button><button class="option-card" data-action="load-excel"><span>▥</span><strong>Cargar ubicaciones · Excel</strong><p>Lee la hoja «Ubicaciones» del CMS. No necesita indicadores. Las filas sin fecha se muestran como aperturas.</p></button></div><div class="note">Si ya tienes decisiones, exporta tu escenario antes de sustituirlo.</div>',
    '<button class="secondary" data-action="close-modal">Volver al mapa</button>');}
  function download(content,type,filename){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function filename(suffix){const date=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Mexico_City'});return 'CentroNorte_'+state.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,50)+'_'+date+suffix;}
  function exportJson(){download(JSON.stringify(C.pack(base,state),null,2),'application/json',filename('.json'));toast('Escenario exportado con su base y todos los ajustes.');}
  function exportCsv(){download(C.csv(base,state),'text/csv;charset=utf-8',filename('_decisiones.csv'));toast('Tabla de decisiones exportada para Excel.');}
  function sources(){
    modal('Un fondo con contexto.','Cartografía de referencia y reglas que utiliza este mapa.',
      '<div class="source-list"><div><strong>Ubicaciones · tu Excel</strong><p>Mapa_CentroNorte_CMS(2).xlsx: 103 tiendas, ocho DM y tres aperturas sin fecha. Se normalizaron tres latitudes con una coma final. El municipio del Excel se conserva y se muestra junto al que corresponde a la coordenada.</p></div><div><strong>Límites · INEGI</strong><p>Marco Geoestadístico, diciembre de 2025, según metadatos del servicio. 125 municipios del Estado de México, 16 alcaldías de CDMX y 84 municipios de Hidalgo. Se incluyen contornos de Morelos, Puebla, Tlaxcala, Michoacán y Querétaro. Geometría simplificada para visualización en WGS84.<br><a href="https://www.inegi.org.mx/servicios/catalogounico.html" target="_blank" rel="noopener">Consultar fuente INEGI ↗</a></p></div><div><strong>Regiones · una propuesta editable</strong><p>Norte, Poniente, Centro, Oriente y Sur se asignan inicialmente por la posición del centro de la caja de cada municipio respecto al Zócalo. Centro usa un umbral de 0.115 grados; el resto sigue el eje dominante. Esta es una referencia visual para trabajar, no una región comercial oficial ni una clasificación de INEGI.</p></div><div><strong>Cercanía · cálculo geográfico</strong><p>Distancia de Haversine en kilómetros entre coordenadas. No calcula rutas, tráfico, ventas ni conveniencia económica. La decisión se captura por Regional en cada ficha.</p></div><div><strong>Escenarios · en este equipo</strong><p>Se guardan en el navegador. El JSON incluye su base para continuar en otro equipo. Los cambios no se sincronizan entre usuarios ni se publican automáticamente en GitHub.</p></div></div>',
      '<button class="primary" data-action="close-modal">Volver al mapa</button>');
  }
  async function readScenarioFile(file){
    try{
      if(file.size>15*1024*1024)throw new Error('El archivo supera 15 MB.');
      pendingImport=C.readScenario(JSON.parse(await file.text()),base,geo);
      modal('Escenario revisado.','Confirma la propuesta que vas a abrir.',
        '<div class="note"><b>'+e(pendingImport.state.name)+'</b><br>'+pendingImport.base.stores.length+' ubicaciones · '+Object.keys(pendingImport.state.updates).length+' evaluaciones · '+Object.keys(pendingImport.state.areas).length+' ajustes de fondo.</div><p style="margin-top:15px">Tu escenario actual se sustituirá en este navegador. Puedes exportarlo primero.</p>',
        '<button class="secondary" data-action="export-json">Exportar el actual</button><button class="primary" data-action="confirm-import">Abrir este escenario</button>',true);
    }catch(error){showError(error);}
  }
  async function readExcelFile(file){
    try{
      if(file.size>15*1024*1024)throw new Error('El Excel supera 15 MB.');
      if(!window.XLSX)throw new Error('No se encontró el lector Excel. Extrae todo el ZIP.');
      const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      if(!workbook.Sheets.Ubicaciones)throw new Error('Falta la hoja Ubicaciones. Usa el formato CMS incluido.');
      const rows=XLSX.utils.sheet_to_json(workbook.Sheets.Ubicaciones,{defval:'',raw:true}), stores=C.parseLocations(rows,geo);
      pendingExcel={metadata:{...window.MAPA_BASE.metadata,source:file.name,signature:C.signature(stores),store_count:stores.length,no_metrics:[],unmatched_geography:stores.filter(s=>!s.municipality_id).map(s=>s.cc)},stores};
      modal('Ubicaciones listas.','La importación comenzará un escenario nuevo a partir de este Excel.',
        '<div class="comparison-stats"><div><b>'+stores.length+'</b><small>UBICACIONES</small></div><div><b>'+new Set(stores.map(s=>s.dm)).size+'</b><small>DM</small></div><div><b>'+stores.filter(s=>s.status==='Apertura').length+'</b><small>APERTURAS</small></div></div><p>'+e(file.name)+'</p>'+(pendingExcel.metadata.unmatched_geography.length?'<div class="alert">'+pendingExcel.metadata.unmatched_geography.length+' tiendas están fuera del fondo municipal disponible; sus pines y coordenadas se conservan.</div>':'')+'<div class="note">Se validaron CeCo únicos, nombres, DM, fechas y coordenadas. Las evaluaciones actuales se reemplazan; exporta primero si deseas conservarlas.</div>',
        '<button class="secondary" data-action="export-json">Exportar el actual</button><button class="primary" data-action="confirm-excel">Usar estas ubicaciones</button>',true);
    }catch(error){showError(error);}
  }
  function showError(error){modal('No se pudo cargar el archivo.','Tu escenario actual se conserva.','<div class="error-text">'+e(error.message||'Archivo no compatible.')+'</div>','<button class="primary" data-action="import">Elegir otro archivo</button>',true);}
  function resetStore(cc){if(!state.updates[cc]){toast('Esta tienda conserva los datos de base.');return;}transact(()=>{delete state.updates[cc];moving=false;},'Evaluación de la tienda restablecida a la base.');}
  function importConfirm(){
    if(!pendingImport)return;transact(()=>{base=pendingImport.base;state=pendingImport.state;selected.clear();focus=null;inspectorMode=null;view='proposal';Object.keys(filter).forEach(k=>filter[k]='');$('search').value='';$('statusFilter').value='';},'Escenario cargado.');setInspector(null);render();$('modal').close();fitVisible();pendingImport=null;
  }
  function excelConfirm(){
    if(!pendingExcel)return;transact(()=>{base=pendingExcel;state=C.freshState();selected.clear();focus=null;inspectorMode=null;view='proposal';Object.keys(filter).forEach(k=>filter[k]='');$('search').value='';$('statusFilter').value='';},'Base actualizada desde el Excel.');setInspector(null);render();$('modal').close();fitVisible();pendingExcel=null;
  }
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
        case 'load-scenario':$('scenarioFile').value='';$('scenarioFile').click();break;
        case 'load-excel':$('excelFile').value='';$('excelFile').click();break;
        case 'confirm-import':importConfirm();break;
        case 'confirm-excel':excelConfirm();break;
        case 'new-scenario':modal('Comenzar otra propuesta.','Se conserva la base de ubicaciones y se reinician las evaluaciones y el fondo.','<div class="note">Puedes exportar el escenario actual antes de empezar. También podrás usar Deshacer durante esta sesión.</div>','<button class="secondary" data-action="export-json">Exportar el actual</button><button class="primary" data-action="confirm-new">Crear propuesta vacía</button>',true);break;
        case 'confirm-new':transact(()=>{state=C.freshState();selected.clear();view='proposal';},'Nueva propuesta lista.');$('modal').close();break;
        case 'import':showImport();break;
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
  for(const [id,key] of [['dmFilter','dm'],['regionFilter','region'],['statusFilter','status'],['decisionFilter','decision']])$(id).addEventListener('change',event=>{filter[key]=event.target.value;render();fitVisible();});
  $('sortSelect').addEventListener('change',renderList);
  $('clearFilters').addEventListener('click',()=>{clearFilters();fitVisible();});
  $('selectVisible').addEventListener('change',event=>{visible.forEach(s=>event.target.checked?selected.add(s.cc):selected.delete(s.cc));render();});
  $('scenarioName').addEventListener('change',()=>{const name=$('scenarioName').value.trim()||'Propuesta Centro Norte';transact(()=>state.name=name);});
  $('backgroundBtn').addEventListener('click',openBackground);
  $('fitBtn').addEventListener('click',fitVisible);$('undoBtn').addEventListener('click',undo);$('areaBtn').addEventListener('click',startArea);
  $('guideBtn').addEventListener('click',guide);$('summaryBtn').addEventListener('click',summary);$('teamBtn').addEventListener('click',team);
  $('exportBtn').addEventListener('click',showExport);$('importBtn').addEventListener('click',showImport);$('sourcesBtn').addEventListener('click',sources);
  $('mobileListBtn').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
  $('closeListBtn').addEventListener('click',()=>$('sidebar').classList.remove('open'));
  $('dismissSteps').addEventListener('click',()=>$('mapSteps').classList.add('hidden'));
  $('scenarioFile').addEventListener('change',ev=>{if(ev.target.files[0])readScenarioFile(ev.target.files[0]);});
  $('excelFile').addEventListener('change',ev=>{if(ev.target.files[0])readExcelFile(ev.target.files[0]);});
  document.addEventListener('keydown',event=>{
    const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(event.key==='Escape'){stopArea();if(!$('modal').open){closeInspector();$('sidebar').classList.remove('open');}}
    if(!typing&&event.key==='/'&&!$('modal').open){event.preventDefault();$('sidebar').classList.add('open');$('search').focus();}
    if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo();}
  });
  render();fitVisible();
})();
