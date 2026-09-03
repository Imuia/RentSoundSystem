/**
 * RentSoundSystem Admin — configuration fonctionnelle.
 * La clé ci-dessous est la clé publique/publishable Supabase déjà utilisée par le site.
 * Aucune service_role ni clé Stripe secrète ne doit être placée dans le navigateur.
 */
window.RSS_ADMIN_CONFIG = {
  siteName: 'RentSoundSystem',
  siteUrl: 'https://rentsoundsystem.com',
  loginUrl: '/connexion-inscription.html',
  supportEmail: 'support@rentsoundsystem.com',
  pageSize: 20,
  maxRows: 2000,
  supabaseUrl: 'https://crxofkxinsspfgdsxpiy.supabase.co',
  supabaseAnonKey: 'sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj',
  allowedAdminRoles: ['admin', 'super_admin'],
  clientCandidates: ['rssSupabase', 'supabaseClient', '_supabase', 'db', 'supabaseDb'],

  resources: {
    reservations: {
      label: 'Réservations',
      source: 'reservations',
      readOnly: false,
      statusOptions: ['pending', 'confirmed', 'completed', 'cancelled'],
      id: ['id', 'reservation_id'],
      title: ['title', 'equipment_name', 'product_name', 'reference', 'order_reference', 'id'],
      subtitle: ['subtitle', 'customer_name', 'client_name', 'customer_email', 'partner_name', 'partner_email'],
      status: ['status', 'reservation_status'],
      amount: ['amount', 'total_price', 'total', 'total_amount'],
      date: ['date', 'start_date', 'event_date', 'created_at'],
      location: ['location', 'event_city', 'city', 'delivery_city']
    },
    orders: {
      label: 'Commandes',
      source: 'orders',
      readOnly: false,
      statusOptions: ['pending', 'confirmed', 'completed', 'cancelled'],
      id: ['id', 'order_id', 'reservation_id'],
      title: ['title', 'reference', 'order_reference', 'reservation_number', 'id'],
      subtitle: ['subtitle', 'equipment_name', 'product_name', 'customer_name', 'customer_email'],
      status: ['status', 'reservation_status'],
      amount: ['amount', 'total_price', 'total', 'total_amount'],
      date: ['date', 'created_at', 'start_date'],
      location: ['location', 'event_city', 'city']
    },
    listings: {
      label: 'Annonces & matériel',
      source: 'listings',
      readOnly: false,
      statusOptions: ['pending', 'pending_review', 'publish', 'hidden', 'rejected'],
      id: ['id', 'listing_id'],
      title: ['title', 'name', 'equipment_name', 'id'],
      subtitle: ['subtitle', 'category', 'subcategory', 'brand', 'partner_name'],
      status: ['status', 'publication_status', 'is_active'],
      amount: ['amount', 'price', 'daily_price', 'price_per_day'],
      date: ['date', 'updated_at', 'created_at'],
      location: ['location', 'city']
    },
    clients: {
      label: 'CRM & Clients',
      source: 'clients',
      readOnly: false,
      statusOptions: ['lead', 'prospect', 'active', 'vip', 'inactive'],
      id: ['id', 'user_id'],
      title: ['title', 'full_name', 'company_name', 'email', 'id'],
      subtitle: ['subtitle', 'email', 'phone', 'company_name'],
      status: ['status', 'crm_stage', 'account_status', 'user_type'],
      amount: ['deal_value', 'total_spent', 'total_amount'],
      date: ['date', 'last_contact', 'created_at', 'updated_at'],
      location: ['location', 'city', 'country']
    },
    payments: {
      label: 'Paiements Stripe',
      source: 'payments',
      readOnly: true,
      statusOptions: [],
      id: ['id', 'payment_id', 'stripe_payment_intent_id', 'rental_payment_intent_id'],
      title: ['title', 'reference', 'order_reference', 'rental_payment_intent_id', 'id'],
      subtitle: ['subtitle', 'customer_email', 'email', 'equipment_name'],
      status: ['status', 'payment_status'],
      amount: ['amount', 'total_price', 'total', 'total_amount'],
      date: ['date', 'paid_at', 'created_at'],
      location: ['location', 'event_city', 'city']
    },
    invoices: {
      label: 'Factures',
      source: 'invoices',
      readOnly: true,
      statusOptions: [],
      id: ['id', 'invoice_id', 'reservation_id'],
      title: ['title', 'invoice_number', 'reference', 'order_reference', 'id'],
      subtitle: ['subtitle', 'customer_email', 'email', 'equipment_name'],
      status: ['status', 'invoice_status', 'payment_status'],
      amount: ['amount', 'total_price', 'total', 'total_amount'],
      date: ['date', 'invoice_date', 'created_at'],
      location: ['location', 'event_city', 'city']
    },
    partners: {
      label: 'Partenaires',
      source: 'partners',
      readOnly: false,
      statusOptions: ['pending', 'approved', 'rejected'],
      id: ['id', 'partner_id'],
      title: ['title', 'company_name', 'full_name', 'email', 'id'],
      subtitle: ['subtitle', 'full_name', 'contact_name', 'email'],
      status: ['status', 'validation_status'],
      amount: ['amount', 'fleet_value'],
      date: ['date', 'created_at', 'updated_at'],
      location: ['location', 'city', 'country']
    },
    logs: {
      label: 'Journaux',
      source: 'logs',
      readOnly: true,
      statusOptions: [],
      id: ['id'],
      title: ['title', 'action', 'event_type', 'message', 'id'],
      subtitle: ['subtitle', 'resource', 'resource_id', 'admin_email'],
      status: ['status', 'level'],
      amount: [],
      date: ['date', 'created_at'],
      location: ['location', 'service']
    }
  }
};
