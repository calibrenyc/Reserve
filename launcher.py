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
LOCAL_NODE = os.path.join(PROJECT_ROOT, "frontend", ".node", "bin", "node")
VITE_CLI = os.path.join(PROJECT_ROOT, "frontend", "node_modules", "vite", "bin", "vite.js")

# Ensure PYTHONPATH includes PROJECT_ROOT
env = os.environ.copy()
env["PYTHONPATH"] = f"{PROJECT_ROOT};{env.get('PYTHONPATH', '')}"

def main():
    print("=" * 70)
    print("LAUNCHING RESERVE LOCAL-FIRST RESTAURANT BACK-OFFICE PLATFORM")
    print("=" * 70)

    # 1. Always build so the server never serves a stale UI after an update.
    dist_dir = os.path.join(PROJECT_ROOT, "frontend", "dist")
    print("\n[1/3] Building production React desktop bundle...")
    # Prefer the bundled Node runtime so a system npm/npx installation is not required.
    build_command = [LOCAL_NODE, VITE_CLI, "build"] if os.path.exists(LOCAL_NODE) else ["npx", "vite", "build"]
    subprocess.run(build_command, cwd=os.path.join(PROJECT_ROOT, "frontend"), env=env, check=True)

    # 2. Start Single FastAPI Server (serving both React SPA Desktop UI and REST API on port 8000)
    print("\n[2/3] Starting Local Application Server (http://localhost:8000)...")
    backend_proc = subprocess.Popen(
        [PYTHON_EXE, "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"],
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

    print("\nReserve is active! Accessible in your browser at:")
    print("   -> http://localhost:8000")
    print("\nPress Ctrl+C to stop local services.\n")

    try:
        backend_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down Reserve local services...")
        backend_proc.terminate()
        sys.exit(0)

if __name__ == "__main__":
    main()
