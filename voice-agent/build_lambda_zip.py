"""
Build script to generate a 100% Linux x86_64 compatible AWS Lambda deployment zip
Works directly on Windows without requiring Docker or a Linux VM!
"""
import os
import shutil
import subprocess
import sys
import zipfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ZIP_OUTPUT = os.path.join(SCRIPT_DIR, "voice-agent-lambda.zip")
STAGING_DIR = os.path.join(SCRIPT_DIR, "lambda_build_staging")
REQUIREMENTS_FILE = os.path.join(SCRIPT_DIR, "requirements.txt")
MAIN_FILE = os.path.join(SCRIPT_DIR, "main.py")

def build_lambda_zip():
    print("[*] Preparing build staging directory...")
    if os.path.exists(STAGING_DIR):
        shutil.rmtree(STAGING_DIR)
    os.makedirs(STAGING_DIR, exist_ok=True)

    if os.path.exists(ZIP_OUTPUT):
        os.remove(ZIP_OUTPUT)

    print("[*] Downloading Linux x86_64 wheels and dependencies...")
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--platform",
        "manylinux2014_x86_64",
        "--target",
        STAGING_DIR,
        "--implementation",
        "cp",
        "--python-version",
        "3.11",
        "--only-binary=:all:",
        "--upgrade",
        "-r",
        REQUIREMENTS_FILE
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[X] Dependency installation failed: {result.stderr}")
        return False

    print("[*] Copying application source files to package root...")
    for filename in ["main.py", "grid_graph.py", "agents.py", "redis_manager.py", "spatial_memory.py", "seed_data.json"]:
        src_path = os.path.join(SCRIPT_DIR, filename)
        if os.path.exists(src_path):
            shutil.copy2(src_path, os.path.join(STAGING_DIR, filename))
            print(f"    -> Copied {filename}")
        else:
            print(f"    [!] Warning: {filename} not found in {SCRIPT_DIR}")


    print(f"[*] Compressing package into {ZIP_OUTPUT} ...")
    with zipfile.ZipFile(ZIP_OUTPUT, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(STAGING_DIR):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, STAGING_DIR)
                zipf.write(full_path, rel_path)

    # Cleanup staging directory
    shutil.rmtree(STAGING_DIR, ignore_errors=True)
    size_mb = os.path.getsize(ZIP_OUTPUT) / (1024 * 1024)
    print(f"[SUCCESS] Successfully built {ZIP_OUTPUT} ({size_mb:.2f} MB)")
    print("[SUCCESS] Ready for upload to AWS Lambda (Runtime: Python 3.11, Handler: main.handler)")
    return True

if __name__ == "__main__":
    success = build_lambda_zip()
    sys.exit(0 if success else 1)
