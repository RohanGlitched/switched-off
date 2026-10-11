import json, math, re
import shapefile
from shapely.geometry import shape, Point
from shapely.strtree import STRtree
from shapely.ops import unary_union

r = shapefile.Reader('2011_Dist')
TELANGANA = {'Adilabad','Nizamabad','Karimnagar','Medak','Hyderabad','Rangareddy','Mahbubnagar','Nalgonda','Warangal','Khammam'}
LADAKH = {'Leh(Ladakh)','Kargil'}
STATE_FIX = {'Andaman & Nicobar Island':'Andaman and Nicobar Islands','Dadara & Nagar Havelli':'Dadra and Nagar Haveli and Daman and Diu','Daman & Diu':'Dadra and Nagar Haveli and Daman and Diu','Jammu & Kashmir':'Jammu and Kashmir','NCT of Delhi':'Delhi','Arunanchal Pradesh':'Arunachal Pradesh','Puducherry':'Puducherry'}
CODES = {'Andhra Pradesh':'AP','Arunachal Pradesh':'AR','Assam':'AS','Bihar':'BR','Chhattisgarh':'CT','Goa':'GA','Gujarat':'GJ','Haryana':'HR','Himachal Pradesh':'HP','Jharkhand':'JH','Karnataka':'KA','Kerala':'KL','Madhya Pradesh':'MP','Maharashtra':'MH','Manipur':'MN','Meghalaya':'ML','Mizoram':'MZ','Nagaland':'NL','Odisha':'OD','Punjab':'PB','Rajasthan':'RJ','Sikkim':'SK','Tamil Nadu':'TN','Telangana':'TS','Tripura':'TR','Uttar Pradesh':'UP','Uttarakhand':'UK','West Bengal':'WB','Andaman and Nicobar Islands':'AN','Chandigarh':'CH','Dadra and Nagar Haveli and Daman and Diu':'DH','Delhi':'DL','Jammu and Kashmir':'JK','Ladakh':'LA','Lakshadweep':'LD','Puducherry':'PY'}
districts, geoms = [], []
for i, sr in enumerate(r.shapeRecords()):
    name, st = sr.record['DISTRICT'].strip(), sr.record['ST_NM'].strip()
    st = STATE_FIX.get(st, st)
    if name in TELANGANA and st == 'Andhra Pradesh': st = 'Telangana'
    if name.lower().startswith('leh') or name == 'Kargil': st = 'Ladakh'
    if name == 'Data Not Available': name = 'Area without census district data'
    if st not in CODES: print('UNKNOWN STATE', st, name)
    g = shape(sr.shape.__geo_interface__).buffer(0)
    c = g.representative_point()
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    districts.append({'id': f"{CODES.get(st,'XX')}-{slug}", 'name': re.sub(r'\s*\((?i:ladakh)\)', '', name), 'state': st, 'code': CODES.get(st,'XX'), 'lon': round(c.x, 3), 'lat': round(c.y, 3)})
    geoms.append(g)
tree = STRtree(geoms)
outline = unary_union([shape(f['geometry']).buffer(0) for f in json.load(open('india-composite.geojson'))['features']])
minx, miny, maxx, maxy = outline.bounds
STEP = 0.26
dots = []
y = miny
while y <= maxy:
    # equal-ish spacing on the ground: widen the lon step with latitude
    sx = STEP / math.cos(math.radians(y))
    x = minx + ((round((y - miny) / STEP)) % 2) * sx / 2
    while x <= maxx:
        p = Point(x, y)
        if outline.contains(p):
            hit = -1
            for gi in tree.query(p):
                if geoms[gi].contains(p): hit = int(gi); break
            dots.append([round(x, 3), round(y, 3), hit])
        x += sx
    y += STEP
# every district gets at least one light, even the smallest (Mahe, Delhi's districts...)
have = {d[2] for d in dots}
for i, d in enumerate(districts):
    if i not in have: dots.append([d['lon'], d['lat'], i])
print('districts', len(districts), 'dots', len(dots), 'unassigned', sum(1 for d in dots if d[2] < 0))
json.dump({'bounds': [round(minx,3), round(miny,3), round(maxx,3), round(maxy,3)], 'districts': districts, 'dots': dots}, open('india-dots.json', 'w'), separators=(',', ':'))
# a light outline for the edge, simplified hard
simp = outline.simplify(0.05, preserve_topology=True)
json.dump(simp.__geo_interface__, open('india-outline.json', 'w'), separators=(',', ':'))
import os; print('dots json', os.path.getsize('india-dots.json'), 'outline', os.path.getsize('india-outline.json'))
