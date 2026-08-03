/**
 * RentSoundSystem Admin — configuration centrale.
 *
 * Ce fichier ne contient volontairement aucune clé secrète.
 * Le client Supabase est détecté parmi les variables déjà utilisées par le projet.
 * Si votre projet expose un client sous un autre nom, ajoutez-le dans clientCandidates.
 */
window.RSS_ADMIN_CONFIG = {
  siteName: 'RentSoundSystem',
  siteUrl: 'https://rentsoundsystem.com',
  supportEmail: 'support@rentsoundsystem.com',
  pageSize: 12,
  demoMode: false,
  clientCandidates: ['rssSupabase', 'supabaseClient', '_supabase', 'db'],
  resources: {
    reservations: {
      label: 'Réservations',
      tables: ['reservations', 'bookings'],
      id: ['id', 'reservation_id'],
      title: ['reference', 'booking_reference', 'id'],
      subtitle: ['customer_name', 'client_name', 'customer_email', 'email'],
      status: ['status', 'reservation_status'],
      amount: ['total_amount', 'amount', 'total', 'price'],
      date: ['start_date', 'event_date', 'created_at'],
      location: ['city', 'location', 'delivery_city']
    },
    orders: {
      label: 'Commandes & devis',
      tables: ['orders', 'quote_requests', 'quotes'],
      id: ['id', 'order_id'],
      title: ['reference', 'quote_number', 'id'],
      subtitle: ['customer_name', 'name', 'email', 'customer_email'],
      status: ['status', 'quote_status'],
      amount: ['total_amount', 'amount', 'estimated_total'],
      date: ['event_date', 'created_at'],
      location: ['city', 'location']
    },
    listings: {
      label: 'Annonces & matériel',
      tables: ['listings', 'equipment', 'products', 'announcements'],
      id: ['id', 'listing_id'],
      title: ['title', 'name', 'equipment_name'],
      subtitle: ['category', 'subcategory', 'partner_name'],
      status: ['status', 'publication_status', 'is_active'],
      amount: ['daily_price', 'price_per_day', 'price'],
      date: ['updated_at', 'created_at'],
      location: ['city', 'location']
    },
    clients: {
      label: 'Clients',
      tables: ['profiles', 'customers', 'clients'],
      id: ['id', 'user_id'],
      title: ['full_name', 'name', 'company_name', 'email'],
      subtitle: ['email', 'phone'],
      status: ['status', 'account_status', 'user_type'],
      amount: ['lifetime_value', 'total_spent'],
      date: ['last_sign_in_at', 'created_at'],
      location: ['city', 'country']
    },
    payments: {
      label: 'Paiements',
      tables: ['payments', 'transactions', 'payment_records'],
      id: ['id', 'payment_id', 'stripe_payment_intent_id'],
      title: ['reference', 'stripe_payment_intent_id', 'id'],
      subtitle: ['customer_email', 'email', 'payment_method'],
      status: ['status', 'payment_status'],
      amount: ['amount', 'total_amount'],
      date: ['paid_at', 'created_at'],
      location: ['currency', 'country']
    },
    invoices: {
      label: 'Factures',
      tables: ['invoices', 'billing_invoices'],
      id: ['id', 'invoice_id'],
      title: ['invoice_number', 'number', 'id'],
      subtitle: ['customer_name', 'customer_email', 'email'],
      status: ['status', 'payment_status'],
      amount: ['total_amount', 'amount', 'total'],
      date: ['issued_at', 'created_at'],
      location: ['currency', 'country']
    },
    partners: {
      label: 'Partenaires',
      tables: ['partner_applications', 'partners', 'profiles'],
      id: ['id', 'partner_id'],
      title: ['company_name', 'business_name', 'full_name', 'email'],
      subtitle: ['email', 'city', 'country'],
      status: ['status', 'validation_status', 'partner_status'],
      amount: ['revenue', 'total_revenue'],
      date: ['created_at', 'updated_at'],
      location: ['city', 'country']
    },
    logs: {
      label: 'Journaux techniques',
      tables: ['audit_logs', 'webhook_logs', 'system_logs'],
      id: ['id'],
      title: ['action', 'event_type', 'message'],
      subtitle: ['source', 'service', 'user_email'],
      status: ['status', 'level'],
      amount: [],
      date: ['created_at', 'timestamp'],
      location: ['ip_address', 'environment']
    }
  }
};
