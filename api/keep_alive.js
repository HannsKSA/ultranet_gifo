import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const authHeader = req.headers['authorization'];
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // Vercel Cron jobs send a specific header for security
    // But for now, we'll keep it simple or check for the secret if you want

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, message: 'Missing credentials' });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    try {
        // Query a table to keep the DB active
        // Using a limit 1 to minimize resource usage
        const { data, error } = await supabase.from('user_profiles').select('id').limit(1);

        if (error) throw error;

        return res.status(200).json({
            success: true,
            message: 'Database pinged successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Keep-alive error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
}
