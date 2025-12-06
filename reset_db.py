import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set")
    sys.exit(1)

def reset_db():
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.set_isolation_level(0) # Autocommit
        cur = conn.cursor()
        
        print("Dropping tables...")
        cur.execute("DROP TABLE IF EXISTS project_assignments CASCADE;")
        cur.execute("DROP TABLE IF EXISTS user_profiles CASCADE;")
        cur.execute("DROP TABLE IF EXISTS connections CASCADE;")
        cur.execute("DROP TABLE IF EXISTS nodes CASCADE;")
        cur.execute("DROP TABLE IF EXISTS projects CASCADE;")
        
        print("Cleaning up auth.users...")
        # Delete specific users or all? User asked to "vaciar la db".
        # Let's delete the superadmin(s) to be sure we can recreate them.
        # Actually, let's look for our env user.
        SUPER_EMAIL = os.getenv("USER_SUPERADMIN_EMAIL", "hannssa@gmail.com")
        cur.execute("DELETE FROM auth.users WHERE email = %s;", (SUPER_EMAIL,))
        # Also try the typo version just in case it got created
        cur.execute("DELETE FROM auth.users WHERE email = 'hannnsa@gmail.com';")
        
        print("Database cleared.")
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error resetting database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    confirm = input("Are you sure you want to DESTROY all data? (y/n): ")
    if confirm.lower() == 'y':
        reset_db()
    else:
        print("Cancelled.")
