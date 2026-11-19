bl_info = {
    "name": "CHIDO Studio Bridge",
    "author": "CHIDO Engineering",
    "version": (1, 0, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > CHIDO",
    "description": "Connects Blender directly to CHIDO Studio Active Project folders and revision export.",
    "category": "Import-Export",
}

import bpy
import json
import os
import urllib.request


def read_active_project_manifest():
    manifest_path = os.environ.get("CHIDO_MANIFEST_PATH")
    if not manifest_path or not os.path.exists(manifest_path):
        return None
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)


class CHIDO_OT_ImportActiveGlb(bpy.types.Operator):
    bl_idname = "chido.import_active_glb"
    bl_label = "Import Active Product GLB"

    def execute(self, context):
        manifest = read_active_project_manifest()
        if not manifest:
            self.report({'ERROR'}, "No CHIDO_MANIFEST_PATH found.")
            return {'CANCELLED'}

        if bpy.data.is_dirty:
            self.report({'WARNING'}, "Current Blender scene has unsaved changes! Save before importing.")
            return {'CANCELLED'}

        glb_path = manifest.get("sourceGlbPath")
        if glb_path and os.path.exists(glb_path):
            bpy.ops.import_scene.gltf(filepath=glb_path)
            self.report({'INFO'}, f"Imported {manifest.get('productCode')}")
        return {'FINISHED'}


class CHIDO_OT_ExportRevisionToStudio(bpy.types.Operator):
    bl_idname = "chido.export_revision"
    bl_label = "Export Revision to CHIDO Studio"

    def execute(self, context):
        manifest = read_active_project_manifest()
        if not manifest:
            self.report({'ERROR'}, "No active CHIDO project manifest.")
            return {'CANCELLED'}

        export_dir = manifest["exportsFolder"]
        os.makedirs(export_dir, exist_ok=True)
        out_name = f"{manifest['productCode']}_{manifest['nextRevision']}.glb"
        out_path = os.path.join(export_dir, out_name)

        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format='GLB',
            export_apply=True,
        )

        # Save .blend working file in Blender/ folder
        blend_dir = manifest["blenderFolder"]
        os.makedirs(blend_dir, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(
            filepath=os.path.join(blend_dir, f"{manifest['productCode']}.blend")
        )

        # Notify CHIDO Studio backend
        req = urllib.request.Request(
            f"{manifest['studioApiUrl']}/api/blender/export-revision",
            data=json.dumps({
                "productId": manifest["productId"],
                "fileName": out_name,
                "notes": "Exported from Blender CHIDO Bridge",
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
        self.report({'INFO'}, f"Exported & registered {out_name}")
        return {'FINISHED'}


class CHIDO_PT_Panel(bpy.types.Panel):
    bl_label = "CHIDO Studio"
    bl_idname = "CHIDO_PT_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'CHIDO'

    def draw(self, context):
        layout = self.layout
        manifest = read_active_project_manifest()
        if manifest:
            layout.label(text=f"Company: {manifest.get('companyCode')}")
            layout.label(text=f"Product: {manifest.get('productCode')}")
            layout.label(text=f"Next Rev: {manifest.get('nextRevision')}")
        layout.operator("chido.import_active_glb")
        layout.operator("chido.export_revision")


def register():
    bpy.utils.register_class(CHIDO_OT_ImportActiveGlb)
    bpy.utils.register_class(CHIDO_OT_ExportRevisionToStudio)
    bpy.utils.register_class(CHIDO_PT_Panel)


def unregister():
    bpy.utils.unregister_class(CHIDO_PT_Panel)
    bpy.utils.unregister_class(CHIDO_OT_ExportRevisionToStudio)
    bpy.utils.unregister_class(CHIDO_OT_ImportActiveGlb)


if __name__ == "__main__":
    register()
    manifest = read_active_project_manifest()
    if manifest and os.path.exists(manifest.get("sourceGlbPath", "")):
        bpy.ops.import_scene.gltf(filepath=manifest["sourceGlbPath"])
