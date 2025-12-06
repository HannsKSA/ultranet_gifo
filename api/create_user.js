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

    const { email, password, role, full_name } = req.body;

    try {
        // 1. Create User in Auth
        const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            user_metadata: { full_name },
            email_confirm: true
        });

        if (error) throw error;

        // 2. Update Role (The database trigger defaults to 'tecnico' unless superadmin)
        // We override it here if a specific role was requested.
        if (role && role !== 'tecnico') {
            const { error: profileError } = await supabaseAdmin
                .from('user_profiles')
                .update({ role: role })
                .eq('id', user.user.id);

            if (profileError) {
                console.warn("Error updating profile role:", profileError);
                // Don't fail the whole request, user is created.
            }
        }

        res.status(200).json({ success: true, message: 'Usuario creado exitosamente' });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}
