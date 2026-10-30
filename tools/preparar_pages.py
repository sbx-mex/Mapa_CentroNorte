"""Prepara únicamente mapa, recursos y el Excel CMS para GitHub Pages."""
from pathlib import Path
import argparse
import shutil


def build(root,output):
    root=Path(root).resolve();output=Path(output).resolve()
    if output==root or root in output.parents and output.name in ('static','cms','data'):
        raise ValueError('El destino debe ser una carpeta de salida independiente.')
    if output.exists() and any(output.iterdir()):raise ValueError('La carpeta de salida debe estar vacía.')
    output.mkdir(parents=True,exist_ok=True)
    shutil.copy2(root/'index.html',output/'index.html')
    shutil.copytree(root/'static',output/'static',ignore=shutil.ignore_patterns('__pycache__'))
    (output/'cms').mkdir();shutil.copy2(root/'cms/Mapa_CentroNorte_CMS.xlsx',output/'cms/Mapa_CentroNorte_CMS.xlsx')
    (output/'directorio').mkdir()
    html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head>\n  <base href="../">',1).replace('<body class=','<body data-open-directory="true" class=',1)
    (output/'directorio/index.html').write_text(html,encoding='utf-8')
    (output/'.nojekyll').touch()
    if (root/'CNAME').is_file():shutil.copy2(root/'CNAME',output/'CNAME')
    print('Sitio preparado desde el mismo CMS: '+str(output))
    return output


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();build(Path(__file__).resolve().parents[1],args.output)
