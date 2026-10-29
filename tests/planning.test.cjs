const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../static/planning/core.js');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/planning/base.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/planning/geography.js'),'utf8'),context);
const base=JSON.parse(JSON.stringify(context.window.MAPA_BASE)),geo=JSON.parse(JSON.stringify(context.window.MAPA_GEO));
const blankRow={CC:'43300','Nombre Tienda':'Apertura test',DM:'Enrique César','Fecha Apertura':'',Municipio:'Tepotzotlán',Cobertura:'Estado De México',Latitud:'19.74010',Longitud:'-99.21133',Activa:'Sí'};

test('la base del Excel contiene 103 CeCo únicos y los ocho DM incluidos',()=>{
 assert.equal(base.stores.length,103);assert.equal(new Set(base.stores.map(s=>s.cc)).size,103);
 assert.equal(new Set(base.stores.map(s=>s.dm)).size,8);
 assert.ok(base.stores.some(s=>s.dm==='David Carrasco'));assert.ok(base.stores.some(s=>s.dm==='Moni Morales'));
});
test('exactamente las tres filas sin fecha son Apertura',()=>{
 assert.deepEqual(base.stores.filter(s=>s.status==='Apertura').map(s=>s.cc),['43300','43301','43302']);
 assert.equal(base.stores.filter(s=>s.status==='Actual').length,100);
});
test('cartografía contiene 125 + 16 + 84 municipios y cinco entidades vecinas',()=>{
 for(const [id,count] of [['15',125],['09',16],['13',84]])assert.equal(geo.municipalities.features.filter(f=>f.properties.state===id).length,count);
 assert.equal(geo.neighbors.features.length,5);
});
test('cada ubicación encuentra un municipio y se identifica la diferencia de Toreo',()=>{
 base.stores.forEach(s=>assert.ok(C.findArea(s.latitude,s.longitude,geo),s.cc));
 const t=base.stores.find(s=>s.cc==='43302'),area=C.findArea(t.latitude,t.longitude,geo);
 assert.equal(t.coverage,'Estado De México');assert.equal(area.properties.state,'09');assert.equal(area.properties.name,'Miguel Hidalgo');
});
test('latitudes pegadas con coma final se leen sin perder precisión y otros textos se rechazan',()=>{
 assert.equal(C.coordinate('19.666318258441624, '),19.666318258441624);
 assert.ok(Number.isNaN(C.coordinate('19,66')));assert.ok(Number.isNaN(C.coordinate('')));assert.ok(Number.isNaN(C.coordinate('19.3 basura')));
});
test('ubicaciones se importan sin indicadores y fecha vacía no se convierte en 1900',()=>{
 const [store]=C.parseLocations([blankRow],geo);assert.equal(store.status,'Apertura');assert.equal(store.opening_date,null);
});
test('importación rechaza duplicados, fechas imposibles y coordenadas fuera de rango',()=>{
 assert.throws(()=>C.parseLocations([blankRow,{...blankRow}],geo),/duplicado/);
 assert.throws(()=>C.parseLocations([{...blankRow,Latitud:'190.5'}],geo),/coordenadas/);
 assert.throws(()=>C.parseLocations([{...blankRow,'Fecha Apertura':'31\/02\/2026'}],geo),/Fecha inválida/);
 assert.throws(()=>C.parseLocations([{...blankRow,CC:'123'}],geo),/cinco dígitos/);
});
test('filtro por CeCo, DM, región y aperturas se puede combinar',()=>{
 const filtered=C.filtered(C.current(base,C.freshState()),{search:'4330',dm:'Enrique César',region:'Norte',status:'Apertura'});
 assert.deepEqual(filtered.map(s=>s.cc),['43300','43301']);
});
test('distancia Haversine: igual ubicación es cero y un grado de ecuador son 111.195 km',()=>{
 const a={latitude:0,longitude:0},b={latitude:0,longitude:1};
 assert.equal(C.distance(a,a),0);assert.ok(Math.abs(C.distance(a,b)-111.19508)<.001);assert.equal(C.distance(a,b),C.distance(b,a));
});
test('cercanía excluye la propia tienda y conserva vecinos en orden geográfico',()=>{
 const s=base.stores.find(s=>s.cc==='43302'),near=C.nearest(s,base.stores);
 assert.equal(near.length,3);assert.ok(near.every(n=>n.cc!==s.cc));assert.ok(near[0].km<=near[1].km&&near[1].km<=near[2].km);
 assert.ok(near[0].km<1);
});
test('evaluación no muta la base; Base y Propuesta devuelven los datos correctos',()=>{
 const state=C.freshState(),original=base.stores.find(s=>s.cc==='43300');
 state.updates['43300']={dm:'DM nuevo',region:'Oriente',decision:'No considerar',notes:'Validar traslados'};
 assert.equal(C.current(base,state).find(s=>s.cc==='43300').dm,'DM nuevo');
 assert.equal(C.current(base,state,'base').find(s=>s.cc==='43300').dm,original.dm);
 assert.equal(base.stores.find(s=>s.cc==='43300').dm,original.dm);
});
test('exportar y cargar recupera ajustes individuales, fondo, colores y base completa',()=>{
 const state=C.freshState();state.updates['43300']={dm:'DM nuevo',region:'Oriente',decision:'Conservar',notes:'Se conserva',latitude:19.75,longitude:-99.21};state.areas['15095']='Poniente';state.dmColors['DM nuevo']='#123456';state.extraDms=['DM nuevo'];
 const roundtrip=C.readScenario(JSON.parse(JSON.stringify(C.pack(base,state))),base,geo);
 assert.deepEqual(roundtrip.state,state);assert.deepEqual(roundtrip.base,base);
});
test('escenario incompatible o con CeCo/regiones/coordenadas desconocidos se rechaza',()=>{
 const state=C.freshState();const doc=C.pack(base,state);
 assert.throws(()=>C.readScenario({...doc,version:99},base,geo),/compatible/);
 assert.throws(()=>C.readScenario({...doc,updates:{'99999':{decision:'Conservar'}}},base,geo),/CeCo/);
 assert.throws(()=>C.readScenario({...doc,updates:{'43300':{latitude:null,longitude:3}}},base,geo),/Coordenadas/);
 assert.throws(()=>C.readScenario({...doc,areas:{'15095':'Región inventada'}},base,geo),/fondo/);
 assert.throws(()=>C.readScenario({...doc,dmColors:{Enrique:'url(javascript:malicioso)'}},base,geo),/Color/);
});
test('CSV incluye apertura vacía, base y propuesta, comillas y protección de fórmulas',()=>{
 const state=C.freshState();state.updates['43300']={notes:'=HYPERLINK("x")',decision:'No considerar'};
 const csv=C.csv(base,state);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"DM base","DM propuesta"'));assert.ok(csv.includes('"No considerar"'));assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""));
 assert.equal(csv.split('\r\n').length,104);
 assert.ok(!csv.includes('"\'-99.'),'Las longitudes numéricas negativas se conservan como números.');
});
test('notas y nombres se escapan para mostrarse como texto',()=>{
 assert.equal(C.escape('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
});
