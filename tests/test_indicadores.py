import math
import tempfile
from unittest.mock import patch
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from preparar_indicadores import build_rows
from cms_service import _to_float
from cms_service import apply_cms_workbook


class PerfilIntegrationTests(unittest.TestCase):
    def fixture(self):
        headers=['Rolling RY','TPLH','IPLH','Labor','Labor PPTO','Conexion','Bebida','Costo %','Costo % PPTO','EBITDA','EBITDA PPTO','DT Time','Tiempo DT AA']
        return {'schemaVersion':2,'engineInfo':{'business':{'year':2026}},'months':[{'id':1,'period':'202601'},{'id':2,'period':'202602'}],
            'metricHeaders':headers,'profile':{'70001':{
                '1':[.3,5,10,.1,.12,.5,.6,.3,.32,.2,.18,60,80],
                '2':[.4,7,20,.2,None,.7,.8,.4,.36,.3,.25,90,None]}},
            'business':{'70001':{'1':{'sales':100,'salesBudget':200,'omtDiff':-1},'2':{'sales':300,'salesBudget':200,'omtDiff':3}}}}

    def test_aggregates_use_source_rules_and_comparable_months(self):
        row=build_rows(self.fixture(),[{'CC':'70001'}],'source-commit','sha')[0]
        self.assertEqual(row['Rolling'],.4)
        self.assertEqual(row['IPLH'],15)
        self.assertEqual(row['Ventas MXN'],400)
        self.assertEqual(row['Dif Ppto'],0)
        self.assertAlmostEqual(row['Dif Labor'],-.02)
        self.assertEqual(row['OMT'],1)
        self.assertEqual(row['DT Time'],'01:15')
        self.assertEqual(row['Tiempo DT AA'],'01:20')
        self.assertEqual(row['Corte Perfil'],'2026-02-28')
        self.assertEqual(row['Fuente Commit'],'source-commit')

    def test_missing_store_or_metric_stays_blank_not_zero_or_other_score(self):
        rows=build_rows(self.fixture(),[{'CC':'70001'},{'CC':'70002'}])
        for row in rows:
            self.assertIsNone(row['NPS']);self.assertIsNone(row['CTC'])
        self.assertIsNone(rows[1]['Ventas MXN'])
        self.assertIsNone(rows[1]['Rolling'])
        self.assertIsNone(rows[1]['Corte Perfil'])
        self.assertIsNone(rows[1]['Fuente Indicadores'])

    def test_missing_budget_does_not_make_a_false_zero_variance(self):
        payload=self.fixture()
        for row in payload['business']['70001'].values():row['salesBudget']=None
        self.assertIsNone(build_rows(payload,[{'CC':'70001'}])[0]['Dif Ppto'])

    def test_invalid_source_period_and_duplicate_metric_headers_are_blocked(self):
        payload=self.fixture();payload['months'][0]['period']='202501'
        with self.assertRaisesRegex(ValueError,'periodos'):build_rows(payload,[{'CC':'70001'}])
        payload=self.fixture();payload['metricHeaders'].append('IPLH')
        with self.assertRaisesRegex(ValueError,'duplicados'):build_rows(payload,[{'CC':'70001'}])

    def test_cms_rejects_nonfinite_metric_but_retains_zero_and_blank(self):
        errors=[]
        self.assertIsNone(_to_float('', 'Metric', errors))
        self.assertEqual(_to_float('0', 'Metric', errors),0)
        for value in ('nan','inf','-inf'):
            self.assertIsNone(_to_float(value,'Metric',errors))
        self.assertEqual(len(errors),3)

    def test_failed_import_restores_cms_and_derived_files(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            paths=[folder/'cms.xlsx',folder/'stores.json',folder/'data.csv']
            old=[b'previous cms',b'previous json',b'previous csv']
            for path,raw in zip(paths,old):path.write_bytes(raw)
            incoming=folder/'incoming.xlsx';incoming.write_bytes(b'new cms')
            def fail(*args,**kwargs):
                paths[1].write_bytes(b'partial json');paths[2].write_bytes(b'partial csv')
                raise OSError('Interrupted update')
            with patch('cms_service.workbook_to_payload',return_value={}),patch('cms_service.synchronize_outputs',side_effect=fail):
                with self.assertRaisesRegex(OSError,'Interrupted'):apply_cms_workbook(incoming,*paths)
            self.assertEqual([p.read_bytes() for p in paths],old)


if __name__=='__main__':unittest.main()
