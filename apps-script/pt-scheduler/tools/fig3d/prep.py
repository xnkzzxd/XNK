# Spike T-1630: Z-Anatomy Startup.blend -> work.blend (muscles tagged by library target + plain body parts).
import bpy, sys, re, mathutils
src, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src, use_scripts=False)
TARGETS = [
  ('pectorals', r'pectoralis major'), ('delts', r'deltoid'), ('biceps', r'biceps brachii|brachialis muscle|coracobrachialis'),
  ('triceps', r'triceps brachii|anconeus'), ('lats', r'latissimus dorsi|teres major'),
  ('traps', r'descending part of trapezius'), ('upper back', r'(transverse|ascending) part of trapezius|rhomboid|infraspinatus|teres minor|supraspinatus'),
  ('spine', r'iliocostalis (lumborum|thoracis)|longissimus thoracis|spinalis thoracis|multifidus (lumborum|thoracis)|quadratus lumborum'),
  ('abs', r'rectus abdominis|abdominal oblique|pyramidalis'), ('glutes', r'gluteus maximus'), ('abductors', r'gluteus medius|tensor fasciae'),
  ('quads', r'rectus femoris|vastus'), ('hamstrings', r'biceps femoris|semitendinosus|semimembranosus'),
  ('adductors', r'adductor (brevis|longus|magnus|minimus)|gracilis|pectineus'), ('calves', r'gastrocnemius|soleus|plantaris|calcaneal tendon'),
  ('forearms', r'carpi|digitorum (superficialis|profundus)|extensor (digitorum|digiti minimi|indicis|pollicis)|flexor pollicis longus|abductor pollicis longus|brachioradialis|pronator|supinator|palmaris longus'),
]
bad = re.compile(r'fascia|bursa|sheath|retinacul|septum|aponeuros|ligament|tendinous|tract|tarsus|arch|membrane|raphe|trochlea|ring|hair|foot|hallucis|plantae|extensor digitorum (brevis|longus)|flexor digitorum (brevis|longus)', re.I)
def center(o):
    v = mathutils.Vector((0, 0, 0))
    for c in o.bound_box: v += o.matrix_world @ mathutils.Vector(c)
    return v / 8
keep = {}
for o in bpy.data.collections['4: Muscular system'].all_objects:
    if o.type != 'MESH' or not o.name.endswith(('.l', '.r')) or len(o.data.vertices) < 50: continue
    low = o.name.lower()
    tgt = next((t for t, rx in TARGETS if re.search(rx, low)), None)
    if not tgt and bad.search(low): continue
    if tgt == 'forearms' and re.search(r'foot|hallucis', low): tgt = None
    c = center(o)
    if not tgt and c.z > 1.50: continue                 # face / skull muscles: the head is a plain shape
    keep[o.name] = tgt or 'body'
bones = 0
for o in bpy.data.collections['1: Skeletal system'].all_objects:
    if o.type == 'MESH' and len(o.data.vertices) > 400 and not re.search(r'tooth|teeth|incisor|molar|canine|hyoid|ossicle|stapes|malleus|incus', o.name, re.I):
        keep[o.name] = 'bone'; bones += 1
skin = 0
for o in bpy.data.collections['9: Regions of human body'].all_objects:
    if o.type != 'MESH' or len(o.data.vertices) < 8 or re.search(r'hair|\.g$', o.name, re.I): continue
    c = center(o)
    if c.z > 1.47 or c.z < 0.085 or abs(c.x) > 0.36 or (abs(c.x) > 0.30 and c.z < 0.95):
        keep[o.name] = 'skin'; skin += 1
print('muscles', sum(1 for v in keep.values() if v not in ('bone', 'skin')), 'bones', bones, 'skin', skin)
from collections import Counter
print(Counter(keep.values()))
for o in list(bpy.data.objects):
    if o.name not in keep: bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    o['tgt'] = keep[o.name]
    o.hide_viewport = False; o.hide_render = False; o.hide_set(False) if o.name in bpy.context.view_layer.objects else None
    for m in list(o.modifiers): o.modifiers.remove(m)
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    o.data.materials.clear()
for b in ('Humerus', 'Femur', 'Tibia', 'Radius', 'Ulna', 'Scapula', 'Clavicle', 'Hip bone', 'Talus', 'Calcaneus', 'Atlas', 'Sacrum', 'Skull'):
    print(b, [(o.name, [round(x, 3) for x in center(o)], [round(x, 3) for x in o.dimensions]) for o in bpy.data.objects if o.name.lower().startswith(b.lower()) and o['tgt'] == 'bone'][:3])
for n in ('Gluteus maximus muscle.r', 'Rectus abdominis muscle.r'):
    print(n, [round(x, 3) for x in center(bpy.data.objects[n])])
bpy.ops.outliner.orphans_purge(do_recursive=True) if hasattr(bpy.ops.outliner, 'orphans_purge') else None
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
