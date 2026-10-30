const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../static/planning/core.js'),context={window:{}};vm.createContext(context);
for(const file of ['base','geography','insights'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/planning/'+file+'.js'),'utf8'),context);
const clone=x=>JSON.parse(JSON.stringify(x)),base=clone(context.window.MAPA_BASE),geo=clone(context.window.MAPA_GEO),health=clone(context.window.MAPA_INSIGHTS),cc=base.stores[0].cc;
const homeStats=health.regions.find(r=>r.region===C.REGION),openTotal=health.counts.open,regionOpen=r=>health.regions.find(x=>x.region===r).open;
const row={CC:'70001','Nombre Tienda':'Prueba',DM:'DM futuro','Fecha Apertura':'',Municipio:'Tepotzotlán',Cobertura:'Estado De México',Latitud:'19.74010',Longitud:'-99.21133',Activa:'Sí'};

test('base y revisión Python coinciden sin fijar el número futuro de tiendas o DM',()=>{
 assert.equal(base.stores.length,base.metadata.store_count);assert.equal(new Set(base.stores.map(s=>s.cc)).size,base.stores.length);assert.equal(health.counts.total,base.stores.length);assert.equal(health.counts.dms,new Set(base.stores.map(s=>s.dm)).size);assert.equal(base.metadata.signature,health.signature);assert.equal(health.status,'valid');
});
test('regiones de origen corregidas y zonas independientes',()=>{
 assert.deepEqual(C.regions,['Centro Sur','Centro Norte','Bajío','Centro Centro','Centro Poniente']);
 assert.equal(base.stores.filter(s=>s.region==='Centro Norte').length,homeStats.total);
 assert.equal(base.stores.filter(s=>s.dm==='David Carrasco'&&s.region==='Bajío').length,health.dms.find(x=>x.dm==='David Carrasco').count);
 assert.equal(base.stores.filter(s=>s.dm==='Moni Morales'&&s.region==='Centro Sur').length,health.dms.find(x=>x.dm==='Moni Morales').count);
 assert.ok(base.stores.every(s=>C.regions.includes(s.region)&&(C.zones.includes(s.zone)||s.mapping_status==='Pendiente'&&s.zone===null)));
 const state=C.freshState();state.updates[cc]={zone:'Oriente',region:'Otra región'};
 assert.equal(C.current(base,state)[0].region,base.stores[0].region);assert.equal(C.current(base,state)[0].zone,'Oriente');
 assert.deepEqual(base.metadata.regional_rules,C.rules);
});
test('el estatus operativo define aperturas aunque ya tengan una fecha prevista',()=>{
 assert.equal(base.stores.filter(s=>s.status==='Apertura').length,base.stores.filter(s=>s.operating_status==='Próxima Apertura').length);assert.equal(health.counts.openings,base.stores.filter(s=>s.operating_status==='Próxima Apertura').length);assert.ok(base.stores.some(s=>s.status==='Apertura'&&s.opening_date));
});
test('cada zona del fondo es referencia geográfica y las ubicaciones externas se reportan',()=>{
 assert.ok(geo.municipalities.features.length>0);assert.ok(geo.neighbors.features.length>0);
 base.stores.forEach(s=>{if(!C.findArea(s.latitude,s.longitude,geo))assert.ok(health.warnings.some(w=>w.cc===s.cc&&w.kind===(C.hasPoint(s)?'outside':'missing_coordinates')));});
});
test('latitud con coma final conserva el número y entradas ambiguas se rechazan',()=>{
 assert.equal(C.coordinate('19.666318258441624, '),19.666318258441624);assert.ok(Number.isNaN(C.coordinate('19,66')));assert.ok(Number.isNaN(C.coordinate('')));
});
test('fecha vacía es Apertura y se puede añadir un DM futuro',()=>{
 const [store]=C.parseLocations([row],geo);assert.equal(store.status,'Apertura');assert.equal(store.opening_date,null);assert.equal(store.region,'Centro Norte');assert.equal(store.dm,'DM futuro');
});
test('validación bloquea duplicados, fechas imposibles y coordenadas inválidas',()=>{
 assert.throws(()=>C.parseLocations([row,{...row}],geo),/duplicado/);assert.throws(()=>C.parseLocations([{...row,Latitud:'190'}],geo),/coordenadas/);assert.throws(()=>C.parseLocations([{...row,'Fecha Apertura':'31/02/2026'}],geo),/Fecha inválida/);
});
test('filtros de CeCo, DM y zona combinados sobre una base futura de prueba',()=>{
 const a={cc:'70001',store_name:'Uno',dm:'Nuevo DM',zone:'Norte',status:'Apertura'},b={...a,cc:'70002',zone:'Oriente'};
 assert.deepEqual(C.filtered([a,b],{search:'700',dm:'Nuevo DM',zone:'Norte',status:'Apertura'}),[a]);
});
test('distancias geográficas tienen escala y simetría correctas',()=>{
 const a={latitude:0,longitude:0},b={latitude:0,longitude:1};assert.equal(C.distance(a,a),0);assert.ok(Math.abs(C.distance(a,b)-111.19508)<.001);assert.equal(C.distance(a,b),C.distance(b,a));
});
test('cercanías de Python y de la propuesta concuerdan para la misma base',()=>{
 for(const s of base.stores){const nearest=C.nearest(s,base.stores,3),computed=health.nearest[s.cc];assert.equal(computed.length,nearest.length);for(let i=0;i<nearest.length;i++){assert.equal(computed[i].cc,nearest[i].cc);assert.ok(Math.abs(computed[i].km-nearest[i].km)<.000001);}}
});
test('Base y Propuesta son independientes incluso al ceder una tienda',()=>{
 const state=C.freshState(),original=base.stores[0].dm;state.updates[cc]={dm:'DM nuevo',region:'Centro Poniente',zone:'Oriente',decision:'Ceder',notes:'Revisar'};assert.equal(C.current(base,state)[0].dm,'DM nuevo');assert.equal(C.current(base,state,'base')[0].dm,original);assert.equal(base.stores[0].dm,original);assert.equal(C.current(base,state)[0].region,'Centro Poniente');assert.equal(C.current(base,state,'base')[0].region,base.stores[0].region);
});
test('la copia de una propuesta conserva notas, zonas, coordenadas y colores',()=>{
 const state=C.freshState();state.updates[cc]={dm:'DM nuevo',zone:'Oriente',decision:'Conservar',notes:'Validar',latitude:19.75,longitude:-99.21};state.areas[geo.municipalities.features[0].properties.id]='Poniente';state.dmColors['DM nuevo']='#123456';state.extraDms=['DM nuevo'];assert.deepEqual(C.readScenario(clone(C.pack(base,state)),base,geo).state,state);
});
test('los escenarios 3.0 migran sus regiones sugeridas a zonas geográficas',()=>{
 const old=clone(base);old.stores=old.stores.filter(C.hasPoint);old.stores.forEach(s=>{s.region=s.zone;delete s.zone;});const state=C.freshState();state.updates[cc]={region:'Oriente',notes:'Nota anterior'};const doc=clone(C.pack(old,state));doc.version=1;const result=C.readScenario(doc,base,geo);assert.ok(result.base.stores.every(s=>s.region===C.originRegion(s.dm)));assert.equal(result.state.updates[cc].zone,'Oriente');assert.equal(result.state.updates[cc].notes,'Nota anterior');
});
test('escenarios con CeCo, zonas o coordenadas inválidos se bloquean',()=>{
 const doc=C.pack(base,C.freshState());assert.throws(()=>C.readScenario({...doc,version:99},base,geo),/compatible/);assert.throws(()=>C.readScenario({...doc,updates:{abcde:{decision:'Conservar'}}},base,geo),/CeCo/);assert.throws(()=>C.readScenario({...doc,updates:{[cc]:{latitude:null,longitude:3}}},base,geo),/Coordenadas/);assert.throws(()=>C.readScenario({...doc,updates:{[cc]:{zone:'Inventada'}}},base,geo),/Zona/);
});
test('CSV preserva Región Centro Norte, zonas y números; neutraliza fórmulas de texto',()=>{
 const state=C.freshState();state.updates[cc]={notes:'=HYPERLINK("x")',decision:'No considerar'};const csv=C.csv(base,state);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"Región origen","Región propuesta","Movimiento"'));assert.ok(csv.includes('"Centro Norte"'));assert.ok(csv.includes('"Zona base","Zona propuesta"'));assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""));assert.equal(csv.split('\r\n').length,base.stores.length+1);assert.ok(!/"'-\d/.test(csv));
});
test('contenido de notas o nombres se presenta como texto seguro',()=>{assert.equal(C.escape('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;');});

const home=base.stores.find(s=>s.region===C.REGION&&C.isOpen(s)),opening=base.stores.find(s=>s.region===C.REGION&&s.status==='Apertura'),away=base.stores.find(s=>s.region==='Bajío'&&C.isOpen(s)),south=base.stores.find(s=>s.region==='Centro Sur'&&C.isOpen(s));
test('balance regional concilia 73 actuales y 3 aperturas sin contar las opciones',()=>{
 const b=C.balance(base,C.freshState());assert.equal(b.base,homeStats.total);assert.equal(b.baseCurrent,homeStats.current);assert.equal(b.baseOpenings,homeStats.openings);assert.equal(b.total,homeStats.total);assert.equal(b.current,homeStats.current);assert.equal(b.incoming.length,0);assert.equal(b.outgoing.length,0);
});
test('tomar de Bajío y ceder una apertura cambian el balance y conservan el origen',()=>{
 const state=C.freshState();state.updates[away.cc]=C.proposalUpdate(away,C.REGION);state.updates[opening.cc]=C.proposalUpdate(opening,'Centro Sur');
 const b=C.balance(base,state);assert.equal(b.total,homeStats.total);assert.equal(b.current,homeStats.current+1);assert.equal(b.openings,homeStats.openings-1);assert.equal(b.incoming.length,1);assert.equal(b.outgoing.length,1);assert.equal(b.kept.length,homeStats.total-1);
 const proposed=C.current(base,state),taken=proposed.find(s=>s.cc===away.cc);assert.equal(taken.origin_region,'Bajío');assert.equal(taken.region,C.REGION);assert.equal(taken.movement,'Tomar');assert.equal(base.stores.find(s=>s.cc===away.cc).region,'Bajío');
});
test('reasignar entre regiones externas no suma a Centro Norte ni duplica tiendas',()=>{
 const state=C.freshState();state.updates[away.cc]=C.proposalUpdate(away,'Centro Centro');assert.equal(C.balance(base,state).total,homeStats.total);assert.equal(C.current(base,state).find(s=>s.cc===away.cc).movement,'Reasignar');
 state.updates[away.cc]=C.proposalUpdate(away,C.REGION);state.updates[away.cc]=C.proposalUpdate(away,C.REGION);assert.equal(C.balance(base,state).total,homeStats.total+1);
 state.updates[away.cc]=C.proposalUpdate(away,away.region);assert.equal(C.balance(base,state).total,homeStats.total);assert.equal(C.balance(base,state).incoming.length,0);
});
test('cambiar DM no infiere una región ni altera el origen al restaurar la copia',()=>{
 const state=C.freshState();state.updates[home.cc]={dm:'David Carrasco',origin_region:'Bajío',...C.proposalUpdate(home,'Centro Poniente')};
 const item=C.current(base,state).find(s=>s.cc===home.cc);assert.equal(item.origin_region,C.REGION);assert.equal(item.region,'Centro Poniente');
 const restored=C.readScenario(clone(C.pack(base,state)),base,geo).state;assert.equal(C.current(base,restored).find(s=>s.cc===home.cc).region,'Centro Poniente');
});
test('todos los destinos aceptados se reflejan en el movimiento y los inválidos se bloquean',()=>{
 for(const region of C.regions){const u=C.proposalUpdate(home,region);assert.equal(u.region,region);assert.equal(u.decision,region===C.REGION?'Conservar':'Ceder');}
 assert.throws(()=>C.proposalUpdate(home,'Inventada'),/destino/);
 const doc=C.pack(base,C.freshState());assert.throws(()=>C.readScenario({...doc,updates:{[cc]:{region:'Inventada'}}},base,geo),/Región/);
});
test('filtros de origen, región propuesta y movimientos admiten tomar y ceder',()=>{
 const state=C.freshState();state.updates[away.cc]=C.proposalUpdate(away,C.REGION);state.updates[home.cc]=C.proposalUpdate(home,'Centro Sur');const stores=C.current(base,state);
 assert.equal(C.filtered(stores,{scope:'home'}).length,homeStats.total);assert.equal(C.filtered(stores,{scope:'external'}).length,base.stores.filter(s=>s.region!==C.REGION).length);assert.equal(C.filtered(stores,{scope:'moves'}).length,2);
 assert.equal(C.filtered(stores,{origin:'Bajío',region:C.REGION})[0].cc,away.cc);assert.equal(C.filtered(stores,{decision:'Ceder'})[0].cc,home.cc);assert.ok(C.filtered(stores,{search:'Mónica Morales'}).length>0);
});
test('selección múltiple mixta conserva el balance y permite deshacer con el estado anterior',()=>{
 const state=C.freshState(),before=clone(state);for(const original of [home,away,south])state.updates[original.cc]=C.proposalUpdate(original,C.REGION);
 assert.equal(C.balance(base,state).total,homeStats.total+2);assert.equal(C.balance(base,state).incoming.length,2);assert.equal(C.balance(base,before).total,homeStats.total);
});
test('CSV exporta las regiones y movimientos reales de cada tienda',()=>{
 const state=C.freshState();state.updates[away.cc]=C.proposalUpdate(away,C.REGION);const rows=C.csv(base,state).split('\r\n'),line=rows.find(r=>r.startsWith('"'+away.cc+'"'));
 assert.ok(line.includes('"Bajío","Centro Norte","Tomar","Sí"'));assert.equal(rows.length,base.stores.length+1);
});
test('Toreo Walmart conserva su coordenada confirmada y no genera aviso pendiente',()=>{
 const store=base.stores.find(s=>s.cc==='43302');assert.equal(store.latitude,19.4506098125196);assert.equal(store.longitude,-99.2180774805589);assert.ok(store.location_verification);assert.ok(!health.warnings.some(w=>w.cc===store.cc));
});

test('el fondo municipal muestra cinco colores geográficos independientes de los pines',()=>{
 const features=geo.municipalities.features,colors=new Set(features.map(f=>C.cartographicStyle(f.properties).fillColor));
 assert.deepEqual(C.zones,['Centro','Norte','Poniente','Sur','Oriente']);assert.equal(colors.size,5);
 for(const f of features)assert.equal(C.cartographicStyle(f.properties).fillColor,C.zoneColors[C.mapZone(f.properties)]);
});
test('cambiar regiones Starbucks y colores DM no cambia la capa cartográfica',()=>{
 const state=C.freshState(),before=geo.municipalities.features.map(f=>C.cartographicStyle(f.properties,state.areas,{opacity:.27}));
 state.updates[home.cc]={...C.proposalUpdate(home,'Centro Sur'),dm:'David Carrasco'};state.dmColors['David Carrasco']='#ff0000';
 const after=geo.municipalities.features.map(f=>C.cartographicStyle(f.properties,state.areas,{opacity:.27,colorMode:'dm',view:'base',region:'Centro Sur'}));
 assert.deepEqual(after,before);assert.equal(C.current(base,state).find(s=>s.cc===home.cc).region,'Centro Sur');
});
test('pintar un municipio afecta solo al fondo y conserva tiendas, CSV y balance',()=>{
 const state=C.freshState(),f=geo.municipalities.features[0],beforeStores=clone(C.current(base,state)),beforeBalance=clone(C.balance(base,state)),beforeCsv=C.csv(base,state),beforeGeo=JSON.stringify(geo);
 const original=C.mapZone(f.properties),target=C.zones.find(zone=>zone!==original);
 C.setMapZone(state,f.properties.id,target);
 assert.equal(C.cartographicStyle(f.properties,state.areas).fillColor,C.zoneColors[target]);assert.equal(C.mapZone(f.properties),original);
 assert.deepEqual(C.current(base,state),beforeStores);assert.deepEqual(C.balance(base,state),beforeBalance);assert.equal(C.csv(base,state),beforeCsv);assert.equal(JSON.stringify(geo),beforeGeo);
});
test('ocultar el fondo controla únicamente su transparencia y rechaza zonas internas como geográficas',()=>{
 const f=geo.municipalities.features[0],on=C.cartographicStyle(f.properties,{}, {visible:true,opacity:.27}),off=C.cartographicStyle(f.properties,{}, {visible:false,opacity:.27});
 assert.equal(on.fillOpacity,.27);assert.equal(off.fillOpacity,0);assert.equal(off.fillColor,on.fillColor);
 assert.throws(()=>C.setMapZone(C.freshState(),f.properties.id,'Centro Norte'),/cartográfica/);assert.throws(()=>C.setMapZone(C.freshState(),f.properties.id,'Bajío'),/cartográfica/);
});
test('la copia recupera ajustes cartográficos y regiones internas sin cruzar asignaciones',()=>{
 const state=C.freshState(),f=geo.municipalities.features[0];C.setMapZone(state,f.properties.id,'Oriente');state.updates[home.cc]=C.proposalUpdate(home,'Centro Poniente');
 const restored=C.readScenario(clone(C.pack(base,state)),base,geo).state;
 assert.equal(C.mapZone(f.properties,restored.areas),'Oriente');assert.equal(C.current(base,restored).find(s=>s.cc===home.cc).region,'Centro Poniente');assert.equal(C.current(base,restored,'base').find(s=>s.cc===home.cc).region,home.region);
});

test('solo abiertas: span regional excluye aperturas e inactivas, conserva la base completa',()=>{
 const state=C.freshState(),before=JSON.stringify(base);
 const rows=C.regionalCounts(base,state),homeRow=rows.find(x=>x.region===C.REGION);
 assert.equal(homeRow.total,homeStats.open);assert.equal(homeRow.base,homeStats.open);assert.equal(rows.reduce((n,x)=>n+x.total,0),openTotal);
 assert.equal(rows.find(x=>x.region==='Centro Centro').available,true);
 const future=clone(base);future.stores.find(s=>s.cc===home.cc).active=false;
 assert.equal(C.regionalCounts(future,state).find(x=>x.region===C.REGION).total,homeStats.open-1);
 assert.equal(JSON.stringify(base),before);assert.equal(C.isOpen(opening),false);
});
test('tomar y ceder actualizan span y DM de todas las regiones sin duplicar tiendas',()=>{
 const state=C.freshState();state.updates[home.cc]=C.proposalUpdate(home,'Centro Sur');state.updates[away.cc]={...C.proposalUpdate(away,C.REGION),dm:'DM nuevo'};
 const rows=C.regionalCounts(base,state),cn=rows.find(r=>r.region===C.REGION),cs=rows.find(r=>r.region==='Centro Sur');
 assert.equal(cn.total,homeStats.open);assert.equal(cn.incoming,1);assert.equal(cn.outgoing,1);assert.equal(cs.total,regionOpen('Centro Sur')+1);assert.equal(cn.dms.find(x=>x.dm==='DM nuevo').total,1);
 assert.equal(rows.reduce((n,r)=>n+r.total,0),openTotal);assert.equal(C.regionalCounts(base,state,'base').find(r=>r.region===C.REGION).total,homeStats.open);
 state.updates[opening.cc]=C.proposalUpdate(opening,'Centro Centro');assert.equal(C.regionalCounts(base,state).find(r=>r.region==='Centro Centro').total,regionOpen('Centro Centro'));
});
test('cada región Starbucks tiene color propio independiente del fondo y del DM',()=>{
 assert.equal(new Set(Object.values(C.regionColors)).size,5);for(const r of C.regions)assert.match(C.regionColors[r],/^#[0-9a-f]{6}$/i);
 const state=C.freshState();state.updates[home.cc]={dm:'DM futuro',...C.proposalUpdate(home,'Centro Sur')};
 assert.equal(C.regionColors[C.current(base,state).find(s=>s.cc===home.cc).region],C.regionColors['Centro Sur']);
});
test('actualizar la fuente conserva ajustes conocidos, áreas y notas; no los reinicia',()=>{
 const state=C.freshState();state.updates[home.cc]={...C.proposalUpdate(home,'Centro Sur'),notes:'Conservar avance'};state.updates['99999']={notes:'Fuera de esta base'};const id=geo.municipalities.features[0].properties.id;state.areas[id]='Sur';state.extraDms=['Otro DM'];
 const result=C.reconcileState(state,base,geo);assert.deepEqual(result.updates[home.cc],state.updates[home.cc]);assert.equal(result.areas[id],'Sur');assert.deepEqual(result.extraDms,['Otro DM']);assert.equal(result.updates['99999'],undefined);assert.ok(state.updates['99999']);
 assert.deepEqual(C.readScenario(clone(C.pack(base,result)),base,geo).state,result);
});
test('auditoría estima señales sin alterar asignaciones y usa geografía real del fondo',()=>{
 const data=clone(base);data.stores.find(s=>s.cc===home.cc).latitude=19.15;data.stores.find(s=>s.cc===home.cc).longitude=-99.14;
 const state=C.freshState(),before=JSON.stringify({data,state}),audit=C.auditRegions(data,state,geo);
 const issue=audit.items.find(s=>s.cc===home.cc);assert.ok(issue);assert.equal(issue.zone,'Sur');assert.ok(issue.reasons.some(x=>x.includes('zona geográfica Sur')));assert.equal(audit.checked,openTotal);assert.equal(JSON.stringify({data,state}),before);
 assert.ok(!audit.items.some(s=>s.cc===opening.cc));
});
test('CSV de abiertas deja aperturas en el respaldo completo sin contarlas en Excel',()=>{
 const state=C.freshState();state.updates[opening.cc]={notes:'Avance de apertura'};
 const rows=C.csv(base,state,{openOnly:true}).split('\r\n');assert.equal(rows.length,openTotal+1);assert.ok(!rows.some(r=>r.startsWith('"'+opening.cc+'"')));
 assert.equal(C.readScenario(clone(C.pack(base,state)),base,geo).state.updates[opening.cc].notes,'Avance de apertura');
});

test('el directorio desplegable agrupa Región DM Tienda desde el CMS sin alterar regiones',()=>{
 const before=JSON.stringify(base),tree=C.directoryTree(base),codes=tree.flatMap(r=>r.dms.flatMap(dm=>dm.stores.map(s=>s.cc)));
 assert.equal(tree.length,5);assert.equal(codes.length,openTotal);assert.equal(new Set(codes).size,openTotal);
 for(const region of tree){assert.equal(region.total,region.dms.reduce((n,dm)=>n+dm.total,0));for(const dm of region.dms)assert.ok(dm.stores.every(s=>s.region===region.region&&s.dm===dm.dm&&C.isOpen(s)));}
 const cn=tree.find(r=>r.region===C.REGION);assert.equal(cn.dms.find(dm=>dm.dm==='Enrique César').total,health.dms.find(x=>x.dm==='Enrique César').open);
 assert.equal(cn.dms.find(dm=>dm.dm==='Nancy Rodríguez').total,health.dms.find(x=>x.dm==='Nancy Rodríguez').open);
 assert.equal(JSON.stringify(base),before);
 const state=C.freshState();state.updates[home.cc]=C.proposalUpdate(home,'Centro Sur');assert.equal(C.directoryTree(base).find(r=>r.region===C.REGION).total,homeStats.open);
});
test('búsqueda en directorio conserva la cadena región DM y tienda del resultado',()=>{
 const target=base.stores.find(C.isOpen),result=C.directoryTree(base,target.cc).filter(r=>r.total);assert.equal(result.length,1);assert.equal(result[0].region,target.region);assert.equal(result[0].dms[0].dm,target.dm);assert.equal(result[0].dms[0].stores[0].cc,target.cc);
 const closed=base.stores.find(s=>s.operating_status==='Cierre Temporal');assert.equal(C.directoryTree(base,closed.cc).reduce((n,r)=>n+r.total,0),0);
});
test('los cinco colores comerciales respetan la región del directorio de cada pin',()=>{
 const expected=Object.fromEntries(health.regions.map(r=>[r.region,r.open]));
 for(const [region,total] of Object.entries(expected)){const list=base.stores.filter(s=>s.region===region&&C.isOpen(s));assert.equal(list.length,total);assert.ok(list.every(s=>C.regionColors[s.region]===C.regionColors[region]));}
});
test('una abierta sin coordenada cuenta en el directorio sin estimar un punto',()=>{
 const future=clone(base),item=future.stores.find(s=>s.cc===home.cc);item.latitude=null;item.longitude=null;item.zone=null;item.mapping_status='Pendiente';
 assert.equal(C.hasPoint(item),false);assert.equal(C.regionalCounts(future,C.freshState()).find(r=>r.region===C.REGION).total,homeStats.open);
 assert.ok(C.auditRegions(future,C.freshState(),geo).items.find(s=>s.cc===home.cc).reasons.some(r=>r.includes('Coordenadas pendientes')));
 assert.deepEqual(C.nearest(item,future.stores),[]);assert.equal(C.readScenario(clone(C.pack(future,C.freshState())),future,geo).base.stores.find(s=>s.cc===home.cc).latitude,null);
});

test('un catálogo de prueba suma abiertas y movimientos con cantidades independientes del CMS',()=>{
 const seed={cc:'70001',store_name:'Tienda de prueba',region:C.REGION,dm:'DM prueba',status:'Actual',operating_status:'Abierta',active:true,opening_date:'2026-01-01',latitude:19.6,longitude:-99.2,zone:'Norte'};
 const fixture={metadata:{signature:'fixture'},stores:[seed,{...seed,cc:'70002'},{...seed,cc:'70003',region:'Centro Sur',dm:'DM Sur'},{...seed,cc:'70004',active:false},{...seed,cc:'70005',status:'Apertura',operating_status:'Próxima Apertura'}]};
 const state=C.freshState();assert.equal(C.regionalCounts(fixture,state).find(r=>r.region===C.REGION).total,2);
 state.updates['70003']={...C.proposalUpdate(fixture.stores[2],C.REGION),dm:'Por asignar'};
 const rows=C.regionalCounts(fixture,state);assert.equal(rows.find(r=>r.region===C.REGION).total,3);assert.equal(rows.find(r=>r.region==='Centro Sur').total,0);assert.equal(rows.reduce((n,r)=>n+r.total,0),3);
 assert.equal(C.directoryTree(fixture).find(r=>r.region===C.REGION).total,2);
});
