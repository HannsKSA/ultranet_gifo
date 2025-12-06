import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ success: false, message: 'Server misconfiguration: Missing credentials' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    const { user_id, new_password } = req.body;

    try {
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
            user_id,
            { password: new_password }
        );

        if (error) throw error;

        res.status(200).json({ success: true, message: 'Contraseña actualizada' });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}
