"""Valida el CMS y prepara la vista Centro Norte con Python, sin paquetes extra.

python ACTUALIZAR_MAPA.py --no-open       actualiza la vista
python ACTUALIZAR_MAPA.py --check         comprueba datos y vista; no escribe
Al ejecutarlo con doble clic, abre el mapa al terminar correctamente.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import unicodedata
import webbrowser
import xml.etree.ElementTree as ET
import zipfile

REGION = 'Centro Norte'
ZONES = ('Norte', 'Poniente', 'Centro', 'Oriente', 'Sur')
NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
FIELDS = {'CC':'cc','Nombre Tienda':'store_name','DM':'dm','Región':'region','Fecha Apertura':'opening_date','Municipio':'municipality','Cobertura':'coverage','Formato':'format','Formato Comercial':'commercial_format','Tier':'tier','Latitud':'latitude','Longitud':'longitude','Activa':'active'}
REQUIRED = ('CC','Nombre Tienda','DM','Fecha Apertura','Municipio','Cobertura','Latitud','Longitud')


class ValidationError(ValueError):
    def __init__(self, errors):
        self.errors = errors if isinstance(errors,list) else [str(errors)]
        super().__init__('\n'.join(self.errors))


def clean(v): return str(v if v is not None else '').strip()
def norm(v): return ''.join(c for c in unicodedata.normalize('NFD',clean(v).lower()) if not unicodedata.combining(c))
def digest(value): return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]


def regional_rules(root=None):
    root=root or Path(__file__).resolve().parent
    rules=json.loads((root/'static/planning/regional-rules.json').read_text(encoding='utf-8'))
    if rules.get('home_region')!=REGION or len(rules.get('regions',[]))!=5 or len(set(rules['regions']))!=5:
        raise ValidationError('Configuración regional inválida.')
    if any(v not in rules['regions'] for v in rules.get('dm_origins',{}).values()):
        raise ValidationError('Hay DM con región desconocida.')
    return rules


def origin_region(dm,provided,rules):
    if clean(provided):
        match=next((r for r in rules['regions'] if norm(r)==norm(provided)),None)
        if not match:raise ValidationError('Región inválida: '+clean(provided))
        return match
    return rules['dm_origins'].get(norm(dm),REGION)


def excel_date(value, date1904=False):
    value=clean(value)
    if not value:return None
    try:
        if re.fullmatch(r'\d+(?:\.\d+)?',value):
            serial=float(value)
            if not math.isfinite(serial) or not 1 <= serial <= 100000: raise ValueError()
            epoch=datetime(1904,1,1) if date1904 else datetime(1899,12,30)
            return (epoch+timedelta(days=int(serial))).date().isoformat()
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):return datetime.strptime(value,'%Y-%m-%d').date().isoformat()
        for fmt in ('%d/%m/%Y','%d/%m/%y'):
            try:return datetime.strptime(value,fmt).date().isoformat()
            except ValueError:pass
    except (ValueError,OverflowError):pass
    raise ValidationError('Fecha inválida: '+value)


def read_locations(path):
    """Lee solo Ubicaciones. Los indicadores no condicionan el mapa."""
    with zipfile.ZipFile(path) as archive:
        if sum(x.file_size for x in archive.infolist())>100*1024*1024:raise ValidationError('El Excel descomprimido supera 100 MB.')
        strings=[]
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings=[''.join(n.text or '' for n in si.iter('{'+NS['s']+'}t')) for si in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si',NS)]
        workbook=ET.fromstring(archive.read('xl/workbook.xml'))
        rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheet=next((s for s in workbook.find('s:sheets',NS) if s.attrib['name']=='Ubicaciones'),None)
        if sheet is None:raise ValidationError('Falta la hoja Ubicaciones.')
        target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
        date1904=workbook.find('s:workbookPr',NS)
        date1904=date1904 is not None and date1904.attrib.get('date1904') in ('1','true')
        parsed=[]
        for row in ET.fromstring(archive.read(target)).findall('.//s:sheetData/s:row',NS):
            cells={}
            for cell in row.findall('s:c',NS):
                col=re.sub(r'\d','',cell.attrib['r']);v=cell.find('s:v',NS);value=v.text if v is not None else ''
                if cell.attrib.get('t')=='s':value=strings[int(value)]
                elif cell.attrib.get('t')=='inlineStr':value=''.join(t.text or '' for t in cell.findall('.//s:t',NS))
                if cell.attrib.get('t')=='e':value='#ERROR_EXCEL'
                cells[col]=clean(value)
            parsed.append((int(row.attrib['r']),cells))
    if not parsed:raise ValidationError('La hoja Ubicaciones está vacía.')
    headers=parsed[0][1]
    missing=[h for h in REQUIRED if h not in headers.values()]
    if missing:raise ValidationError('Faltan columnas: '+', '.join(missing))
    names=[h for h in headers.values() if h]
    if len(names)!=len(set(names)):raise ValidationError('Hay encabezados duplicados en Ubicaciones.')
    return [(n,{headers[k]:v for k,v in row.items() if headers.get(k)}) for n,row in parsed[1:]],date1904


def in_ring(point,ring):
    x,y=point;inside=False;j=len(ring)-1
    for i,(xi,yi,*_) in enumerate(ring):
        xj,yj=ring[j][:2]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:inside=not inside
        j=i
    return inside


def find_area(lat,lng,geo):
    for f in geo['municipalities']['features']:
        b=f['properties']['bbox']
        if not b[0]<=lng<=b[2] or not b[1]<=lat<=b[3]:continue
        geom=f['geometry'];polys=geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
        if any(in_ring([lng,lat],p[0]) and not any(in_ring([lng,lat],h) for h in p[1:]) for p in polys):return f['properties']
    return None


def fallback_zone(lat,lng):
    dx=(lng+99.1332)*.943;dy=lat-19.4326
    if dx*dx+dy*dy <= .115**2:return 'Centro'
    return ('Oriente' if dx>0 else 'Poniente') if abs(dx)>abs(dy) else ('Norte' if dy>0 else 'Sur')


def distance(a,b):
    a_lat,b_lat=math.radians(a['latitude']),math.radians(b['latitude']);dlat=b_lat-a_lat;dlng=math.radians(b['longitude']-a['longitude'])
    h=math.sin(dlat/2)**2+math.cos(a_lat)*math.cos(b_lat)*math.sin(dlng/2)**2
    return 6371.0088*2*math.atan2(math.sqrt(h),math.sqrt(max(0,1-h)))


def normalize_rows(rows,geo,date1904=False,rules=None):
    rules=rules or regional_rules()
    stores=[];errors=[];warnings=[];seen=set();corrections=[]
    states={'09':'Ciudad de México','15':'Estado de México','13':'Hidalgo'}
    for line,row in rows:
        if not any(clean(row.get(h)) for h in REQUIRED):continue
        label=f'Fila {line}'
        try:
            s={field:clean(row.get(h)) for h,field in FIELDS.items()};cc=s['cc']
            if not re.fullmatch(r'\d{5}',cc):raise ValidationError('CeCo debe tener cinco dígitos.')
            if cc in seen:raise ValidationError('CeCo duplicado '+cc)
            seen.add(cc)
            if not s['store_name'] or not s['dm']:raise ValidationError('Nombre de tienda y DM son obligatorios.')
            for field in ('latitude','longitude'):
                original=s[field];fixed=re.sub(r'^([+-]?\d+(?:\.\d+)?)\s*,$',r'\1',original)
                if fixed!=original:corrections.append({'cc':cc,'field':field,'detail':'Coma final de pegado retirada; no se estimó otra coordenada.'})
                try:s[field]=float(fixed)
                except (TypeError,ValueError):raise ValidationError('Coordenada inválida: '+field)
                if not math.isfinite(s[field]):raise ValidationError('Coordenada no finita: '+field)
            if not -90<=s['latitude']<=90 or not -180<=s['longitude']<=180:raise ValidationError('Coordenadas fuera de rango.')
            s['opening_date']=excel_date(s['opening_date'],date1904);s['status']='Actual' if s['opening_date'] else 'Apertura'
            s['active']=norm(s['active']) not in ('no','false','0','inactiva')
            a=find_area(s['latitude'],s['longitude'],geo)
            s.update(region=origin_region(s['dm'],s['region'],rules),zone=(a.get('zone') or a.get('region')) if a else fallback_zone(s['latitude'],s['longitude']),municipality_id=a['id'] if a else None,geo_municipality=a['name'] if a else None)
            confirmation=rules.get('confirmed_locations',{}).get(cc,{})
            confirmed=confirmation.get('latitude')==s['latitude'] and confirmation.get('longitude')==s['longitude']
            if confirmed:s['location_verification']=confirmation['note']
            if s['zone'] not in ZONES:s['zone']=fallback_zone(s['latitude'],s['longitude'])
            if not a:warnings.append({'cc':cc,'kind':'outside','title':'Fuera del fondo disponible','detail':'Revisar coordenadas o ampliar el fondo. El pin se conserva.'})
            elif not confirmed and norm(s['coverage'])!=norm(states.get(a['state'],s['coverage'])):
                warnings.append({'cc':cc,'kind':'state_mismatch','title':'Validar ubicación','detail':s['municipality']+' · '+s['coverage']+' en Excel; coordenada en '+a['name']+' · '+states.get(a['state'],a['state'])+'.'})
            if not s['active']:warnings.append({'cc':cc,'kind':'inactive','title':'Estatus de origen inactivo','detail':'La ubicación se conserva para revisión; confirma su consideración en la propuesta.'})
            stores.append(s)
        except ValidationError as exc:errors.extend(label+': '+err for err in exc.errors)
    if errors:raise ValidationError(errors)
    if not stores:raise ValidationError('No hay ubicaciones válidas.')
    if len(stores)>10000:raise ValidationError('La base supera 10,000 ubicaciones.')
    return sorted(stores,key=lambda s:s['cc']),warnings,corrections


def read_js(path,variable):
    text=path.read_text(encoding='utf-8');prefix='window.'+variable+' = '
    if not text.startswith(prefix):raise ValidationError('Formato inválido: '+path.name)
    return json.loads(text[len(prefix):].rstrip().removesuffix(';'))


def prepare(root):
    folder=root/'static/planning';geo=read_js(folder/'geography.js','MAPA_GEO')
    rules=regional_rules(root)
    rows,date1904=read_locations(root/'cms/Mapa_CentroNorte_CMS.xlsx');stores,warnings,corrections=normalize_rows(rows,geo,date1904,rules)
    signature=digest(stores);stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
    metadata={'version':'4.0.0','signature':signature,'region':REGION,'regional_rules':rules,'source':'cms/Mapa_CentroNorte_CMS.xlsx','store_count':len(stores),'validated_at':stamp,'source_repo':'sbx-mex/Mapa_CentroNorte','geography_signature':digest(geo),'source_workbook_sha256':hashlib.sha256((root/'cms/Mapa_CentroNorte_CMS.xlsx').read_bytes()).hexdigest()}
    base={'metadata':metadata,'stores':stores};by_cc={s['cc']:s for s in stores}
    nearest={s['cc']:[{'cc':other['cc'],'km':round(distance(s,other),6)} for other in sorted((x for x in stores if x['cc']!=s['cc']),key=lambda other:distance(s,other))[:3]] for s in stores}
    dms=[]
    for dm in sorted({s['dm'] for s in stores}):
        team=[s for s in stores if s['dm']==dm]
        span=max((distance(a,b) for i,a in enumerate(team) for b in team[i+1:]),default=0)
        dms.append({'dm':dm,'count':len(team),'openings':sum(s['status']=='Apertura' for s in team),'span_km':round(span,2)})
    regional=[{'region':r,'total':sum(s['region']==r for s in stores),'current':sum(s['region']==r and s['status']=='Actual' for s in stores),'openings':sum(s['region']==r and s['status']=='Apertura' for s in stores)} for r in rules['regions']]
    home=next(r for r in regional if r['region']==REGION)
    insights={'status':'valid','signature':signature,'validated_at':stamp,'region':REGION,'counts':{'total':len(stores),'current':sum(s['status']=='Actual' for s in stores),'openings':sum(s['status']=='Apertura' for s in stores),'regional_total':home['total'],'regional_current':home['current'],'regional_openings':home['openings'],'external':len(stores)-home['total'],'dms':len(dms),'review':len({w['cc'] for w in warnings})},'regions':regional,'confirmed_locations':{s['cc']:s['location_verification'] for s in stores if s.get('location_verification')},'warnings':warnings,'corrections':corrections,'dms':dms,'nearest':nearest,'checks':{'unique_ceco':True,'coordinates':True,'dates':True,'regions_valid':True,'geography':True},'method':'Distancia Haversine en línea recta; las zonas del fondo son referencias geográficas.'}
    # Verificar enlaces locales y contratos de navegación antes de marcar verde.
    html=(root/'index.html').read_text(encoding='utf-8')
    for href in re.findall(r'(?:src|href)="([^"]+)"',html):
        local=href.split('?')[0]
        if local.startswith(('http','#','data:')) or local=='static/planning/insights.js':continue
        if not (root/local).is_file():raise ValidationError('Recurso local faltante: '+local)
    if 'id="importBtn"' in html or 'type="file"' in html:raise ValidationError('La entrada todavía contiene el flujo Cargar.')
    return base,insights


def atomic_write(path,text):
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix='.map-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as f:f.write(text);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def main(argv=None):
    p=argparse.ArgumentParser(description='Actualiza y valida el mapa Centro Norte sin instalación adicional.')
    p.add_argument('--check',action='store_true',help='Valida también que la vista publicada coincida con el Excel, sin escribir.')
    p.add_argument('--no-open',action='store_true');p.add_argument('--root',type=Path,default=Path(__file__).resolve().parent)
    args=p.parse_args(argv);root=args.root.resolve();folder=root/'static/planning'
    try:
        base,insights=prepare(root)
        if args.check:
            stored=read_js(folder/'base.js','MAPA_BASE');health=read_js(folder/'insights.js','MAPA_INSIGHTS')
            if stored['metadata'].get('signature')!=base['metadata']['signature'] or stored['metadata'].get('geography_signature')!=base['metadata']['geography_signature'] or health.get('signature')!=base['metadata']['signature'] or health.get('status')!='valid':
                raise ValidationError('La vista no coincide con el Excel. Ejecuta ACTUALIZAR_MAPA.py y sube base.js e insights.js.')
            if any(s.get('region') not in base['metadata']['regional_rules']['regions'] for s in stored['stores']):raise ValidationError('Hay tiendas con región desconocida.')
            if stored['metadata'].get('regional_rules')!=base['metadata']['regional_rules']:raise ValidationError('Actualiza la vista para aplicar las reglas regionales vigentes.')
            for key in ('counts','regions','warnings','corrections','confirmed_locations','dms','nearest','checks'):
                if health.get(key)!=insights.get(key):raise ValidationError('La revisión no coincide con los datos: '+key+'. Ejecuta ACTUALIZAR_MAPA.py.')
            if digest(stored['stores'])!=base['metadata']['signature']:raise ValidationError('La instantánea contiene datos alterados o desactualizados.')
            html=(root/'index.html').read_text(encoding='utf-8')
            for filename in ('base.js','insights.js'):
                if 'static/planning/'+filename+'?v='+base['metadata']['signature'] not in html:raise ValidationError('La entrada no referencia la última base. Ejecuta ACTUALIZAR_MAPA.py.')
        else:
            # Las firmas de ambos archivos deben coincidir para que la interfaz muestre verde.
            atomic_write(folder/'base.js','window.MAPA_BASE = '+json.dumps(base,ensure_ascii=False,separators=(',',':'))+';\n')
            atomic_write(folder/'insights.js','window.MAPA_INSIGHTS = '+json.dumps(insights,ensure_ascii=False,separators=(',',':'))+';\n')
            html=(root/'index.html').read_text(encoding='utf-8')
            for filename in ('base.js','insights.js'):
                html=re.sub(r'static/planning/'+re.escape(filename)+r'(?:\?v=[^"\s]+)?','static/planning/'+filename+'?v='+base['metadata']['signature'],html)
            atomic_write(root/'index.html',html)
        c=insights['counts'];print(f"VALIDADO: {REGION} {c['regional_current']} actuales + {c['regional_openings']} aperturas | {c['external']} externas | {c['total']} ubicaciones | {c['review']} por revisar")
        if not args.check and not args.no_open:webbrowser.open((root/'index.html').as_uri())
        return 0
    except (ValidationError,OSError,ValueError,KeyError,zipfile.BadZipFile,ET.ParseError) as exc:
        errors=exc.errors if isinstance(exc,ValidationError) else [str(exc)]
        print('REVISION NECESARIA:\n'+'\n'.join(errors),file=sys.stderr)
        if not args.check and folder.is_dir():
            atomic_write(folder/'insights.js','window.MAPA_INSIGHTS = '+json.dumps({'status':'blocked','region':REGION,'errors':errors},ensure_ascii=False)+';\n')
        return 2


if __name__=='__main__':raise SystemExit(main())
