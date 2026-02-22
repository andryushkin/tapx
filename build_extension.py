# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///

import os
import sys
import zipfile
from pathlib import Path

def create_archive(target='chrome'):
    base_dir = Path("/Users/andryushkin/Server/tapx")

    if target == 'firefox':
        output_zip = base_dir / "tapx_firefox.zip"
        manifest_src = "manifest-firefox.json"
        store_name = "Firefox Add-ons"
    else:
        output_zip = base_dir / "tapx_release.zip"
        manifest_src = "manifest.json"
        store_name = "Chrome Web Store"

    # Folders and files bundled into the extension (manifest added separately)
    targets = ["popup", "content", "background", "icons"]

    print(f"🚀 Starting build for {output_zip.name} (target: {target})...")

    manifest_path = base_dir / manifest_src
    if not manifest_path.exists():
        print(f"❌ Error: '{manifest_src}' not found.")
        return

    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Manifest always goes in as manifest.json
        zf.write(manifest_path, "manifest.json")

        for t in targets:
            target_path = base_dir / t

            if not target_path.exists():
                print(f"⚠️ Warning: '{t}' does not exist and will be skipped.")
                continue

            if target_path.is_file():
                zf.write(target_path, t)
            elif target_path.is_dir():
                for root, _, files in os.walk(target_path):
                    for file in files:
                        if file.endswith('.DS_Store') or file.endswith('.git'):
                            continue
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(base_dir)
                        zf.write(file_path, arcname)

    # Output verification
    print("\n📦 Archive contents:")
    with zipfile.ZipFile(output_zip, 'r') as zf:
        for info in zf.infolist():
            print(f"  - {info.filename}")

    size_kb = output_zip.stat().st_size / 1024
    print(f"\n✅ Packaged successfully! File size: {size_kb:.1f} KB")
    print(f"📁 Export location: {output_zip.absolute()}")
    print(f"🌟 Ready to upload to {store_name}!")

if __name__ == "__main__":
    target = 'chrome'
    if '--target' in sys.argv:
        idx = sys.argv.index('--target')
        if idx + 1 < len(sys.argv):
            target = sys.argv[idx + 1]
    create_archive(target)
