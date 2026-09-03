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
      directTable: 'reservations',
      readOnly: false,
      statusOptions: ['pending', 'confirmed', 'completed', 'cancelled'],
      id: ['id', 'reservation_id'],
      title: ['equipment_name', 'product_name', 'reference', 'order_reference', 'title', 'id'],
      subtitle: ['customer_name', 'client_name', 'customer_email', 'partner_name', 'partner_email', 'subtitle'],
      status: ['status', 'reservation_status'],
      amount: ['total_price', 'amount', 'total', 'total_amount'],
      date: ['start_date', 'event_date', 'created_at', 'date'],
      location: ['event_city', 'city', 'delivery_city', 'location']
    },
    orders: {
      label: 'Commandes',
      source: 'orders',
      directTable: 'reservations',
      readOnly: false,
      statusOptions: ['pending', 'confirmed', 'completed', 'cancelled'],
      id: ['id', 'order_id', 'reservation_id'],
      title: ['reference', 'order_reference', 'reservation_number', 'equipment_name', 'product_name', 'title', 'id'],
      subtitle: ['customer_name', 'customer_email', 'client_name', 'subtitle'],
      status: ['status', 'reservation_status'],
      amount: ['total_price', 'amount', 'total', 'total_amount'],
      date: ['created_at', 'start_date', 'date'],
      location: ['event_city', 'city', 'location']
    },
    listings: {
      label: 'Annonces & matériel',
      source: 'listings',
      directTable: 'listings',
      readOnly: false,
      statusOptions: ['pending', 'pending_review', 'publish', 'hidden', 'rejected'],
      id: ['id', 'listing_id'],
      title: ['title', 'name', 'equipment_name', 'id'],
      subtitle: ['category', 'subcategory', 'brand', 'partner_name', 'subtitle'],
      status: ['status', 'publication_status', 'is_active'],
      amount: ['daily_price', 'price_per_day', 'price', 'amount'],
      date: ['updated_at', 'created_at', 'date'],
      location: ['city', 'location']
    },
    clients: {
      label: 'Clients',
      source: 'clients',
      directTable: 'profiles',
      readOnly: true,
      statusOptions: [],
      id: ['id', 'user_id'],
      title: ['full_name', 'company_name', 'email', 'title', 'id'],
      subtitle: ['email', 'phone', 'company_name', 'subtitle'],
      status: ['status', 'account_status', 'user_type', 'role'],
      amount: [],
      date: ['created_at', 'updated_at', 'date'],
      location: ['city', 'country', 'location']
    },
    payments: {
      label: 'Paiements Stripe',
      source: 'payments',
      directTable: 'reservations',
      readOnly: true,
      statusOptions: [],
      id: ['rental_payment_intent_id', 'stripe_payment_intent_id', 'id', 'payment_id'],
      title: ['reference', 'order_reference', 'rental_payment_intent_id', 'equipment_name', 'id'],
      subtitle: ['customer_email', 'email', 'customer_name', 'subtitle'],
      status: ['payment_status', 'status'],
      amount: ['total_price', 'amount', 'total', 'total_amount'],
      date: ['paid_at', 'created_at', 'date'],
      location: ['event_city', 'city', 'location']
    },
    invoices: {
      label: 'Factures',
      source: 'invoices',
      directTable: 'reservations',
      readOnly: true,
      statusOptions: [],
      id: ['id', 'invoice_id', 'reservation_id'],
      title: ['invoice_number', 'reference', 'order_reference', 'id'],
      subtitle: ['customer_email', 'email', 'customer_name', 'subtitle'],
      status: ['invoice_status', 'payment_status', 'status'],
      amount: ['total_price', 'amount', 'total', 'total_amount'],
      date: ['invoice_date', 'created_at', 'date'],
      location: ['event_city', 'city', 'location']
    },
    partners: {
      label: 'Partenaires',
      source: 'partners',
      directTable: 'partner_requests',
      readOnly: false,
      statusOptions: ['pending', 'approved', 'rejected'],
      id: ['id', 'partner_id'],
      title: ['company_name', 'full_name', 'contact_name', 'email', 'id'],
      subtitle: ['full_name', 'contact_name', 'email', 'subtitle'],
      status: ['status', 'validation_status'],
      amount: ['fleet_value', 'amount'],
      date: ['created_at', 'updated_at', 'date'],
      location: ['city', 'country', 'location']
    },
    logs: {
      label: 'Journaux',
      source: 'logs',
      directTable: 'logs',
      readOnly: true,
      statusOptions: [],
      id: ['id'],
      title: ['action', 'event_type', 'message', 'title', 'id'],
      subtitle: ['resource', 'resource_id', 'admin_email', 'subtitle'],
      status: ['level', 'status'],
      amount: [],
      date: ['created_at', 'date'],
      location: ['service', 'location']
    }
  }
};
