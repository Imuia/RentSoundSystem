import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {

    const { data: partners, error } = await supabase
      .from('partners')
      .select('*');

    if (error) throw error;

    const results = [];

    for (const partner of partners) {

      const email = partner.email?.trim().toLowerCase();

      if (!email) continue;

      try {

        const { data: existing } =
          await supabase.auth.admin.listUsers();

        const alreadyExists =
          existing.users.some(
            u => u.email?.toLowerCase() === email
          );

        if (alreadyExists) {
          results.push({
            email,
            status: 'already_exists'
          });
          continue;
        }

        await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            role: 'partner',
            name: partner.name || partner.owner_name || ''
          }
        });

        results.push({
          email,
          status: 'created'
        });

      } catch (err) {

        results.push({
          email,
          status: 'error',
          error: err.message
        });

      }
    }

    return res.status(200).json(results);

  } catch (err) {

    return res.status(500).json({
      error: err.message
    });

  }
}