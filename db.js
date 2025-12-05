// db.js - Auto-generated from .env
const SUPABASE_URL = 'https://tmgvvqodjacatzgiutgt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZ3Z2cW9kamFjYXR6Z2l1dGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MzQxNzQsImV4cCI6MjA4MDIxMDE3NH0.jYH6FEt0IdSA4NRB0wtrjgTn0T3DyVH_uS10KYciGOA';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase initialized with URL:', SUPABASE_URL);
} else {
    console.error('Supabase SDK not loaded');
}
