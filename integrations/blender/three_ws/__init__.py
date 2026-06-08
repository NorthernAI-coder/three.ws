"""three.ws — Blender add-on.

Generate a 3D model from a text prompt or a reference image with three.ws Forge,
without leaving Blender. The model is reconstructed on three.ws (FLUX→TRELLIS by
default, or Meshy/Tripo geometry path with your own key), then imported into the
current scene.

Install:  zip this folder → Edit ▸ Preferences ▸ Add-ons ▸ Install… → enable
"three.ws". Open the sidebar in the 3D Viewport (press N) → "three.ws" tab.

Networking runs on a worker thread; the GLB import happens on Blender's main
thread inside a modal timer (bpy is not thread-safe). Nothing is faked — the
panel shows the real job status and elapsed time, and surfaces real errors.
"""

import os
import queue
import tempfile
import threading

import bpy
from bpy.props import EnumProperty, PointerProperty, StringProperty
from bpy.types import AddonPreferences, Operator, Panel, PropertyGroup

from .three_ws_client import (
    ASPECT_RATIOS,
    BACKENDS,
    DEFAULT_BASE_URL,
    PATHS,
    TIERS,
    ThreeWSClient,
    ThreeWSError,
    content_type_for_path,
)

bl_info = {
    "name": "three.ws",
    "author": "three.ws",
    "version": (1, 0, 0),
    "blender": (4, 0, 0),
    "location": "View3D ▸ Sidebar ▸ three.ws",
    "description": "Generate 3D models from text or images with three.ws Forge.",
    "category": "Import-Export",
    "doc_url": "https://three.ws/forge",
}


# -- preferences --------------------------------------------------------------

class ThreeWSPreferences(AddonPreferences):
    bl_idname = __name__

    api_url: StringProperty(
        name="API URL",
        description="three.ws deployment origin",
        default=DEFAULT_BASE_URL,
    )
    provider_key: StringProperty(
        name="Provider API key",
        description="Optional Meshy/Tripo key for the geometry path (BYOK). "
        "Leave blank to use the free image path (FLUX→TRELLIS).",
        default="",
        subtype="PASSWORD",
    )

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "api_url")
        layout.prop(self, "provider_key")
        layout.label(
            text="The image path is free. A provider key is only needed for the "
            "Meshy/Tripo geometry backends.",
            icon="INFO",
        )


def _prefs(context):
    return context.preferences.addons[__name__].preferences


# -- scene properties ---------------------------------------------------------

def _enum(items_tuple, labels=None):
    labels = labels or {}
    return [(v, labels.get(v, v.replace("_", " ").title()), "") for v in items_tuple]


class ThreeWSProps(PropertyGroup):
    mode: EnumProperty(
        name="Source",
        items=[("text", "Text", "Generate from a text prompt"),
               ("image", "Image", "Generate from a reference image")],
        default="text",
    )
    prompt: StringProperty(
        name="Prompt",
        description="Describe one subject",
        default="",
    )
    image_path: StringProperty(
        name="Image",
        description="Reference image (PNG/JPEG/WebP)",
        default="",
        subtype="FILE_PATH",
    )
    tier: EnumProperty(
        name="Quality",
        items=_enum(TIERS),
        default="standard",
    )
    path: EnumProperty(
        name="Pipeline",
        items=[("image", "Image (FLUX→TRELLIS, free)", ""),
               ("geometry", "Geometry (Meshy/Tripo, BYOK)", "")],
        default="image",
    )
    backend: EnumProperty(
        name="Backend",
        items=[("auto", "Auto", "Let three.ws pick the default for the pipeline")]
        + _enum(BACKENDS, {"trellis": "TRELLIS", "meshy": "Meshy", "tripo": "Tripo", "hunyuan3d": "Hunyuan3D"}),
        default="auto",
    )
    aspect_ratio: EnumProperty(
        name="Aspect",
        items=_enum(ASPECT_RATIOS),
        default="1:1",
    )
    status: StringProperty(name="Status", default="")
    running: bpy.props.BoolProperty(name="Running", default=False)


# -- generation operator ------------------------------------------------------

class THREEWS_OT_generate(Operator):
    """Generate a 3D model and import it into the scene."""

    bl_idname = "threews.generate"
    bl_label = "Generate 3D model"
    bl_options = {"REGISTER"}

    _timer = None
    _thread = None
    _events: "queue.Queue" = None
    _cancel = None
    _result_path = None
    _error = None

    @classmethod
    def poll(cls, context):
        return not context.scene.three_ws.running

    def _worker(self, client, props, image_bytes, image_ct, dest_path):
        def on_progress(status, elapsed):
            self._events.put(("progress", f"{status} — {int(elapsed)}s"))

        try:
            backend = None if props["backend"] == "auto" else props["backend"]
            if props["mode"] == "text":
                glb_url = client.generate_text_to_3d(
                    props["prompt"], tier=props["tier"], backend=backend,
                    path=props["path"], aspect_ratio=props["aspect_ratio"],
                    on_progress=on_progress, should_cancel=lambda: self._cancel.is_set(),
                )
            else:
                glb_url = client.generate_image_to_3d(
                    image_bytes, image_ct, tier=props["tier"], backend=backend,
                    path=props["path"], on_progress=on_progress,
                    should_cancel=lambda: self._cancel.is_set(),
                )
            client.download(glb_url, dest_path)
            self._events.put(("done", dest_path))
        except ThreeWSError as exc:
            self._events.put(("error", exc.message))
        except Exception as exc:  # network/file errors → real message, never silent
            self._events.put(("error", str(exc)))

    def execute(self, context):
        props = context.scene.three_ws
        prefs = _prefs(context)

        # Validate inputs on the main thread before spawning work.
        image_bytes, image_ct = None, None
        if props.mode == "text":
            if len((props.prompt or "").strip()) < 3:
                self.report({"ERROR"}, "Enter a prompt of at least 3 characters.")
                return {"CANCELLED"}
        else:
            path = bpy.path.abspath(props.image_path or "")
            if not path or not os.path.isfile(path):
                self.report({"ERROR"}, "Choose a reference image file.")
                return {"CANCELLED"}
            try:
                image_ct = content_type_for_path(path)
                with open(path, "rb") as fh:
                    image_bytes = fh.read()
            except (ThreeWSError, OSError) as exc:
                self.report({"ERROR"}, str(exc))
                return {"CANCELLED"}

        client = ThreeWSClient(prefs.api_url, provider_key=prefs.provider_key or None)
        dest_path = os.path.join(tempfile.gettempdir(), f"three-ws-{os.getpid()}-{id(self)}.glb")

        self._events = queue.Queue()
        self._cancel = threading.Event()
        self._result_path = None
        self._error = None
        snapshot = {
            "mode": props.mode, "prompt": props.prompt, "tier": props.tier,
            "path": props.path, "backend": props.backend, "aspect_ratio": props.aspect_ratio,
        }
        self._thread = threading.Thread(
            target=self._worker, args=(client, snapshot, image_bytes, image_ct, dest_path), daemon=True
        )
        props.running = True
        props.status = "Submitting…"
        self._thread.start()

        self._timer = context.window_manager.event_timer_add(0.25, window=context.window)
        context.window_manager.modal_handler_add(self)
        return {"RUNNING_MODAL"}

    def modal(self, context, event):
        props = context.scene.three_ws
        if event.type == "ESC":
            self._cancel.set()
            props.status = "Cancelling…"

        if event.type != "TIMER":
            return {"PASS_THROUGH"}

        # Drain worker events on the main thread.
        try:
            while True:
                kind, payload = self._events.get_nowait()
                if kind == "progress":
                    props.status = payload
                elif kind == "done":
                    self._result_path = payload
                elif kind == "error":
                    self._error = payload
        except queue.Empty:
            pass

        if self._thread and not self._thread.is_alive():
            return self._finish(context)
        return {"PASS_THROUGH"}

    def _finish(self, context):
        props = context.scene.three_ws
        if self._timer:
            context.window_manager.event_timer_remove(self._timer)
            self._timer = None
        props.running = False

        if self._error:
            props.status = ""
            self.report({"ERROR"}, f"three.ws: {self._error}")
            return {"CANCELLED"}

        if not self._result_path or not os.path.isfile(self._result_path):
            props.status = ""
            self.report({"ERROR"}, "three.ws: generation finished without a model.")
            return {"CANCELLED"}

        # GLB import must run on the main thread — that's why it's here, not in
        # the worker. Select + frame the freshly imported objects.
        before = set(context.scene.objects)
        try:
            bpy.ops.import_scene.gltf(filepath=self._result_path)
        except RuntimeError as exc:
            props.status = ""
            self.report({"ERROR"}, f"three.ws: GLB import failed: {exc}")
            return {"CANCELLED"}
        finally:
            try:
                os.remove(self._result_path)
            except OSError:
                pass

        new_objs = [o for o in context.scene.objects if o not in before]
        if new_objs:
            for obj in context.selected_objects:
                obj.select_set(False)
            for obj in new_objs:
                obj.select_set(True)
            context.view_layer.objects.active = new_objs[0]
            _frame_selected(context)

        props.status = ""
        self.report({"INFO"}, f"three.ws: imported {len(new_objs)} object(s).")
        return {"FINISHED"}


def _frame_selected(context):
    """Frame the imported objects in the first available 3D viewport."""
    for area in context.screen.areas:
        if area.type == "VIEW_3D":
            for region in area.regions:
                if region.type == "WINDOW":
                    with context.temp_override(area=area, region=region):
                        bpy.ops.view3d.view_selected()
                    return


class THREEWS_OT_check_catalog(Operator):
    """Verify the deployment is reachable and report live backends."""

    bl_idname = "threews.check_catalog"
    bl_label = "Test connection"

    def execute(self, context):
        prefs = _prefs(context)
        client = ThreeWSClient(prefs.api_url, provider_key=prefs.provider_key or None)
        try:
            catalog = client.get_catalog()
        except ThreeWSError as exc:
            self.report({"ERROR"}, f"three.ws: {exc.message}")
            return {"CANCELLED"}
        live = [b.get("label", b.get("id")) for b in catalog.get("backends", []) if b.get("configured")]
        self.report({"INFO"}, "three.ws reachable. Live backends: " + (", ".join(live) or "image path only"))
        return {"FINISHED"}


# -- panel --------------------------------------------------------------------

class THREEWS_PT_panel(Panel):
    bl_label = "three.ws Forge"
    bl_idname = "THREEWS_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "three.ws"

    def draw(self, context):
        layout = self.layout
        props = context.scene.three_ws

        layout.prop(props, "mode", expand=True)
        if props.mode == "text":
            layout.prop(props, "prompt")
            layout.prop(props, "aspect_ratio")
        else:
            layout.prop(props, "image_path")

        col = layout.column(align=True)
        col.prop(props, "path")
        col.prop(props, "tier")
        col.prop(props, "backend")

        row = layout.row()
        row.scale_y = 1.4
        row.enabled = not props.running
        row.operator(THREEWS_OT_generate.bl_idname, icon="MESH_MONKEY")

        if props.running:
            box = layout.box()
            box.label(text=props.status or "Working…", icon="SORTTIME")
            box.label(text="Press Esc to cancel.", icon="CANCEL")

        layout.separator()
        layout.operator(THREEWS_OT_check_catalog.bl_idname, icon="URL")


# -- registration -------------------------------------------------------------

_CLASSES = (
    ThreeWSPreferences,
    ThreeWSProps,
    THREEWS_OT_generate,
    THREEWS_OT_check_catalog,
    THREEWS_PT_panel,
)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.three_ws = PointerProperty(type=ThreeWSProps)


def unregister():
    del bpy.types.Scene.three_ws
    for cls in reversed(_CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
