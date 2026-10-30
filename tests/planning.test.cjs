const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../static/planning/core.js'),context={window:{}};vm.createContext(context);
for(const file of ['base','geography','insights'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/planning/'+file+'.js'),'utf8'),context);
const clone=x=>JSON.parse(JSON.stringify(x)),base=clone(context.window.MAPA_BASE),geo=clone(context.window.MAPA_GEO),health=clone(context.window.MAPA_INSIGHTS),cc=base.stores[0].cc;
const row={CC:'70001','Nombre Tienda':'Prueba',DM:'DM futuro','Fecha Apertura':'',Municipio:'Tepotzotlán',Cobertura:'Estado De México',Latitud:'19.74010',Longitud:'-99.21133',Activa:'Sí'};

test('base y revisión Python coinciden sin fijar el número futuro de tiendas o DM',()=>{
 assert.equal(base.stores.length,base.metadata.store_count);assert.equal(new Set(base.stores.map(s=>s.cc)).size,base.stores.length);assert.equal(health.counts.total,base.stores.length);assert.equal(health.counts.dms,new Set(base.stores.map(s=>s.dm)).size);assert.equal(base.metadata.signature,health.signature);assert.equal(health.status,'valid');
});
test('regiones de origen corregidas y zonas independientes',()=>{
 assert.deepEqual(C.regions,['Centro Sur','Centro Norte','Bajío','Centro Centro','Centro Poniente']);
 assert.equal(base.stores.filter(s=>s.region==='Centro Norte').length,76);
 assert.equal(base.stores.filter(s=>s.dm==='David Carrasco'&&s.region==='Bajío').length,14);
 assert.equal(base.stores.filter(s=>s.dm==='Moni Morales'&&s.region==='Centro Sur').length,13);
 assert.ok(base.stores.every(s=>C.regions.includes(s.region)&&C.zones.includes(s.zone)));
 const state=C.freshState();state.updates[cc]={zone:'Oriente',region:'Otra región'};
 assert.equal(C.current(base,state)[0].region,base.stores[0].region);assert.equal(C.current(base,state)[0].zone,'Oriente');
 assert.deepEqual(base.metadata.regional_rules,C.rules);
});
test('las aperturas siempre son las filas sin fecha, con cantidades futuras variables',()=>{
 assert.equal(base.stores.filter(s=>s.status==='Apertura').length,base.stores.filter(s=>!s.opening_date).length);assert.equal(health.counts.openings,base.stores.filter(s=>!s.opening_date).length);
});
test('cada zona del fondo es referencia geográfica y las ubicaciones externas se reportan',()=>{
 assert.ok(geo.municipalities.features.length>0);assert.ok(geo.neighbors.features.length>0);
 base.stores.forEach(s=>{if(!C.findArea(s.latitude,s.longitude,geo))assert.ok(health.warnings.some(w=>w.cc===s.cc&&w.kind==='outside'));});
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
 const old=clone(base);old.stores.forEach(s=>{s.region=s.zone;delete s.zone;});const state=C.freshState();state.updates[cc]={region:'Oriente',notes:'Nota anterior'};const doc=clone(C.pack(old,state));doc.version=1;const result=C.readScenario(doc,base,geo);assert.ok(result.base.stores.every(s=>s.region===C.originRegion(s.dm)));assert.equal(result.state.updates[cc].zone,'Oriente');assert.equal(result.state.updates[cc].notes,'Nota anterior');
});
test('escenarios con CeCo, zonas o coordenadas inválidos se bloquean',()=>{
 const doc=C.pack(base,C.freshState());assert.throws(()=>C.readScenario({...doc,version:99},base,geo),/compatible/);assert.throws(()=>C.readScenario({...doc,updates:{abcde:{decision:'Conservar'}}},base,geo),/CeCo/);assert.throws(()=>C.readScenario({...doc,updates:{[cc]:{latitude:null,longitude:3}}},base,geo),/Coordenadas/);assert.throws(()=>C.readScenario({...doc,updates:{[cc]:{zone:'Inventada'}}},base,geo),/Zona/);
});
test('CSV preserva Región Centro Norte, zonas y números; neutraliza fórmulas de texto',()=>{
 const state=C.freshState();state.updates[cc]={notes:'=HYPERLINK("x")',decision:'No considerar'};const csv=C.csv(base,state);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"Región origen","Región propuesta","Movimiento"'));assert.ok(csv.includes('"Centro Norte"'));assert.ok(csv.includes('"Zona base","Zona propuesta"'));assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""));assert.equal(csv.split('\r\n').length,base.stores.length+1);assert.ok(!/"'-\d/.test(csv));
});
test('contenido de notas o nombres se presenta como texto seguro',()=>{assert.equal(C.escape('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;');});

const home=base.stores.find(s=>s.region===C.REGION&&s.status==='Actual'),opening=base.stores.find(s=>s.region===C.REGION&&s.status==='Apertura'),away=base.stores.find(s=>s.region==='Bajío'),south=base.stores.find(s=>s.region==='Centro Sur');
test('balance regional concilia 73 actuales y 3 aperturas sin contar las opciones',()=>{
 const b=C.balance(base,C.freshState());assert.equal(b.base,76);assert.equal(b.baseCurrent,73);assert.equal(b.baseOpenings,3);assert.equal(b.total,76);assert.equal(b.current,73);assert.equal(b.incoming.length,0);assert.equal(b.outgoing.length,0);
});
test('tomar de Bajío y ceder una apertura cambian el balance y conservan el origen',()=>{
 const state=C.freshState();state.updates[away.cc]=C.proposalUpdate(away,C.REGION);state.updates[opening.cc]=C.proposalUpdate(opening,'Centro Sur');
 const b=C.balance(base,state);assert.equal(b.total,76);assert.equal(b.current,74);assert.equal(b.openings,2);assert.equal(b.incoming.length,1);assert.equal(b.outgoing.length,1);assert.equal(b.kept.length,75);
 const proposed=C.current(base,state),taken=proposed.find(s=>s.cc===away.cc);assert.equal(taken.origin_region,'Bajío');assert.equal(taken.region,C.REGION);assert.equal(taken.movement,'Tomar');assert.equal(base.stores.find(s=>s.cc===away.cc).region,'Bajío');
});
test('reasignar entre regiones externas no suma a Centro Norte ni duplica tiendas',()=>{
 const state=C.freshState();state.updates[away.cc]=C.proposalUpdate(away,'Centro Centro');assert.equal(C.balance(base,state).total,76);assert.equal(C.current(base,state).find(s=>s.cc===away.cc).movement,'Reasignar');
 state.updates[away.cc]=C.proposalUpdate(away,C.REGION);state.updates[away.cc]=C.proposalUpdate(away,C.REGION);assert.equal(C.balance(base,state).total,77);
 state.updates[away.cc]=C.proposalUpdate(away,away.region);assert.equal(C.balance(base,state).total,76);assert.equal(C.balance(base,state).incoming.length,0);
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
 assert.equal(C.filtered(stores,{scope:'home'}).length,76);assert.equal(C.filtered(stores,{scope:'external'}).length,27);assert.equal(C.filtered(stores,{scope:'moves'}).length,2);
 assert.equal(C.filtered(stores,{origin:'Bajío',region:C.REGION})[0].cc,away.cc);assert.equal(C.filtered(stores,{decision:'Ceder'})[0].cc,home.cc);assert.ok(C.filtered(stores,{search:'Mónica Morales'}).length>0);
});
test('selección múltiple mixta conserva el balance y permite deshacer con el estado anterior',()=>{
 const state=C.freshState(),before=clone(state);for(const original of [home,away,south])state.updates[original.cc]=C.proposalUpdate(original,C.REGION);
 assert.equal(C.balance(base,state).total,78);assert.equal(C.balance(base,state).incoming.length,2);assert.equal(C.balance(base,before).total,76);
});
test('CSV exporta las regiones y movimientos reales de cada tienda',()=>{
 const state=C.freshState();state.updates[away.cc]=C.proposalUpdate(away,C.REGION);const rows=C.csv(base,state).split('\r\n'),line=rows.find(r=>r.startsWith('"'+away.cc+'"'));
 assert.ok(line.includes('"Bajío","Centro Norte","Tomar","Sí"'));assert.equal(rows.length,base.stores.length+1);
});
test('Toreo Walmart conserva su coordenada confirmada y no genera aviso pendiente',()=>{
 const store=base.stores.find(s=>s.cc==='43302');assert.equal(store.latitude,19.4506098125196);assert.equal(store.longitude,-99.2180774805589);assert.ok(store.location_verification);assert.ok(!health.warnings.some(w=>w.cc===store.cc));
});
