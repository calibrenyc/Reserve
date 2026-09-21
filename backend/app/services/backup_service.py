import os
import shutil
import zipfile
import datetime

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

class BackupService:
    @staticmethod
    def create_backup(backup_name: str = None) -> str:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        if not backup_name:
            backup_name = f"reserve_backup_{timestamp}.zip"
        else:
            if not backup_name.endswith(".zip"):
                backup_name = f"{backup_name}_{timestamp}.zip"

        backup_path = os.path.join(BACKUP_DIR, backup_name)

        with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(DATA_DIR):
                # Exclude backups folder itself to avoid recursing infinitely
                if os.path.abspath(root).startswith(BACKUP_DIR):
                    continue
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, DATA_DIR)
                    zipf.write(file_path, arcname)

        BackupService.enforce_retention()
        return backup_path

    @staticmethod
    def list_backups():
        backups = []
        if os.path.exists(BACKUP_DIR):
            for f in sorted(os.listdir(BACKUP_DIR), reverse=True):
                if f.endswith(".zip"):
                    path = os.path.join(BACKUP_DIR, f)
                    stat = os.stat(path)
                    backups.append({
                        "filename": f,
                        "size_bytes": stat.st_size,
                        "created_at": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
        return backups

    @staticmethod
    def enforce_retention(max_backups: int = 15):
        backups = BackupService.list_backups()
        if len(backups) > max_backups:
            for b in backups[max_backups:]:
                try:
                    os.remove(os.path.join(BACKUP_DIR, b["filename"]))
                except Exception as e:
                    print(f"Error removing old backup {b['filename']}: {e}")

    @staticmethod
    def restore_backup(backup_filename: str) -> bool:
        zip_path = os.path.join(BACKUP_DIR, backup_filename)
        if not os.path.exists(zip_path):
            raise FileNotFoundError(f"Backup file {backup_filename} not found.")

        # Create temporary directory for extraction
        temp_dir = os.path.join(BACKUP_DIR, "temp_restore")
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path, 'r') as zipf:
            zipf.extractall(temp_dir)

        # Copy restored database and files into DATA_DIR
        for item in os.listdir(temp_dir):
            src = os.path.join(temp_dir, item)
            dst = os.path.join(DATA_DIR, item)
            if item == "backups":
                continue
            if os.path.isdir(src):
                if os.path.exists(dst):
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)

        shutil.rmtree(temp_dir)
        return True

