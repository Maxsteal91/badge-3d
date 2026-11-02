"""Genera il modello del badge: esporta src/assets/badge.glb e salva blender/badge.blend.

Uso (macOS):
  blender --background --python blender/make_badge.py

Nodi esportati:
  card       tessera con foro, bordi smussati (materiali front / back / edge)
  clip       anello a D + girello tornito (materiale metal)
  clamp      gancio a J con levetta a molla, passa nel foro della tessera (metal)
  strap_anchor  empty al centro della barra della D: lì il codice avvolge il laccio

Convenzioni (unità Blender = unità three.js, 1 unità ≈ 34 mm):
  - tessera 1.6 x 2.55 (proporzione 54 x 86 mm), spessore 0.02, centro nell'origine
  - fronte verso -Y in Blender, cioè +Z in glTF (verso la camera)
  - il laccio (unico nastro, generato in src/Band.jsx) si avvolge attorno a strap_anchor

ATTENZIONE: ogni esecuzione sovrascrive blender/badge.blend (Blender tiene la versione
precedente in badge.blend1). Se modifichi il modello a mano, non rilanciare lo script.
"""
import math
import os

import bmesh
import bpy

W, H, T = 1.6, 2.55, 0.02     # tessera
R = 0.09                       # raggio angoli
TOP = H / 2

HOLE_R = 0.042                 # foro per il gancio
HOLE_Z = TOP - 0.16

# misure della ferramenta
D_HALF_W = 0.14                # anello a D
D_TOP = 1.695                  # barra piatta: il laccio ci si avvolge
D_BOTTOM = 1.575               # ventre: passa nell'occhiello del girello
D_WIRE = 0.014

SWIVEL_Z = 1.465               # base del girello = cima del gancio
HOOK_RC = 0.055                # raggio della curva del gancio che passa nel foro
HOOK_PLANE = math.radians(35)  # rotazione del piano del gancio attorno alla verticale

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "assets", "badge.glb")
BLEND = os.path.join(HERE, "badge.blend")


# ---------------------------------------------------------------- utilità

def material(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return m


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def select_only(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def bake(obj):
    """Applica trasformazioni e modificatori, converte curve in mesh."""
    select_only([obj])
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return bpy.context.view_layer.objects.active


def join(name, objs, mat):
    objs = [bake(o) for o in objs]
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)
    select_only(objs)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = name
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    return obj


def tube(name, pts, radius, cyclic=False, resolution=6):
    """Tubo lungo una polilinea; pts = [(x, y, z, scala_raggio)]."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = resolution
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, (x, y, z, r) in zip(sp.points, pts):
        p.co = (x, y, z, 1)
        p.radius = r
    sp.use_cyclic_u = cyclic
    return link(bpy.data.objects.new(name, cu))


def lathe(name, profile, steps=48):
    """Solido di rivoluzione attorno all'asse Z; profile = [(raggio, z)] dal basso verso l'alto."""
    me = bpy.data.meshes.new(name)
    verts = [(r, 0, z) for r, z in profile]
    me.from_pydata(verts, [(i, i + 1) for i in range(len(verts) - 1)], [])
    obj = link(bpy.data.objects.new(name, me))
    mod = obj.modifiers.new("screw", "SCREW")
    mod.axis = "Z"
    mod.steps = mod.render_steps = steps
    mod.use_merge_vertices = True
    mod.use_normal_calculate = True
    return obj


def rounded_box(name, size, location, bevel=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = bevel
    mod.segments = 3
    return obj


def rounded_rect(w, h, r, seg=10):
    pts = []
    for cx, cy, start in [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                          (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]:
        for i in range(seg + 1):
            a = math.radians(start + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def bezier(p0, p1, p2, p3, n):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append(tuple(a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k] for k in range(2)))
    return out


# ---------------------------------------------------------------- tessera

def make_card(front, back, edge):
    me = bpy.data.meshes.new("card")
    bm = bmesh.new()
    verts = [bm.verts.new((x, T / 2, z)) for x, z in rounded_rect(W, H, R)]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(0, -T, 0), verts=[g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    card = link(bpy.data.objects.new("card", me))

    bpy.ops.mesh.primitive_cylinder_add(radius=HOLE_R, depth=T * 4, vertices=48,
                                        location=(0, 0, HOLE_Z), rotation=(math.radians(90), 0, 0))
    cutter = bpy.context.active_object
    boolean = card.modifiers.new("hole", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.object = cutter
    bev = card.modifiers.new("bevel", "BEVEL")
    bev.width = 0.004
    bev.segments = 2
    bev.limit_method = "ANGLE"
    card = bake(card)
    bpy.data.objects.remove(cutter)

    # materiali e UV dopo foro e smusso: proiezione piana su fronte e retro
    me = card.data
    me.materials.clear()          # il boolean lascia uno slot vuoto...
    while me.uv_layers:           # ...e copia le UV del cilindro: le rifaccio da zero
        me.uv_layers.remove(me.uv_layers[0])
    for m in (front, back, edge):
        me.materials.append(m)
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        if n.y < -0.7:
            f.material_index = 0
            for l in f.loops:
                x, _, z = l.vert.co
                l[uv].uv = ((x + W / 2) / W, (z + H / 2) / H)
        elif n.y > 0.7:
            f.material_index = 1
            for l in f.loops:
                x, _, z = l.vert.co
                l[uv].uv = ((W / 2 - x) / W, (z + H / 2) / H)
        else:
            f.material_index = 2
            for l in f.loops:
                l[uv].uv = (0.5, 0.5)
    bm.to_mesh(me)
    bm.free()
    select_only([card])
    bpy.ops.object.shade_auto_smooth(angle=math.radians(30))
    return card


# ---------------------------------------------------------------- anello a D + girello

def d_ring():
    """Profilo a D: barra superiore quasi dritta, ventre arrotondato (superellissi raccordate)."""
    top_h = 0.03
    zc = D_TOP - top_h
    bottom_h = zc - D_BOTTOM
    pts = []
    n = 96
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        top = s >= 0
        ex = 2 / (9 if top else 2.6)       # esponente: alto piatto, basso tondo
        x = D_HALF_W * math.copysign(abs(c) ** ex, c)
        z = zc + (top_h if top else bottom_h) * math.copysign(abs(s) ** ex, s)
        pts.append((x, 0, z, 1.0))
    return tube("d_ring", pts, D_WIRE, cyclic=True)


def swivel():
    z0 = SWIVEL_Z
    profile = [(0.0, z0), (0.02, z0), (0.024, z0 + 0.005), (0.024, z0 + 0.015),
               (0.040, z0 + 0.020), (0.043, z0 + 0.027), (0.043, z0 + 0.045), (0.037, z0 + 0.050),
               (0.037, z0 + 0.056), (0.043, z0 + 0.061), (0.043, z0 + 0.075), (0.030, z0 + 0.082),
               (0.014, z0 + 0.086), (0.014, D_BOTTOM - 0.024), (0.0, D_BOTTOM - 0.024)]
    body = lathe("swivel", profile)
    # occhiello: foro con asse lungo X, il ventre della D lo attraversa
    bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.009, major_segments=32,
                                     minor_segments=12, location=(0, 0, D_BOTTOM),
                                     rotation=(0, math.radians(90), 0))
    return [body, bpy.context.active_object]


# ---------------------------------------------------------------- gancio a J (trigger snap)

def hook():
    """Costruito nel piano locale XZ (u, z), poi appiattito (lamiera stampata) e ruotato."""
    rc = HOOK_RC
    zc = HOLE_Z + rc
    top = SWIVEL_Z + 0.015
    spine = [(0.0, top), (0.0, top - 0.04)] + bezier((0.0, top - 0.04), (0.0, top - 0.1), (-rc, top - 0.11), (-rc, top - 0.17), 12)[1:]
    spine += [(-rc, z) for z in (zc + 0.06, zc)]
    arc = [(rc * math.cos(a), zc + rc * math.sin(a)) for a in (math.pi + math.pi * i / 24 for i in range(1, 25))]
    tip = [(rc, zc + 0.04), (rc + 0.003, zc + 0.06), (rc + 0.012, zc + 0.075)]

    pts = [(u, 0, z, 1.3) for u, z in spine]
    pts += [(u, 0, z, 1.3 - 0.3 * min(1, i / 8)) for i, (u, z) in enumerate(arc)]
    pts += [(u, 0, z, 0.9 - 0.1 * i) for i, (u, z) in enumerate(tip)]
    body = tube("hook", pts, 0.016)

    # levetta a molla: dal fulcro sulla schiena alla punta, sezione piatta
    pivot = (-rc * 0.45, top - 0.095)
    gate = tube("gate", [(pivot[0], 0, pivot[1], 1.0), (rc - 0.004, 0, zc + 0.068, 0.85)], 0.011)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=0.032, vertices=20,
                                        location=(pivot[0], 0, pivot[1]), rotation=(math.radians(90), 0, 0))
    pin = bpy.context.active_object
    # collarino sotto il girello
    bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.02, vertices=32, location=(0, 0, SWIVEL_Z + 0.002))
    collar = bpy.context.active_object

    for o in (body, gate):
        o.scale = (1, 0.7, 1)               # più larga nel piano che spessa
    parts = [body, gate, pin]
    for o in parts:
        o.rotation_euler = (0, 0, HOOK_PLANE)
    return parts + [collar]


# ---------------------------------------------------------------- riferimento per il laccio

def strap_anchor():
    """Empty al centro della barra della D: il codice ci avvolge attorno il nastro (src/Band.jsx)."""
    obj = link(bpy.data.objects.new("strap_anchor", None))
    obj.location = (0, 0, D_TOP)
    obj.empty_display_type = "SINGLE_ARROW"
    obj.empty_display_size = 0.1
    return obj


# ---------------------------------------------------------------- main

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    front = material("front", (0.95, 0.95, 0.95), roughness=0.35)
    back = material("back", (0.1, 0.1, 0.12), roughness=0.4)
    edge = material("edge", (0.85, 0.85, 0.85), roughness=0.5)
    metal = material("metal", (0.06, 0.06, 0.065), metallic=1.0, roughness=0.3)

    objs = [
        make_card(front, back, edge),
        join("clip", [d_ring()] + swivel(), metal),
        join("clamp", hook(), metal),
    ]
    anchor = strap_anchor()

    select_only(objs + [anchor])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format="GLB",
                              use_selection=True, export_apply=True, export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)

    for o in objs:
        print(f"[badge] node={o.name} verts={len(o.data.vertices)} materials={[m.name for m in o.data.materials]}")
    print(f"[badge] strap_anchor y={D_TOP:.3f}")
    print(f"[badge] exported {os.path.abspath(OUT)} ({os.path.getsize(OUT)} bytes)")
    print(f"[badge] saved {BLEND}")


main()
