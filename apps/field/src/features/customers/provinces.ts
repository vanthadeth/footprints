/**
 * English names for the province codes in geo_provinces, which only holds
 * the Khmer names. The customer list and briefing show both, Khmer first.
 * 'none' is customer_book's key for customers with no province.
 */
const EN: Record<string, string> = {
  PNH: 'Phnom Penh',
  KND: 'Kandal',
  PRV: 'Prey Veng',
  SVR: 'Svay Rieng',
  TKO: 'Takeo',
  KMP: 'Kampot',
  KEP: 'Kep',
  KSP: 'Kampong Speu',
  KPS: 'Sihanoukville',
  KKG: 'Koh Kong',
  KCN: 'Kampong Chhnang',
  PST: 'Pursat',
  BTB: 'Battambang',
  BMC: 'Banteay Meanchey',
  ODM: 'Oddar Meanchey',
  KTM: 'Kampong Thom',
  SRP: 'Siem Reap',
  KCM: 'Kampong Cham',
  TKM: 'Tbong Khmum',
  MDK: 'Mondulkiri',
  RTK: 'Ratanakiri',
  STR: 'Stung Treng',
  KTR: 'Kratie',
  PVH: 'Preah Vihear',
  PLN: 'Pailin',
  GEN: 'General',
  none: 'Address missing',
}

export const PHNOM_PENH = 'PNH'

export function provinceEnglish(code: string, fallback = ''): string {
  return EN[code] ?? fallback
}
