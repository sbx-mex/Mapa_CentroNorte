"""Construye los datos locales del mapa desde el CMS y el servicio INEGI.

Uso: python tools/build_remaster.py [--geo-cache DIRECTORIO]
Las librerías de visualización se distribuyen con sus licencias en static/vendor.
No escribe ni modifica el Excel.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from cms_service import workbook_to_payload, payload_to_csv_bytes


def pip(point, ring):
    x, y = point; inside = False; j = len(ring) - 1
    for i, (xi, yi, *_) in enumerate(ring):
        xj, yj = ring[j][:2]
        if ((yi > y) != (yj > y)) and x < (xj-xi)*(y-yi)/(yj-yi)+xi:
            inside = not inside
        j = i
    return inside


def contains(point, geometry):
    polys = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    return any(pip(point, p[0]) and not any(pip(point, hole) for hole in p[1:]) for p in polys)


def flatten(coords):
    if isinstance(coords[0], (int, float)):
        yield coords
    else:
        for c in coords: yield from flatten(c)


def rdp(points, epsilon=0.00022):
    if len(points) <= 2: return points
    ax, ay = points[0][:2]; bx, by = points[-1][:2]; vx, vy = bx-ax, by-ay
    den = vx*vx + vy*vy
    def distance(p):
        t = max(0, min(1, ((p[0]-ax)*vx+(p[1]-ay)*vy)/den)) if den else 0
        return (p[0]-ax-t*vx)**2 + (p[1]-ay-t*vy)**2
    i = max(range(1, len(points)-1), key=lambda n: distance(points[n]))
    if distance(points[i]) <= epsilon*epsilon: return [points[0], points[-1]]
    return rdp(points[:i+1], epsilon)[:-1] + rdp(points[i:], epsilon)


def simplified(geometry):
    def ring(r):
        mid = len(r)//2
        reduced = rdp(r[:mid+1])[:-1] + rdp(r[mid:])
        if len(reduced) < 4: reduced = r
        return [[round(v, 5) for v in point[:2]] for point in reduced]
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    polys = [[ring(r) for r in polygon] for polygon in polygons]
    return {'type': 'MultiPolygon', 'coordinates': polys}


def region(point):
    lng, lat = point
    dx = (lng + 99.1332) * 0.943; dy = lat - 19.4326
    if dx*dx + dy*dy <= 0.115**2: return 'Centro'
    if abs(dx) > abs(dy): return 'Oriente' if dx > 0 else 'Poniente'
    return 'Norte' if dy > 0 else 'Sur'


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--geo-cache', type=Path); args = parser.parse_args()
    cache = args.geo_cache or ROOT / '.geo-cache'; cache.mkdir(exist_ok=True)
    features = []; neighbors = []; sources = []
    for state, kind in [('09','mgem'),('15','mgem'),('13','mgem'),('17','mgee'),('21','mgee'),('29','mgee'),('16','mgee'),('22','mgee')]:
        url = f'https://gaia.inegi.org.mx/wscatgeo/v2/geo/{kind}/{state}'
        path = cache / ('inegi15.raw' if state == '15' else f'{state}.raw')
        if not path.exists():
            with urllib.request.urlopen(url, timeout=60) as response: path.write_bytes(response.read())
        collection = json.loads(path.read_text())
        sources.append({'url': url, 'metadata': collection.get('metadatos', {})})
        for f in collection['features']:
            prop = f['properties']; raw = f['geometry']; coords = list(flatten(raw['coordinates']))
            bbox = [min(p[0] for p in coords),min(p[1] for p in coords),max(p[0] for p in coords),max(p[1] for p in coords)]
            # Centro de caja solo determina la zona visual inicial, no una región oficial.
            center = [(bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2]
            result = {'type':'Feature','properties':{'id':prop['cvegeo'],'name':prop['nomgeo'],'state':state,'region':region(center),'center':center,'bbox':bbox}, 'geometry':simplified(raw)}
            if kind == 'mgem':
                result['_raw'] = raw; features.append(result)
            else: neighbors.append(result)
    payload = workbook_to_payload(ROOT / 'cms/Mapa_CentroNorte_CMS.xlsx')
    stores = []; unmatched = []; conflicts = []
    for s in payload['stores']:
        point = [s['longitude'],s['latitude']]
        match = None
        for f in features:
            b = f['properties']['bbox']
            if b[0] <= point[0] <= b[2] and b[1] <= point[1] <= b[3] and contains(point, f['_raw']):
                match = f['properties']; break
        s.update({'municipality_id':match['id'] if match else None,'geo_municipality':match['name'] if match else None,'region':match['region'] if match else region(point),'status':'Apertura' if not s['opening_date'] else 'Actual'})
        stores.append(s)
        if not match: unmatched.append(s['cc'])
        elif {'09':'Ciudad De México','15':'Estado De México','13':'Hidalgo'}[match['state']] != s['coverage']: conflicts.append(s['cc'])
    for f in features: f.pop('_raw', None)
    stores.sort(key=lambda s: s['cc'])
    signature = hashlib.sha256(json.dumps(stores,ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:16]
    output = ROOT / 'static' / 'planning'; output.mkdir(parents=True,exist_ok=True)
    data = {'metadata':{'version':'3.0.0','signature':signature,'source':'Mapa_CentroNorte_CMS(2).xlsx','source_repo':'sbx-mex/Mapa_CentroNorte','source_commit':'53f6e9b2001880ceefb7f741352b860436121d26','store_count':len(stores),'no_metrics':payload['metadata']['locations_without_metrics'],'unmatched_geography':unmatched,'state_conflicts':conflicts,'geography':sources,'regionalization':'Propuesta por orientación respecto al Zócalo: centro a 0.115 grados, resto por eje dominante. Ajustable por municipio; no es una regionalización INEGI.'},'stores':stores}
    (output/'base.js').write_text('window.MAPA_BASE = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
    (output/'geography.js').write_text('window.MAPA_GEO = '+json.dumps({'municipalities':{'type':'FeatureCollection','features':features},'neighbors':{'type':'FeatureCollection','features':neighbors}},ensure_ascii=False,separators=(',',':'))+';\n')
    (ROOT/'data/stores.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'data.csv').write_bytes(payload_to_csv_bytes(payload))
    (output/'sources.json').write_text(json.dumps(data['metadata'],ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'stores':len(stores),'dm':sorted(set(s['dm'] for s in stores)),'aperturas':[s['cc'] for s in stores if s['status']=='Apertura'],'municipalities':len(features),'neighbors':len(neighbors),'unmatched':unmatched,'state_conflicts':conflicts,'geography_bytes':(output/'geography.js').stat().st_size},ensure_ascii=False))


if __name__ == '__main__': main()
