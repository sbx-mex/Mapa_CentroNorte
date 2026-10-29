"""Compatibilidad: una sola preparación de mapa, con validación de Python."""
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ACTUALIZAR_MAPA import main
if __name__ == '__main__':
    args = sys.argv[1:]
    if '--no-open' not in args: args.append('--no-open')
    raise SystemExit(main(args))
