#!/usr/bin/env python3
"""Descarga las imágenes de producto y las enlaza en data/productos.json.

Uso (desde la carpeta del sitio, en un computador con acceso a salcobrand.cl):
  1. Crea imagenes.csv con dos columnas:  id,url_imagen
     (el id es el de data/productos.json; la URL es la de la imagen del producto en el sitio)
  2. python3 tools/descargar-imagenes.py imagenes.csv
Las imágenes quedan en img/productos/<id>.<ext> y el campo "imagen" se actualiza.
Usa solo imágenes sobre las que Salcobrand tenga derechos o autorización.
"""
import csv, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cat_path = os.path.join(ROOT, 'data', 'productos.json')
cat = json.load(open(cat_path, encoding='utf-8'))
prods = cat if isinstance(cat, list) else cat.get('productos', cat)
by_id = {p['id']: p for p in prods}
os.makedirs(os.path.join(ROOT, 'img', 'productos'), exist_ok=True)

for row in csv.DictReader(open(sys.argv[1], encoding='utf-8')):
    pid, url = row['id'].strip(), row['url_imagen'].strip()
    if pid not in by_id or not url:
        print('omitido:', pid); continue
    ext = os.path.splitext(url.split('?')[0])[1].lower()
    ext = ext if ext in ('.jpg', '.jpeg', '.png', '.webp') else '.jpg'
    dest = os.path.join(ROOT, 'img', 'productos', pid + ext)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        open(dest, 'wb').write(urllib.request.urlopen(req, timeout=30).read())
        by_id[pid]['imagen'] = 'img/productos/' + pid + ext
        print('ok:', pid)
    except Exception as e:
        print('error:', pid, e)

json.dump(cat, open(cat_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
