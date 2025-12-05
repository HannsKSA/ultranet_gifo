#!/usr/bin/env python3
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not found in .env file.")
    exit(1)

# Generate db.js with current credentials
db_js_content = f"""// db.js - Auto-generated from .env
const SUPABASE_URL = '{SUPABASE_URL}';
const SUPABASE_KEY = '{SUPABASE_KEY}';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {{
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase initialized with URL:', SUPABASE_URL);
}} else {{
    console.error('Supabase SDK not loaded');
}}
"""

with open('db.js', 'w') as f:
    f.write(db_js_content)

print("db.js generated successfully with credentials from .env")
