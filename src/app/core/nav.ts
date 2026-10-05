/** A single sidebar entry. */
export interface NavItem {
  label: string;
  /** Router path, without the leading slash. */
  path: string;
  /** Inline SVG path data for the item icon (24x24 viewBox, stroked). */
  icon: string;
  /** Marks an area served by an embedded application rather than this portal. */
  embedded?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1h3.5v-5.5h4.5V21h3.5a1 1 0 0 0 1-1V9.75',
  orders:
    'M8 4h8a1 1 0 0 1 1 1v15l-5-2.5L7 20V5a1 1 0 0 1 1-1ZM9.5 8.5h5M9.5 12h5',
  customers:
    'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  payments:
    'M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-7ZM3 11h18M6.5 14.5h3',
  offers:
    'M20.5 11.5 12.9 3.9a1.5 1.5 0 0 0-1.1-.4H5a1.5 1.5 0 0 0-1.5 1.5v6.8c0 .4.2.8.4 1.1l7.6 7.6a1.5 1.5 0 0 0 2.1 0l6.9-6.9a1.5 1.5 0 0 0 0-2.1ZM8 8h.01',
  reports:
    'M4 20V10M10 20V4M16 20v-6M22 20H2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
} as const;

/** Sidebar of the merchant portal. "OMS" is the one area served by an embedded application. */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: 'Dashboard', path: 'dashboard', icon: ICONS.home }],
  },
  {
    label: 'Business',
    items: [
      { label: 'OMS', path: 'oms', icon: ICONS.orders, embedded: true },
      { label: 'Customers', path: 'customers', icon: ICONS.customers },
      { label: 'Payments', path: 'payments', icon: ICONS.payments },
      { label: 'Offers', path: 'offers', icon: ICONS.offers },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', path: 'reports', icon: ICONS.reports },
      { label: 'Settings', path: 'settings', icon: ICONS.settings },
    ],
  },
];
