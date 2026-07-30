import { Coordinates, CalculationMethod, PrayerTimes, Madhab } from "adhan";
import { UserProfile } from "./storage";
import { ScheduledTask } from "./scheduler";
import { getSurahName } from "./quranData";

export interface PrayerTimeInfo {
  name: string;
  arabicName: string;
  time: Date;
  status: "past" | "upcoming" | "current";
}

export interface DistributedSlot {
  id: string;
  prayerName: string;
  prayerType: "fard" | "sunnah" | "qiyam";
  rakahNumber: number;
  assignedContent: string; // The part of the review allocated to this rakah
}

/**
 * Calculates current day's prayer times based on user latitude & longitude.
 */
export function calculateTodayPrayers(profile: UserProfile): PrayerTimeInfo[] {
  const coords = new Coordinates(profile.lat, profile.lng);
  const params = CalculationMethod.UmmAlQura();
  params.madhab = Madhab.Shafi; // Standard Shafi calculation, can default to Shafi/Hanafi
  const prayerTimes = new PrayerTimes(coords, new Date(), params);

  const rawPrayers = [
    { name: "Fajr", arabic: "الفجر", time: prayerTimes.fajr },
    { name: "Dhuhr", arabic: "الظهر", time: prayerTimes.dhuhr },
    { name: "Asr", arabic: "العصر", time: prayerTimes.asr },
    { name: "Maghrib", arabic: "المغرب", time: prayerTimes.maghrib },
    { name: "Isha", arabic: "العشاء", time: prayerTimes.isha }
  ];

  const now = new Date();
  
  // Find which prayer is closest
  return rawPrayers.map((p, idx) => {
    let status: "past" | "upcoming" | "current" = "upcoming";
    const pTime = new Date(p.time);
    
    if (now > pTime) {
      status = "past";
    }
    
    // Simple state highlighting first upcoming or last past
    return {
      name: p.name,
      arabicName: p.arabic,
      time: pTime,
      status
    };
  });
}

/**
 * Distributes today's available reviews across the allowed Rak'ahs of prayers
 * based on whether the user is an Imam (Fard loud + silent) or Ma'mum (Silent Fard + Sunnah + Qiyam).
 */
export function distributeReviewsToPrayers(
  reviewTasks: ScheduledTask[],
  profile: UserProfile
): DistributedSlot[] {
  // 1. Gather all tasks that represent REVIEWS of blocks (excluding those already completed and new memorization)
  const activeReviews = reviewTasks.filter(t => t.type === "review" && !t.isCompleted);
  if (activeReviews.length === 0) return [];

  // Generate a flattened array of review strings/parts we need to recite
  // For each block, we say: e.g. "البقرة 1-5" or separate if it is long
  const reviewPartitions: string[] = [];
  activeReviews.forEach(t => {
    const sName = getSurahName(t.block.surahId);
    const range = `سورة ${sName} (الآيات ${t.block.fromAyah} - ${t.block.toAyah})`;
    
    // If the verses are long (e.g., > 10 ayhas), split into 2 rak'ah portions to make it easier for the memory!
    const totalAyats = t.block.toAyah - t.block.fromAyah + 1;
    if (totalAyats > 10) {
      const mid = Math.floor((t.block.fromAyah + t.block.toAyah) / 2);
      reviewPartitions.push(`سورة ${sName} (الآيات ${t.block.fromAyah} - ${mid})`);
      reviewPartitions.push(`سورة ${sName} (الآيات ${mid + 1} - ${t.block.toAyah})`);
    } else {
      reviewPartitions.push(range);
    }
  });

  // 2. Define the eligible prayer rak'ahs based on the user's role profile
  const slots: { prayer: string; type: "fard" | "sunnah" | "qiyam"; rakah: number }[] = [];

  if (profile.prayerRole === "imam") {
    // Imam recites in first 2 rak'ahs of: Fajr (fard), Dhuhr (fard), Asr (fard), Maghrib (fard), Isha (fard)
    slots.push(
      { prayer: "الفجر", type: "fard", rakah: 1 },
      { prayer: "الفجر", type: "fard", rakah: 2 },
      { prayer: "الظهر", type: "fard", rakah: 1 },
      { prayer: "الظهر", type: "fard", rakah: 2 },
      { prayer: "العصر", type: "fard", rakah: 1 },
      { prayer: "العصر", type: "fard", rakah: 2 },
      { prayer: "المغرب", type: "fard", rakah: 1 },
      { prayer: "المغرب", type: "fard", rakah: 2 },
      { prayer: "العشاء", type: "fard", rakah: 1 },
      { prayer: "العشاء", type: "fard", rakah: 2 }
    );
  } else {
    // Ma'mum only recites silently: Dhuhr fard (2 rak'ahs), Asr fard (2 rak'ahs)
    slots.push(
      { prayer: "الظهر", type: "fard", rakah: 1 },
      { prayer: "الظهر", type: "fard", rakah: 2 },
      { prayer: "العصر", type: "fard", rakah: 1 },
      { prayer: "العصر", type: "fard", rakah: 2 }
    );
  }

  // 3. Add eligible Sunnah and Qiyam slots if Sunnah is enabled in profile
  if (profile.useSunnah) {
    slots.push(
      { prayer: "سنة الفجر", type: "sunnah", rakah: 1 },
      { prayer: "سنة الفجر", type: "sunnah", rakah: 2 },
      { prayer: "سنة الظهر البعدية", type: "sunnah", rakah: 1 },
      { prayer: "سنة الظهر البعدية", type: "sunnah", rakah: 2 },
      { prayer: "سنة المغرب", type: "sunnah", rakah: 1 },
      { prayer: "سنة المغرب", type: "sunnah", rakah: 2 },
      { prayer: "سنة العشاء", type: "sunnah", rakah: 1 },
      { prayer: "سنة العشاء", type: "sunnah", rakah: 2 }
    );
  }

  // Add Qiyam slots based on nightPrayerRakats counter in profile (e.g., 2, 4, 8, etc.)
  for (let q = 1; q <= profile.nightPrayerRakats; q++) {
    slots.push({ prayer: "قيام الليل", type: "qiyam", rakah: q });
  }

  // 4. Distribute the review parts sequentially over available slots
  const distributed: DistributedSlot[] = [];
  
  reviewPartitions.forEach((part, index) => {
    // Wrap around if we run out of slots, or restrict to slots length
    if (slots.length > 0) {
      const slotIndex = index % slots.length;
      const targetSlot = slots[slotIndex];
      
      distributed.push({
        id: `dist-${index}`,
        prayerName: targetSlot.prayer,
        prayerType: targetSlot.type,
        rakahNumber: targetSlot.rakah,
        assignedContent: part
      });
    }
  });

  return distributed;
}
