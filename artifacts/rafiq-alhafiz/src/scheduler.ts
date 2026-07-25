import { MemorizationBlock, AppState } from "./storage";

export const INTENSIVE_DAYS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
export const SPACED_DAYS = [12, 14, 16, 21, 31, 41, 55, 66];
export const ALL_REVIEW_DAYS = [...INTENSIVE_DAYS, ...SPACED_DAYS];

/**
 * Calculates number of days between two dates.
 * d1 represents the start date (Memorization Day, Day 1)
 * d2 represents the check date (Review Day)
 */
export function getDaysOffset(startDateStr: string, checkDateStr: string): number {
  const d1 = new Date(startDateStr);
  const d2 = new Date(checkDateStr);
  
  // Set times to midnight to ensure exact day calculations
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // Day 1 is the start day, so Day 2 is diffDays = 1.
}

export interface ScheduledTask {
  block: MemorizationBlock;
  offset: number; // e.g., 2, 14, 66
  type: "memorization" | "review";
  isCompleted: boolean;
}

/**
 * Scanning all memorization blocks to determine which tasks are due for a given date.
 */
export function getTasksForDate(state: AppState, targetDateStr: string): ScheduledTask[] {
  const tasks: ScheduledTask[] = [];
  const completedList = state.completedReviews[targetDateStr] || [];

  state.blocks.forEach((block) => {
    const offset = getDaysOffset(block.startDate, targetDateStr);

    if (offset === 1) {
      // Memorization day itself
      tasks.push({
        block,
        offset,
        type: "memorization",
        isCompleted: state.repetitions[block.id] === 0 || block.status === "completed"
      });
    } else if (ALL_REVIEW_DAYS.includes(offset)) {
      // It is scheduled for a spaced repetition review
      const isCompleted = completedList.includes(block.id);
      tasks.push({
        block,
        offset,
        type: "review",
        isCompleted
      });
    }
  });

  return tasks;
}

/**
 * Groups past blocks into chunks of up to 15 blocks each for cumulative review consolidation.
 */
export function getCumulativeGroups(blocks: MemorizationBlock[]): { id: string; name: string; blocks: MemorizationBlock[] }[] {
  // Sort blocks by start date ascending
  const sorted = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const groups: { id: string; name: string; blocks: MemorizationBlock[] }[] = [];
  
  const groupSize = 15;
  for (let i = 0; i < sorted.length; i += groupSize) {
    const chunk = sorted.slice(i, i + groupSize);
    if (chunk.length > 0) {
      const gNum = Math.floor(i / groupSize) + 1;
      groups.push({
        id: `group-${gNum}`,
        name: `المجموعة التراكمية ${gNum} (من مقرر ${chunk[0].surahId} إلى ${chunk[chunk.length - 1].surahId})`,
        blocks: chunk
      });
    }
  }
  
  return groups;
}

/**
 * Check if the user has hit Day 66 with any of their blocks today, which triggers the cumulative review reminder.
 */
export function hasDay66TriggerToday(state: AppState, todayStr: string): boolean {
  return state.blocks.some(block => {
    const offset = getDaysOffset(block.startDate, todayStr);
    return offset === 66;
  });
}
