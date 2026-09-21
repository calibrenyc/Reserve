#!/usr/bin/env python3
import os
import sys
import subprocess
import time
import webbrowser

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
VENV_BIN = os.path.join(PROJECT_ROOT, "venv", "bin")
PYTHON_EXE = os.path.join(VENV_BIN, "python")
UVICORN_EXE = os.path.join(VENV_BIN, "uvicorn")
NPX_EXE = os.path.join(VENV_BIN, "npx")

# Ensure PATH includes virtual environment binaries (node, npm, python) and PYTHONPATH includes PROJECT_ROOT
env = os.environ.copy()
env["PATH"] = f"{VENV_BIN}:{env.get('PATH', '')}"
env["PYTHONPATH"] = f"{PROJECT_ROOT}:{env.get('PYTHONPATH', '')}"

def main():
    print("=" * 70)
    print("🚀 LAUNCHING RESERVE LOCAL-FIRST RESTAURANT BACK-OFFICE PLATFORM")
    print("=" * 70)

    # 1. Check & build frontend bundle if missing
    dist_dir = os.path.join(PROJECT_ROOT, "frontend", "dist")
    if not os.path.exists(dist_dir):
        print("\n[1/3] Building production React desktop bundle...")
        subprocess.run([NPX_EXE, "vite", "build"], cwd=os.path.join(PROJECT_ROOT, "frontend"), env=env, check=True)

    # 2. Start Single FastAPI Server (serving both React SPA Desktop UI and REST API on port 8000)
    print("\n[2/3] Starting Local Application Server (http://localhost:8000)...")
    backend_proc = subprocess.Popen(
        [UVICORN_EXE, "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=PROJECT_ROOT,
        env=env
    )

    time.sleep(2)

    # 3. Open Browser
    print("[3/3] Opening browser at http://localhost:8000 ...")
    try:
        webbrowser.open("http://localhost:8000")
    except Exception:
        pass

    print("\n✨ Reserve is active! Accessible in your browser at:")
    print("   👉 http://localhost:8000")
    print("\nPress Ctrl+C to stop local services.\n")

    try:
        backend_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down Reserve local services...")
        backend_proc.terminate()
        sys.exit(0)

if __name__ == "__main__":
    main()
