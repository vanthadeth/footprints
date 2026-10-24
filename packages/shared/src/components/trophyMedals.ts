import type { Tier, TrophyId } from './trophies'
import salesGold from '../assets/trophies/sales-gold.png'
import salesSilver from '../assets/trophies/sales-silver.png'
import visitsGold from '../assets/trophies/visits-gold.png'
import visitsSilver from '../assets/trophies/visits-silver.png'
import newcustomerGold from '../assets/trophies/newcustomer-gold.png'
import newcustomerSilver from '../assets/trophies/newcustomer-silver.png'
import attendanceGold from '../assets/trophies/attendance-gold.png'
import attendanceSilver from '../assets/trophies/attendance-silver.png'
import systemGold from '../assets/trophies/system-gold.png'
import systemSilver from '../assets/trophies/system-silver.png'

/** The medal set: gold and silver for each trophy. */
export const MEDAL: Record<TrophyId, Record<Tier, string>> = {
  sales: { gold: salesGold, silver: salesSilver },
  visits: { gold: visitsGold, silver: visitsSilver },
  newcustomer: { gold: newcustomerGold, silver: newcustomerSilver },
  attendance: { gold: attendanceGold, silver: attendanceSilver },
  system: { gold: systemGold, silver: systemSilver },
}
