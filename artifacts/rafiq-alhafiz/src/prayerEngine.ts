import { Coordinates, CalculationMethod, PrayerTimes, Madhab } from "adhan";
import { UserProfile } from "./storage";
import { ScheduledTask } from "./scheduler";
import { getSurahName, getSurahForPage, getPageForAyah } from "./quranData";

export interface PrayerTimeInfo {
  name: string;
  arabicName: string;
  time: Date;
  status: "past" | "upcoming" | "current";
}

export interface DistributedSlot {
  id: string;
  parentPrayer: "الفجر" | "الضحى" | "الظهر" | "العصر" | "المغرب" | "العشاء";
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

  // ── 2. Define the daily prayers and their attached Sunnahs in chronological order
  const slots: { 
    parentPrayer: "الفجر" | "الضحى" | "الظهر" | "العصر" | "المغرب" | "العشاء"; 
    prayerName: string; 
    type: "fard" | "sunnah" | "qiyam"; 
    rakah: number 
  }[] = [];

  const useSunnah = profile.useSunnah ?? true;

  // ── 1. صلاة الفجر ──
  if (useSunnah) {
    slots.push(
      { parentPrayer: "الفجر", prayerName: "سنة الفجر القبلية", type: "sunnah", rakah: 1 },
      { parentPrayer: "الفجر", prayerName: "سنة الفجر القبلية", type: "sunnah", rakah: 2 }
    );
  }
  slots.push(
    { parentPrayer: "الفجر", prayerName: "صلاة الفجر (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "الفجر", prayerName: "صلاة الفجر (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );

  // ── 2. صلاة الضحى ──
  const duhaRakats = profile.duhaRakats ?? 0;
  if (useSunnah && duhaRakats > 0) {
    for (let d = 1; d <= duhaRakats; d++) {
      slots.push({ parentPrayer: "الضحى", prayerName: `سنة الضحى (الركعة ${d})`, type: "sunnah", rakah: d });
    }
  }

  // ── 2. صلاة الظهر ──
  if (useSunnah) {
    slots.push(
      { parentPrayer: "الظهر", prayerName: "سنة الظهر القبلية (الشفع الأول)", type: "sunnah", rakah: 1 },
      { parentPrayer: "الظهر", prayerName: "سنة الظهر القبلية (الشفع الأول)", type: "sunnah", rakah: 2 },
      { parentPrayer: "الظهر", prayerName: "سنة الظهر القبلية (الشفع الثاني)", type: "sunnah", rakah: 3 },
      { parentPrayer: "الظهر", prayerName: "سنة الظهر القبلية (الشفع الثاني)", type: "sunnah", rakah: 4 }
    );
  }
  slots.push(
    { parentPrayer: "الظهر", prayerName: "صلاة الظهر (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "الظهر", prayerName: "صلاة الظهر (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );
  if (useSunnah) {
    slots.push(
      { parentPrayer: "الظهر", prayerName: "سنة الظهر البعدية", type: "sunnah", rakah: 1 },
      { parentPrayer: "الظهر", prayerName: "سنة الظهر البعدية", type: "sunnah", rakah: 2 }
    );
  }

  // ── 3. صلاة العصر ──
  slots.push(
    { parentPrayer: "العصر", prayerName: "صلاة العصر (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "العصر", prayerName: "صلاة العصر (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );

  // ── 4. صلاة المغرب ──
  slots.push(
    { parentPrayer: "المغرب", prayerName: "صلاة المغرب (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "المغرب", prayerName: "صلاة المغرب (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );
  if (useSunnah) {
    slots.push(
      { parentPrayer: "المغرب", prayerName: "سنة المغرب البعدية", type: "sunnah", rakah: 1 },
      { parentPrayer: "المغرب", prayerName: "سنة المغرب البعدية", type: "sunnah", rakah: 2 }
    );
  }

  // ── 5. صلاة العشاء ──
  slots.push(
    { parentPrayer: "العشاء", prayerName: "صلاة العشاء (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "العشاء", prayerName: "صلاة العشاء (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );
  if (useSunnah) {
    slots.push(
      { parentPrayer: "العشاء", prayerName: "سنة العشاء البعدية", type: "sunnah", rakah: 1 },
      { parentPrayer: "العشاء", prayerName: "سنة العشاء البعدية", type: "sunnah", rakah: 2 }
    );
  }
  // Qiyam / Witr associated with Isha / Night
  const qiyamRakats = profile.nightPrayerRakats ?? 0;
  if (qiyamRakats > 0) {
    for (let q = 1; q <= qiyamRakats; q++) {
      slots.push({ parentPrayer: "العشاء", prayerName: `صلاة الوتر وقيام الليل (الركعة ${q})`, type: "qiyam", rakah: q });
    }
  }

  // 3. Distribute the review parts sequentially over available slots
  const distributed: DistributedSlot[] = [];
  
  reviewPartitions.forEach((part, index) => {
    if (slots.length > 0) {
      const slotIndex = index % slots.length;
      const targetSlot = slots[slotIndex];
      
      distributed.push({
        id: `dist-${index}`,
        parentPrayer: targetSlot.parentPrayer,
        prayerName: targetSlot.prayerName,
        prayerType: targetSlot.type,
        rakahNumber: targetSlot.rakah,
        assignedContent: part
      });
    }
  });

  return distributed;
}

/**
 * Distributes today's Khatmah Review (Track 2 - Review Only) across daily prayers & rakats.
 */
export function distributeKhatmahReviewToPrayers(profile: UserProfile): DistributedSlot[] {
  const pages: number[] = [];

  if (profile.reviewOnlyDailyAmountType === "surah_ayah") {
    const surahId = profile.reviewOnlySurahId || 2;
    const fromAyah = profile.reviewOnlyFromAyah || 1;
    const toAyah = profile.reviewOnlyToAyah || 100;
    const startP = getPageForAyah(surahId, fromAyah);
    const endP = getPageForAyah(surahId, toAyah);
    const minP = Math.min(startP, endP);
    const maxP = Math.max(startP, endP);
    for (let p = minP; p <= maxP; p++) {
      pages.push(p);
    }
  } else {
    const startPage = profile.reviewOnlyCurrentPage || 1;
    const amount = profile.reviewOnlyDailyAmountValue || 20;
    const direction = profile.reviewOnlyDirection || "forward";

    if (direction === "forward") {
      for (let i = 0; i < amount; i++) {
        let p = startPage + i;
        if (p > 604) p = ((p - 1) % 604) + 1;
        pages.push(p);
      }
    } else {
      for (let i = 0; i < amount; i++) {
        let p = startPage - i;
        if (p < 1) p = 604 + (p % 604);
        pages.push(p);
      }
    }
  }

  // Generate prayer slots
  const slots: { 
    parentPrayer: "الفجر" | "الضحى" | "الظهر" | "العصر" | "المغرب" | "العشاء"; 
    prayerName: string; 
    type: "fard" | "sunnah" | "qiyam"; 
    rakah: number 
  }[] = [];

  const useSunnah = profile.useSunnah ?? true;

  if (useSunnah) {
    slots.push(
      { parentPrayer: "الفجر", prayerName: "سنة الفجر القبلية", type: "sunnah", rakah: 1 },
      { parentPrayer: "الفجر", prayerName: "سنة الفجر القبلية", type: "sunnah", rakah: 2 }
    );
  }
  slots.push(
    { parentPrayer: "الفجر", prayerName: "صلاة الفجر (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "الفجر", prayerName: "صلاة الفجر (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );

  const duhaRakats = profile.duhaRakats ?? 0;
  if (useSunnah && duhaRakats > 0) {
    for (let d = 1; d <= duhaRakats; d++) {
      slots.push({ parentPrayer: "الضحى", prayerName: `سنة الضحى (الركعة ${d})`, type: "sunnah", rakah: d });
    }
  }

  if (useSunnah) {
    slots.push(
      { parentPrayer: "الظهر", prayerName: "سنة الظهر القبلية (الشفع الأول)", type: "sunnah", rakah: 1 },
      { parentPrayer: "الظهر", prayerName: "سنة الظهر القبلية (الشفع الأول)", type: "sunnah", rakah: 2 },
      { parentPrayer: "الظهر", prayerName: "سنة الظهر القبلية (الشفع الثاني)", type: "sunnah", rakah: 3 },
      { parentPrayer: "الظهر", prayerName: "سنة الظهر القبلية (الشفع الثاني)", type: "sunnah", rakah: 4 }
    );
  }
  slots.push(
    { parentPrayer: "الظهر", prayerName: "صلاة الظهر (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "الظهر", prayerName: "صلاة الظهر (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );
  if (useSunnah) {
    slots.push(
      { parentPrayer: "الظهر", prayerName: "سنة الظهر البعدية", type: "sunnah", rakah: 1 },
      { parentPrayer: "الظهر", prayerName: "سنة الظهر البعدية", type: "sunnah", rakah: 2 }
    );
  }

  slots.push(
    { parentPrayer: "العصر", prayerName: "صلاة العصر (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "العصر", prayerName: "صلاة العصر (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );

  slots.push(
    { parentPrayer: "المغرب", prayerName: "صلاة المغرب (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "المغرب", prayerName: "صلاة المغرب (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );
  if (useSunnah) {
    slots.push(
      { parentPrayer: "المغرب", prayerName: "سنة المغرب البعدية", type: "sunnah", rakah: 1 },
      { parentPrayer: "المغرب", prayerName: "سنة المغرب البعدية", type: "sunnah", rakah: 2 }
    );
  }

  slots.push(
    { parentPrayer: "العشاء", prayerName: "صلاة العشاء (الفرض - الركعة الأولى)", type: "fard", rakah: 1 },
    { parentPrayer: "العشاء", prayerName: "صلاة العشاء (الفرض - الركعة الثانية)", type: "fard", rakah: 2 }
  );
  if (useSunnah) {
    slots.push(
      { parentPrayer: "العشاء", prayerName: "سنة العشاء البعدية", type: "sunnah", rakah: 1 },
      { parentPrayer: "العشاء", prayerName: "سنة العشاء البعدية", type: "sunnah", rakah: 2 }
    );
  }
  const qiyamRakats = profile.nightPrayerRakats ?? 0;
  if (qiyamRakats > 0) {
    for (let q = 1; q <= qiyamRakats; q++) {
      slots.push({ parentPrayer: "العشاء", prayerName: `صلاة الوتر وقيام الليل (الركعة ${q})`, type: "qiyam", rakah: q });
    }
  }

  if (slots.length === 0 || pages.length === 0) return [];

  // Split pages array into chunks for slots
  const distributed: DistributedSlot[] = [];
  const totalPages = pages.length;
  const numSlots = slots.length;

  for (let sIdx = 0; sIdx < numSlots; sIdx++) {
    const slot = slots[sIdx];
    
    // Calculate page range index slice for this slot
    const startIdx = Math.floor((sIdx * totalPages) / numSlots);
    const endIdx = Math.floor(((sIdx + 1) * totalPages) / numSlots);
    
    const slotPages = pages.slice(startIdx, endIdx);
    if (slotPages.length > 0) {
      let contentStr = "";
      if (slotPages.length === 1) {
        const sName = getSurahForPage(slotPages[0]);
        contentStr = `الصحيفة ${slotPages[0]} (سورة ${sName})`;
      } else {
        const firstP = slotPages[0];
        const lastP = slotPages[slotPages.length - 1];
        const sFirstName = getSurahForPage(firstP);
        const sLastName = getSurahForPage(lastP);
        const surahText = sFirstName === sLastName ? `سورة ${sFirstName}` : `سورة ${sFirstName} إلى ${sLastName}`;
        contentStr = `الصحائف من ${firstP} إلى ${lastP} (${surahText})`;
      }

      distributed.push({
        id: `khatmah-dist-${sIdx}`,
        parentPrayer: slot.parentPrayer,
        prayerName: slot.prayerName,
        prayerType: slot.type,
        rakahNumber: slot.rakah,
        assignedContent: contentStr
      });
    }
  }

  return distributed;
}

