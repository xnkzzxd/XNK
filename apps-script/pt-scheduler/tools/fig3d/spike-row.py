# Spike T-1630: stylised mannequin from work.blend, own skinning (numpy LBS), Seated Cable Row frames -> beauty + mask PNGs.
import bpy, sys, re, math, json, os
import numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
BLEND, FRAMES, OUT = argv[0], argv[1], argv[2]
ONLY = [int(x) for x in argv[3].split(',')] if len(argv) > 3 else None
RES = int(argv[4]) if len(argv) > 4 else 640
bpy.ops.wm.open_mainfile(filepath=BLEND)
sc = bpy.context.scene
V3 = lambda *a: np.array(a, dtype=np.float64)
unit = lambda v: v / (np.linalg.norm(v) + 1e-12)

# ── 1. clean-up + stylise ─────────────────────────────────────────────────────────────────────────
def wverts(o):
    n = len(o.data.vertices); a = np.empty(n * 3); o.data.vertices.foreach_get('co', a); a = a.reshape(n, 3)
    m = np.array(o.matrix_world); return a @ m[:3, :3].T + m[:3, 3]
for o in list(bpy.data.objects):
    if o.type != 'MESH' or max(o.dimensions) > 1.2 or re.search(r'system|platysma|\.g$', o.name, re.I): bpy.data.objects.remove(o, do_unlink=True)
objs = [o for o in bpy.data.objects if o.type == 'MESH']
for o in objs:                       # bake world transform into the mesh: all maths below is in world space
    o.data = o.data.copy(); co = wverts(o); neg = np.linalg.det(np.array(o.matrix_world)[:3, :3]) < 0
    o.data.vertices.foreach_set('co', co.ravel()); o.matrix_world.identity()
    if neg: o.data.flip_normals()
    o.data.update()
cen = {o.name: wverts(o).mean(0) for o in objs}
# Head: one plain shape without a face (skin regions above the chin are remeshed and smoothed together).
head = [o for o in objs if o['tgt'] == 'skin' and cen[o.name][2] > 1.50]
for o in [o for o in objs if o['tgt'] == 'skin' and 1.40 < cen[o.name][2] <= 1.50]: bpy.data.objects.remove(o, do_unlink=True)
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o['tgt'] in ('bone', 'body') and cen[o.name][2] > 1.56]: bpy.data.objects.remove(o, do_unlink=True)
import bmesh
bm = bmesh.new()
for o in head: bm.from_mesh(o.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
hm = bpy.data.meshes.new('Head'); bm.to_mesh(hm); bm.free()
for o in head: bpy.data.objects.remove(o, do_unlink=True)
H = bpy.data.objects.new('Head', hm); sc.collection.objects.link(H); H['tgt'] = 'skin'
bpy.ops.object.select_all(action='DESELECT'); H.select_set(True); bpy.context.view_layer.objects.active = H
print('head verts', len(H.data.vertices), [round(x, 3) for x in H.dimensions])
hv = wverts(H); hc = (hv.max(0) + hv.min(0)) / 2
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=hc.tolist(), segments=64, ring_count=40); Sph = bpy.context.object
m = Sph.modifiers.new('w', 'SHRINKWRAP'); m.target = H; m.wrap_method = 'NEAREST_SURFACEPOINT'
m2 = Sph.modifiers.new('s', 'SMOOTH'); m2.factor = 0.6; m2.iterations = int(os.environ.get('HEADSMOOTH', '14'))
bpy.ops.object.modifier_apply(modifier='w'); bpy.ops.object.modifier_apply(modifier='s')
bpy.data.objects.remove(H, do_unlink=True); H = Sph; H.name = 'Head'; H['tgt'] = 'skin'
co = wverts(H); H.data.vertices.foreach_set('co', co.ravel()); H.matrix_world.identity(); H.data.update()
print('head', len(H.data.vertices), [round(x, 3) for x in H.dimensions])
objs = [o for o in bpy.data.objects if o.type == 'MESH']
REST = {o.name: wverts(o) for o in objs}
cen = {k: v.mean(0) for k, v in REST.items()}
print('objects', len(objs), 'verts', sum(len(v) for v in REST.values()))

# ── 2. joints from the bones ──────────────────────────────────────────────────────────────────────
def ends(name, cut=0.03):
    v = REST[name]; z = v[:, 2]
    return v[z > z.max() - cut].mean(0), v[z < z.min() + cut].mean(0)
J = {}
for side, sg in (('l', 1), ('r', -1)):
    f = REST['Femur.' + side]; top = f[f[:, 2] > f[:, 2].max() - 0.05]; ax = np.abs(top[:, 0])
    J['hip.' + side] = top[ax < ax.min() + 0.05].mean(0)
    J['knee.' + side] = ends('Tibia.' + side, 0.02)[0] + V3(0, 0, 0.012)
    J['ankle.' + side] = REST['Talus.' + side].mean(0) + V3(0, 0, 0.012)
    J['toe.' + side] = J['ankle.' + side] + V3(sg * 0.012, -0.17, -0.07)
    J['heel.' + side] = J['ankle.' + side] + V3(0, 0.05, -0.06)
    J['sh.' + side], J['elbow.' + side] = ends('Humerus.' + side)
    J['wrist.' + side] = ends('Ulna.' + side, 0.02)[1]
    d = unit(J['wrist.' + side] - J['elbow.' + side])
    J['knuck.' + side] = J['wrist.' + side] + d * 0.085; J['pip.' + side] = J['wrist.' + side] + d * 0.125; J['tip.' + side] = J['wrist.' + side] + d * 0.19
hipC = (J['hip.l'] + J['hip.r']) / 2
LEN3 = {'thigh': np.linalg.norm(J['knee.l'] - J['hip.l']), 'shin': np.linalg.norm(J['ankle.l'] - J['knee.l']),
        'ua': np.linalg.norm(J['elbow.l'] - J['sh.l']), 'fa': np.linalg.norm(J['wrist.l'] - J['elbow.l'])}
print('len3', {k: round(float(v), 3) for k, v in LEN3.items()}, 'hipC', hipC.round(3), 'sh', J['sh.l'].round(3))

# ── 3. transforms (each a set of rest segments) and weights ──────────────────────────────────────
SEG = {'pelvis': [(J['hip.l'], J['hip.r']), (hipC, V3(0, 0.05, 0.98)), (V3(0, -0.07, 0.90), V3(0, -0.07, 0.98))],
       'spine1': [(V3(0, 0.04, 0.99), V3(0, 0.04, 1.12)), (V3(0, -0.09, 1.0), V3(0, -0.09, 1.12)), (V3(0.12, 0, 1.0), V3(0.12, 0, 1.1)), (V3(-0.12, 0, 1.0), V3(-0.12, 0, 1.1))],
       'thorax': [(V3(0, 0.05, 1.13), V3(0, 0.04, 1.43)), (V3(0, -0.10, 1.14), V3(0, -0.07, 1.40)), (V3(0, -0.03, 1.41), J['sh.l']), (V3(0, -0.03, 1.41), J['sh.r']),
                  (V3(0.12, 0.08, 1.22), V3(0.13, 0.07, 1.40)), (V3(-0.12, 0.08, 1.22), V3(-0.13, 0.07, 1.40)), (V3(0.14, -0.02, 1.14), V3(0.14, -0.02, 1.32)), (V3(-0.14, -0.02, 1.14), V3(-0.14, -0.02, 1.32))],
       'neck': [(V3(0, 0.03, 1.44), V3(0, 0.02, 1.53))], 'head': [(V3(0, 0, 1.54), V3(0, 0, 1.72))]}
for s in 'lr':
    SEG['thigh.' + s] = [(J['hip.' + s], J['knee.' + s])]; SEG['shin.' + s] = [(J['knee.' + s], J['ankle.' + s])]
    SEG['foot.' + s] = [(J['ankle.' + s], J['toe.' + s]), (J['ankle.' + s], J['heel.' + s])]
    SEG['ua.' + s] = [(J['sh.' + s], J['elbow.' + s])]; SEG['fa.' + s] = [(J['elbow.' + s], J['wrist.' + s])]
    SEG['hand.' + s] = [(J['wrist.' + s], J['knuck.' + s])]; SEG['f1.' + s] = [(J['knuck.' + s], J['pip.' + s])]; SEG['f2.' + s] = [(J['pip.' + s], J['tip.' + s])]
TF = list(SEG); TI = {t: i for i, t in enumerate(TF)}
def dist(P, t):
    best = np.full(len(P), 1e9)
    for a, b in SEG[t]:
        ab = b - a; u = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        best = np.minimum(best, np.linalg.norm(P - (a + u[:, None] * ab), axis=1))
    return best
TRUNK = ['pelvis', 'spine1', 'thorax', 'neck', 'head']
def allowed(name, tgt, c):
    low = name.lower(); s = name[-1] if name.endswith(('.l', '.r')) else ('l' if c[0] > 0 else 'r')
    arm = ['ua.' + s, 'fa.' + s, 'hand.' + s, 'f1.' + s, 'f2.' + s]; leg = ['thigh.' + s, 'shin.' + s, 'foot.' + s]
    if re.search(r'pectoralis major|deltoid|teres major|coracobrachialis', low): return ['thorax', 'ua.' + s]
    if 'latissimus' in low: return ['spine1', 'thorax', 'ua.' + s]
    if re.search(r'biceps brachii|triceps brachii', low): return ['ua.' + s, 'fa.' + s]
    if re.search(r'glute|piriformis|obturator|gemellus|quadratus femoris|tensor fasciae|iliacus', low): return ['pelvis', 'pelvis', 'pelvis', 'thigh.' + s]
    if 'psoas' in low: return ['spine1', 'pelvis', 'thigh.' + s]
    near = min(TF, key=lambda t: float(dist(c[None, :], t)[0]) if (t in TRUNK or t.endswith('.' + s)) else 1e9)
    if near in arm: return arm
    if near in leg: return ['pelvis'] + leg
    return TRUNK
W = {}
for o in objs:
    P = REST[o.name]; A = allowed(o.name, o['tgt'], cen[o.name])
    if o['tgt'] == 'bone' or (o['tgt'] == 'skin' and o.name == 'Head'):
        A = [min(A, key=lambda t: float(dist(cen[o.name][None, :], t)[0]))]
    if o['tgt'] == 'bone' and A[0].startswith(('hand', 'f1', 'f2', 'fa')) and cen[o.name][2] < J['wrist.l'][2] + 0.01: A = [t for t in allowed(o.name, 'skin', cen[o.name])][2:]
    D = np.stack([dist(P, t) for t in A], 1)
    w = 1.0 / (D + 0.006) ** 4; w /= w.sum(1, keepdims=True)
    W[o.name] = ([TI[t] for t in A], w)

# ── 4. pose solver ────────────────────────────────────────────────────────────────────────────────
S2 = 0.0098; GROUND = 182.0
def p3(xy, x=0.0): return V3(x, -(xy[0] - 100) * S2, (GROUND - xy[1]) * S2)
def d3(a): r = math.radians(a); return V3(0, -math.cos(r), -math.sin(r))
def rotx(th):
    c, s = math.cos(th), math.sin(th); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def axis_rot(ax, th):
    ax = unit(ax); K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K
def M(R, piv_rest, piv_new):
    m = np.eye(4); m[:3, :3] = R; m[:3, 3] = piv_new - R @ piv_rest; return m
def frame(d, b):
    d = unit(d); b = unit(b - (b @ d) * d); return np.stack([d, b, np.cross(d, b)], 1)
def reach(l1, l2, flex): return math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * math.cos(math.radians(flex)))
def ik(S, T, l1, l2, pole):
    d = min(np.linalg.norm(T - S), l1 + l2 - 1e-5); u = unit(T - S); a = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(l1 * l1 - a * a, 0))
    q = unit(pole - (pole @ u) * u); return S + a * u + h * q, -np.cross(u, q)
def solve(fr, opt):
    T = {}
    a_t = fr['s']['torso'][2]; Rt = rotx(math.radians(a_t - (-90)))      # rest trunk is upright (2D angle −90°)
    hip_new = p3(fr['p']['hip'])
    Mt = M(Rt, hipC, hip_new)
    for t in TRUNK: T[t] = Mt
    tp = lambda m, p: m[:3, :3] @ p + m[:3, 3]
    for s, sg in (('l', 1), ('r', -1)):
        # leg: direction hip→ankle from the 2D frame, knee flexion from opt (or the frame), knee pointing up/forward
        Hh = tp(Mt, J['hip.' + s]); K = opt.get('knee', fr['j']['knee'])
        A = Hh + unit(p3(fr['p']['ankle']) - p3(fr['p']['hip']) + V3(0, 0, opt.get('ankleUp', 0))) * reach(LEN3['thigh'], LEN3['shin'], K)
        A[0] = sg * opt.get('footX', 0.11)
        Kn, bn = ik(Hh, A, LEN3['thigh'], LEN3['shin'], V3(sg * 0.25, -0.2, 1.0))
        Rth = frame(Kn - Hh, bn) @ frame(J['knee.' + s] - J['hip.' + s], V3(1, 0, 0)).T
        T['thigh.' + s] = M(Rth, J['hip.' + s], Hh)
        Rsh = frame(A - Kn, bn) @ frame(J['ankle.' + s] - J['knee.' + s], V3(1, 0, 0)).T
        T['shin.' + s] = M(Rsh, J['knee.' + s], Kn)
        T['foot.' + s] = M(rotx(math.radians(fr['s']['foot'][2] + opt.get('footTilt', 0))), J['ankle.' + s], A)
        # arm: direction shoulder→wrist and elbow flexion from the 2D frame (sourced), hands brought in to the grip width
        Sh = tp(Mt, J['sh.' + s]); E = fr['j']['elbow']
        dirw = unit(p3(fr['p']['wrist']) - p3(fr['p']['shoulder'])); r = reach(LEN3['ua'], LEN3['fa'], E)
        Wt = Sh + dirw * r; Wt[0] = sg * opt.get('gripX', 0.07); Wt = Sh + unit(Wt - Sh) * r
        El, bn = ik(Sh, Wt, LEN3['ua'], LEN3['fa'], V3(sg * opt.get('elbowOut', 0.35), 0.35, -1.0))
        Rua = frame(El - Sh, bn) @ frame(J['elbow.' + s] - J['sh.' + s], V3(-1, 0, 0)).T
        T['ua.' + s] = M(Rua, J['sh.' + s], Sh)
        Rfa = frame(Wt - El, bn) @ frame(J['wrist.' + s] - J['elbow.' + s], V3(-1, 0, 0)).T
        tw = math.radians(opt.get('pronate', 0)) * sg
        fa_ax = unit(J['wrist.' + s] - J['elbow.' + s])
        T['fa.' + s] = M(Rfa @ axis_rot(fa_ax, tw * 0.5), J['elbow.' + s], El)
        Rh = Rfa @ axis_rot(fa_ax, tw); T['hand.' + s] = M(Rh, J['wrist.' + s], Wt)
        lat = unit(np.cross(fa_ax, V3(0, -1, 0)))                           # finger joint axis in the rest hand
        c1 = math.radians(opt.get('curl', 0)) * (1 if s == 'l' else 1)
        Rf1 = Rh @ axis_rot(lat, c1 * opt.get('curlSign', 1)); kn = tp(T['hand.' + s], J['knuck.' + s]); T['f1.' + s] = M(Rf1, J['knuck.' + s], kn)
        Rf2 = Rf1 @ axis_rot(lat, c1 * opt.get('curlSign', 1)); pp = tp(T['f1.' + s], J['pip.' + s]); T['f2.' + s] = M(Rf2, J['pip.' + s], pp)
        T['_wrist.' + s] = Wt; T['_ankle.' + s] = A; T['_knee.' + s] = Kn; T['_elbow.' + s] = El; T['_grip.' + s] = tp(T['hand.' + s], J['knuck.' + s] + V3(0, -0.02, 0))
    T['_hip'] = hip_new; T['_sh'] = tp(Mt, (J['sh.l'] + J['sh.r']) / 2)
    return T
def apply(T):
    mats = np.stack([T[t] for t in TF])
    for o in objs:
        idx, w = W[o.name]; P = REST[o.name]; Ph = np.concatenate([P, np.ones((len(P), 1))], 1)
        out = np.zeros((len(P), 3))
        for k, ti in enumerate(idx): out += w[:, k:k + 1] * (Ph @ mats[ti][:3, :].T)
        o.data.vertices.foreach_set('co', out.ravel()); o.data.update()

# ── 5. equipment (own procedural shapes) ──────────────────────────────────────────────────────────
EQ = bpy.data.collections.new('eq'); sc.collection.children.link(EQ)
def mat(name, col, rough=0.7, metal=0.0, ao=0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if ao:
        nt = m.node_tree; a = nt.nodes.new('ShaderNodeAmbientOcclusion'); a.inputs['Distance'].default_value = ao; a.samples = 8
        g = nt.nodes.new('ShaderNodeMath'); g.operation = 'POWER'; g.inputs[1].default_value = 2.2; nt.links.new(a.outputs['AO'], g.inputs[0])
        mx = nt.nodes.new('ShaderNodeMixRGB'); mx.inputs[1].default_value = (col[0] * 0.22, col[1] * 0.22, col[2] * 0.22, 1); mx.inputs[2].default_value = (*col, 1)
        nt.links.new(g.outputs[0], mx.inputs[0]); nt.links.new(mx.outputs[0], b.inputs['Base Color'])
    return m
MT = {'body': mat('body', (0.36, 0.36, 0.37), 0.6, 0, 0.03), 'skin': mat('skin', (0.42, 0.42, 0.43), 0.5, 0, 0.03), 'hot': mat('hot', (0.95, 0.95, 0.95), 0.6, 0, 0.03),
      'frame': mat('frame', (0.16, 0.16, 0.17), 0.45, 0.6), 'pad': mat('pad', (0.045, 0.045, 0.05), 0.55), 'plate': mat('plate', (0.10, 0.10, 0.11), 0.4, 0.5),
      'steel': mat('steel', (0.62, 0.62, 0.64), 0.3, 0.9), 'cable': mat('cable', (0.08, 0.08, 0.08), 0.5)}
def add(o, m):
    for c in list(o.users_collection): c.objects.unlink(o)
    EQ.objects.link(o); o.data.materials.append(MT[m]); o['eq'] = 1
    for p in o.data.polygons: p.use_smooth = True
    return o
def box(c, size, m, rot=(0, 0, 0), bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=c, rotation=rot); o = bpy.context.object; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 3; o.modifiers.new('n', 'WEIGHTED_NORMAL'); return add(o, m)
def cyl(a, b, r, m, verts=24):
    a = Vector(a); b = Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2); o = bpy.context.object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); return add(o, m)
def tube(pts, r, m):
    return [cyl(pts[i], pts[i + 1], r, m) for i in range(len(pts) - 1)] + [sph(p, r, m) for p in pts[1:-1]]
def sph(c, r, m):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=c, segments=16, ring_count=8); return add(bpy.context.object, m)
DYN = {}; TOP = 1.45
def build_row(T0):
    seat = DYN['seat']; yh = T0['_hip'][1]; an = (T0['_ankle.l'] + T0['_ankle.r']) / 2
    ytower = an[1] - 0.42
    box((0, yh - 0.10, seat - 0.035), (0.30, 0.62, 0.07), 'pad', bevel=0.02)                 # seat pad
    box((0, (yh + ytower) / 2 + 0.1, seat - 0.10), (0.07, abs(ytower - yh) + 0.75, 0.06), 'frame')   # main rail
    for y in (yh + 0.22, yh - 0.42): cyl((0, y, seat - 0.10), (0, y, 0.03), 0.03, 'frame'); box((0, y, 0.015), (0.42, 0.06, 0.03), 'frame')
    # foot plates, tilted like the feet
    for sg in (1, -1): box((sg * 0.11, an[1] - 0.075, an[2] - 0.01), (0.15, 0.03, 0.30), 'plate', rot=(math.radians(-10), 0, 0))
    cyl((0.19, an[1] - 0.07, an[2] - 0.06), (-0.19, an[1] - 0.07, an[2] - 0.06), 0.022, 'frame')
    cyl((0, an[1] - 0.07, an[2] - 0.06), (0, an[1] - 0.07, seat - 0.10), 0.03, 'frame')
    # tower with weight stack and pulleys
    for sx in (0.17, -0.17): cyl((sx, ytower, 0.02), (sx, ytower, TOP), 0.03, 'frame')
    box((0, ytower, TOP), (0.40, 0.07, 0.06), 'frame'); box((0, ytower, 0.03), (0.50, 0.50, 0.05), 'frame')
    for sx in (0.07, -0.07): cyl((sx, ytower, 0.06), (sx, ytower, TOP - 0.03), 0.009, 'steel')
    for i in range(11): box((0, ytower, 0.10 + i * 0.045), (0.26, 0.11, 0.038), 'plate', bevel=0.006)
    pz = T0['_wrist.l'][2] - 0.02; py = ytower + 0.16
    cyl((0.025, py, pz), (-0.025, py, pz), 0.055, 'frame', 32); cyl((0.03, py, pz), (-0.03, py, pz), 0.012, 'steel')
    box((0, ytower + 0.08, pz), (0.05, 0.16, 0.05), 'frame'); cyl((0.02, ytower + 0.02, TOP - 0.05), (-0.02, ytower + 0.02, TOP - 0.05), 0.05, 'frame', 32)
    DYN['pulley'] = V3(0, py, pz + 0.055); DYN['ytower'] = ytower
def dyn_row(T, top0):
    for o in [o for o in EQ.objects if o.get('dyn')]: bpy.data.objects.remove(o, do_unlink=True)
    gl, gr = T['_grip.l'], T['_grip.r']; mid = (gl + gr) / 2; fwd = mid + V3(0, -0.13, 0.0)
    made = []
    for g, sg in ((gl, 1), (gr, -1)):
        made += [cyl(g + V3(0, 0, 0.065), g + V3(0, 0, -0.065), 0.014, 'steel')]
        made += tube([g + V3(0, 0, 0.06), fwd + V3(sg * 0.012, 0, 0.012)], 0.007, 'steel') + tube([g + V3(0, 0, -0.06), fwd + V3(sg * 0.012, 0, -0.012)], 0.007, 'steel')
    made += [sph(fwd, 0.02, 'steel'), cyl(fwd, DYN['pulley'], 0.005, 'cable', 8)]
    # weight stack: the top plates travel up by the cable length pulled
    pull = max(0.0, (mid[1] - top0[1]))
    yt = DYN['ytower']
    for i in range(4): made += [box((0, yt, 0.10 + (11 + i) * 0.045 + pull), (0.26, 0.11, 0.038), 'plate', bevel=0.006)]
    made += [cyl((0, yt + 0.02, 0.10 + 15 * 0.045 + pull), (0, yt + 0.02, TOP - 0.05), 0.005, 'cable', 8)]
    for o in made: o['dyn'] = 1

# ── 6. render ─────────────────────────────────────────────────────────────────────────────────────
ON, HALF = {'upper back'}, {'lats', 'biceps', 'delts'}
hold = bpy.data.materials.new('hold'); hold.use_nodes = True; nt = hold.node_tree; nt.nodes.clear()
ho = nt.nodes.new('ShaderNodeHoldout'); mo = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(ho.outputs[0], mo.inputs[0])
def emit(name, v):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (v, v, v, 1); o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0]); return m
E1, E2 = emit('e1', 1.0), emit('e2', 0.17)
def paint(mask):
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        t = o.get('tgt')
        if o.get('eq'):
            if mask: o['_m'] = o.data.materials[0].name; o.data.materials[0] = hold
            elif o.get('_m'): o.data.materials[0] = bpy.data.materials[o['_m']]
            continue
        m = (E1 if t in ON else E2 if t in HALF else hold) if mask else (MT['hot'] if t in ON or t in HALF else MT['skin'] if t == 'skin' else MT['body'])
        o.data.materials.clear(); o.data.materials.append(m)
        for p in o.data.polygons: p.use_smooth = True
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 3; sc.cycles.seed = 7
sc.render.use_freestyle = False; sc.render.use_compositing = False; sc.render.use_sequencer = False; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.film_transparent = True
sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.30
for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o)
def light(loc, e, size, look):
    l = bpy.data.lights.new('l', 'SUN'); l.energy = e; l.angle = math.radians(size); o = bpy.data.objects.new('l', l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
data = json.load(open(FRAMES)); frames = data['frames']
OPT = {'knee': 32, 'ankleUp': 0.16, 'footX': 0.11, 'footTilt': -8, 'gripX': 0.075, 'elbowOut': 0.30, 'pronate': 90, 'curl': 62}
T0 = solve(frames[0], OPT); apply(T0)
zs = []
for o in objs:
    n = len(o.data.vertices); a = np.empty(n * 3); o.data.vertices.foreach_get('co', a); a = a.reshape(n, 3)
    k = (a[:, 1] > T0['_hip'][1] - 0.10) & (a[:, 1] < T0['_hip'][1] + 0.12)
    if k.any(): zs.append(a[k, 2].min())
DYN['seat'] = min(zs) + 0.012; print('seat top', round(DYN['seat'], 3), 'hip', T0['_hip'].round(3))
build_row(T0); top0 = (T0['_grip.l'] + T0['_grip.r']) / 2
look = V3(0, (T0['_hip'][1] + DYN['ytower']) / 2 + 0.10, 0.70)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.0
az, el = math.radians(float(os.environ.get('AZ', '-52'))), math.radians(float(os.environ.get('EL', '14')))
cd = V3(math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))
cam.location = look + cd * 6; cam.rotation_euler = (Vector(look) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
light(look + cd * 3 + V3(0, 1.5, 3.0), 2.0, 25, look); light(look - cd * 2 + V3(0, -1, 1.5), 0.5, 40, look)
os.makedirs(OUT, exist_ok=True)
for i, fr in enumerate(frames):
    if ONLY and i not in ONLY: continue
    T = solve(fr, OPT); apply(T); dyn_row(T, top0)
    for mask in (False, True):
        paint(mask); sc.cycles.samples = 12 if mask else 48; sc.cycles.use_denoising = not mask
        sc.render.filter_size = 1.5
        sc.render.filepath = os.path.join(OUT, ('m' if mask else 'b') + '%02d.png' % i); bpy.ops.render.render(write_still=True)
    print('frame', i, 'done')
