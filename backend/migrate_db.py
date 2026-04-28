import sqlite3
import os

db_path = "d:/BIAS-0/backend/unbiased_ai.db"

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check for decision column
    cursor.execute("PRAGMA table_info(audit_runs)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if "decision" not in columns:
        print("Adding 'decision' column to audit_runs...")
        cursor.execute("ALTER TABLE audit_runs ADD COLUMN decision VARCHAR(50) DEFAULT 'UNKNOWN'")
    
    if "full_result_json" not in columns:
        print("Adding 'full_result_json' column to audit_runs...")
        cursor.execute("ALTER TABLE audit_runs ADD COLUMN full_result_json JSON DEFAULT '{}'")
    
    if "accuracy" not in columns:
        print("Adding 'accuracy' column to audit_runs...")
        cursor.execute("ALTER TABLE audit_runs ADD COLUMN accuracy FLOAT DEFAULT 0.0")

    if "task_id" not in columns:
        print("Adding 'task_id' column to audit_runs...")
        cursor.execute("ALTER TABLE audit_runs ADD COLUMN task_id VARCHAR(100)")
    
    # Check for max_step column in projects table
    cursor.execute("PRAGMA table_info(projects)")
    proj_columns = [row[1] for row in cursor.fetchall()]
    if "max_step" not in proj_columns:
        print("Adding 'max_step' column to projects...")
        cursor.execute("ALTER TABLE projects ADD COLUMN max_step INTEGER DEFAULT 1")
    
    conn.commit()
    conn.close()
    print("Database migration check complete.")
else:
    print("Database file not found, skipping migration check.")
