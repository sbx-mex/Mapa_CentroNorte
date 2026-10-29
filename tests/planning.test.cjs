const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../static/planning/core.js'),context={window:{}};vm.createContext(context);
for(const file of ['base','geography','insights'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/planning/'+file+'.js'),'utf8'),context);
const clone=x=>JSON.parse(JSON.stringify(x)),base=clone(context.window.MAPA_BASE),geo=clone(context.window.MAPA_GEO),health=clone(context.window.MAPA_INSIGHTS),cc=base.stores[0].cc;
const row={CC:'70001','Nombre Tienda':'Prueba',DM:'DM futuro','Fecha Apertura':'',Municipio:'Tepotzotlán',Cobertura:'Estado De México',Latitud:'19.74010',Longitud:'-99.21133',Activa:'Sí'};

test('base y revisión Python coinciden sin fijar el número futuro de tiendas o DM',()=>{
 assert.equal(base.stores.length,base.metadata.store_count);assert.equal(new Set(base.stores.map(s=>s.cc)).size,base.stores.length);assert.equal(health.counts.total,base.stores.length);assert.equal(health.counts.dms,new Set(base.stores.map(s=>s.dm)).size);assert.equal(base.metadata.signature,health.signature);assert.equal(health.status,'valid');
});
test('todas las tiendas son Región Centro Norte y las zonas no la sustituyen',()=>{
 assert.deepEqual(C.regions,['Centro Norte']);assert.ok(base.stores.every(s=>s.region==='Centro Norte'&&C.zones.includes(s.zone)));
 const state=C.freshState();state.updates[cc]={zone:'Oriente',region:'Otra región'};assert.equal(C.current(base,state)[0].region,'Centro Norte');assert.equal(C.current(base,state)[0].zone,'Oriente');
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
test('Base y Propuesta son independientes y la región no se puede reasignar',()=>{
 const state=C.freshState(),original=base.stores[0].dm;state.updates[cc]={dm:'DM nuevo',zone:'Oriente',decision:'No considerar',notes:'Revisar'};assert.equal(C.current(base,state)[0].dm,'DM nuevo');assert.equal(C.current(base,state,'base')[0].dm,original);assert.equal(base.stores[0].dm,original);assert.equal(C.current(base,state)[0].region,'Centro Norte');
});
test('la copia de una propuesta conserva notas, zonas, coordenadas y colores',()=>{
 const state=C.freshState();state.updates[cc]={dm:'DM nuevo',zone:'Oriente',decision:'Conservar',notes:'Validar',latitude:19.75,longitude:-99.21};state.areas[geo.municipalities.features[0].properties.id]='Poniente';state.dmColors['DM nuevo']='#123456';state.extraDms=['DM nuevo'];assert.deepEqual(C.readScenario(clone(C.pack(base,state)),base,geo).state,state);
});
test('los escenarios 3.0 migran sus regiones sugeridas a zonas geográficas',()=>{
 const old=clone(base);old.stores.forEach(s=>{s.region=s.zone;delete s.zone;});const state=C.freshState();state.updates[cc]={region:'Oriente',notes:'Nota anterior'};const result=C.readScenario(clone(C.pack(old,state)),base,geo);assert.ok(result.base.stores.every(s=>s.region==='Centro Norte'));assert.equal(result.state.updates[cc].zone,'Oriente');assert.equal(result.state.updates[cc].notes,'Nota anterior');
});
test('escenarios con CeCo, zonas o coordenadas inválidos se bloquean',()=>{
 const doc=C.pack(base,C.freshState());assert.throws(()=>C.readScenario({...doc,version:99},base,geo),/compatible/);assert.throws(()=>C.readScenario({...doc,updates:{abcde:{decision:'Conservar'}}},base,geo),/CeCo/);assert.throws(()=>C.readScenario({...doc,updates:{[cc]:{latitude:null,longitude:3}}},base,geo),/Coordenadas/);assert.throws(()=>C.readScenario({...doc,updates:{[cc]:{zone:'Inventada'}}},base,geo),/Zona/);
});
test('CSV preserva Región Centro Norte, zonas y números; neutraliza fórmulas de texto',()=>{
 const state=C.freshState();state.updates[cc]={notes:'=HYPERLINK("x")',decision:'No considerar'};const csv=C.csv(base,state);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"Región"'));assert.ok(csv.includes('"Centro Norte"'));assert.ok(csv.includes('"Zona base","Zona propuesta"'));assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""));assert.equal(csv.split('\r\n').length,base.stores.length+1);assert.ok(!/"'-\d/.test(csv));
});
test('contenido de notas o nombres se presenta como texto seguro',()=>{assert.equal(C.escape('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;');});
