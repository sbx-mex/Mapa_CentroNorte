import copy
from contextlib import redirect_stderr
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('quality',ROOT/'ACTUALIZAR_MAPA.py')
q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)


class QualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.geo=q.read_js(ROOT/'static/planning/geography.js','MAPA_GEO')
        cls.rows,cls.date1904=q.read_locations(ROOT/'cms/Mapa_CentroNorte_CMS.xlsx')

    def row(self,cc='70001'):
        return (2,{'CC':cc,'Nombre Tienda':'Ubicacion de prueba','DM':'DM nuevo','Fecha Apertura':'','Municipio':'Tepotzotlan','Cobertura':'Estado de México','Latitud':'19.74010','Longitud':'-99.21133','Activa':'Sí'})

    def test_future_base_can_have_different_dm_count_and_store_count(self):
        a=self.row();b=self.row('70002');b[1]['DM']='Otro DM futuro'
        stores,_,_=q.normalize_rows([a,b],self.geo)
        self.assertEqual(len(stores),2);self.assertEqual(len({s['dm'] for s in stores}),2)
        self.assertTrue(all(s['region']=='Centro Norte' for s in stores))

    def test_empty_opening_date_is_opening_and_real_date_is_current(self):
        a=self.row();b=self.row('70002');b[1]['Fecha Apertura']='2026-09-01'
        stores,_,_=q.normalize_rows([a,b],self.geo)
        self.assertEqual([s['status'] for s in stores],['Apertura','Actual'])

    def test_invalid_dates_are_blocked_and_both_excel_date_systems_supported(self):
        self.assertEqual(q.excel_date('1',True),'1904-01-02')
        self.assertEqual(q.excel_date('46023.75'),'2026-01-01')
        with self.assertRaises(q.ValidationError):q.excel_date('31/02/2026')

    def test_duplicate_ceco_and_missing_dm_are_blocked(self):
        with self.assertRaisesRegex(q.ValidationError,'duplicado'):q.normalize_rows([self.row(),self.row()],self.geo)
        r=self.row();r[1]['DM']=' '
        with self.assertRaisesRegex(q.ValidationError,'obligatorios'):q.normalize_rows([r],self.geo)

    def test_invalid_or_nonfinite_coordinates_are_blocked(self):
        for value in ('nan','inf','900','19,7','texto',''):
            r=self.row();r[1]['Latitud']=value
            with self.subTest(value=value),self.assertRaises(q.ValidationError):q.normalize_rows([r],self.geo)

    def test_trailing_comma_is_normalized_but_original_value_not_reestimated(self):
        r=self.row();r[1]['Latitud']='19.74010, '
        stores,_,corrections=q.normalize_rows([r],self.geo)
        self.assertEqual(stores[0]['latitude'],19.7401);self.assertEqual(len(corrections),1)

    def test_outside_background_is_visible_as_review_not_silently_dropped(self):
        r=self.row();r[1]['Latitud']='25';r[1]['Longitud']='-103'
        stores,warnings,_=q.normalize_rows([r],self.geo)
        self.assertEqual(len(stores),1);self.assertEqual(warnings[0]['kind'],'outside')

    def test_haversine_reference(self):
        a={'latitude':0,'longitude':0};b={'latitude':0,'longitude':1}
        self.assertAlmostEqual(q.distance(a,b),111.19508,places=4);self.assertEqual(q.distance(a,a),0)

    def test_snapshot_and_quality_match_the_actual_workbook(self):
        base,health=q.prepare(ROOT);stored=q.read_js(ROOT/'static/planning/base.js','MAPA_BASE')
        self.assertEqual(health['counts']['total'],len(base['stores']))
        self.assertEqual(base['metadata']['signature'],stored['metadata']['signature'])
        self.assertTrue(all(s['region'] in q.regional_rules()['regions'] for s in stored['stores']))

    def test_region_origins_and_national_options(self):
        base,health=q.prepare(ROOT)
        self.assertEqual(health['counts']['regional_current'],73)
        self.assertEqual(health['counts']['regional_openings'],3)
        self.assertEqual(health['counts']['external'],27)
        self.assertEqual(sum(s['region']=='Bajío' for s in base['stores']),14)
        self.assertEqual(sum(s['region']=='Centro Sur' for s in base['stores']),13)

    def test_explicit_future_region_wins_over_dm_inference(self):
        a=self.row();a[1]['DM']='David Carrasco'
        b=self.row('70002');b[1]['DM']='Mónica Morales'
        c=self.row('70003');c[1]['DM']='DM nuevo';c[1]['Región']='Centro Poniente'
        stores,_,_=q.normalize_rows([a,b,c],self.geo)
        self.assertEqual([s['region'] for s in stores],['Bajío','Centro Sur','Centro Poniente'])
        c[1]['Región']='Desconocida'
        with self.assertRaisesRegex(q.ValidationError,'Región inválida'):q.normalize_rows([c],self.geo)

    def test_confirmed_toreo_keeps_original_coordinate_and_has_no_warning(self):
        stores,warnings,_=q.normalize_rows(self.rows,self.geo,self.date1904)
        s=next(s for s in stores if s['cc']=='43302')
        self.assertEqual(s['latitude'],19.4506098125196)
        self.assertEqual(s['longitude'],-99.2180774805589)
        self.assertTrue(s['location_verification'])
        self.assertFalse(any(w['cc']==s['cc'] for w in warnings))

    def test_location_confirmation_does_not_hide_a_future_coordinate_change(self):
        rows=copy.deepcopy(self.rows)
        for _,row in rows:
            if row.get('CC')=='43302':row['Latitud']='19.4326';row['Longitud']='-99.1332'
        stores,warnings,_=q.normalize_rows(rows,self.geo,self.date1904)
        s=next(s for s in stores if s['cc']=='43302')
        self.assertNotIn('location_verification',s)
        self.assertTrue(any(w['cc']==s['cc'] for w in warnings))

    def test_check_rejects_incorrect_green_regional_totals(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d)/'project'
            shutil.copytree(ROOT,r,ignore=shutil.ignore_patterns('.git','preview','.openai','__pycache__'))
            health=q.read_js(r/'static/planning/insights.js','MAPA_INSIGHTS')
            health['counts']['regional_current']=999
            q.atomic_write(r/'static/planning/insights.js','window.MAPA_INSIGHTS = '+json.dumps(health)+';\n')
            with redirect_stderr(io.StringIO()):self.assertEqual(q.main(['--root',str(r),'--check']),2)

    def test_failed_update_preserves_base_and_marks_health_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);(r/'static/planning').mkdir(parents=True);(r/'cms').mkdir()
            for name in ('base.js','geography.js','insights.js','regional-rules.json'):shutil.copy2(ROOT/'static/planning'/name,r/'static/planning'/name)
            (r/'cms/Mapa_CentroNorte_CMS.xlsx').write_bytes(b'Excel no valido')
            previous=(r/'static/planning/base.js').read_bytes()
            with redirect_stderr(io.StringIO()):self.assertEqual(q.main(['--root',str(r),'--no-open']),2)
            self.assertEqual((r/'static/planning/base.js').read_bytes(),previous)
            self.assertEqual(q.read_js(r/'static/planning/insights.js','MAPA_INSIGHTS')['status'],'blocked')

    def test_no_public_file_upload_or_import_button(self):
        html=(ROOT/'index.html').read_text()
        self.assertNotIn('id="importBtn"',html);self.assertNotIn('type="file"',html)
        self.assertIn('insights.js',html);self.assertNotIn('xlsx.full.min.js',html)


if __name__=='__main__':unittest.main()
