// Pure fair-split scheduling algorithm, extracted from weekly-schedule.tsx so
// it can be unit tested without a Supabase connection. Behavior must stay
// identical to the inline version this replaced.

export interface AvailabilityRow {
  parent_id: string;
  day_of_week: string;
  can_drive_morning: boolean;
  can_drive_afternoon: boolean;
}

export interface ExceptionRow {
  student_id: string;
  day_of_week: string;
  exception_type: string;
  custom_pickup_time?: string | null;
}

export interface MemberRow {
  student_id: string;
  parent_id: string | null;
}

export interface ScheduleSlot {
  day_of_week: string;
  slot_type: "morning" | "afternoon" | "late_afternoon";
  driver_parent_id: string | null;
  departure_time: string;
  status: "confirmed" | "needs_coverage";
}

export function computeBasicSchedule(
  days: string[],
  availability: AvailabilityRow[],
  exceptions: ExceptionRow[],
  members: MemberRow[]
): ScheduleSlot[] {
  const availMap: Record<string, { morning: string[]; afternoon: string[] }> = {};
  days.forEach((d) => { availMap[d] = { morning: [], afternoon: [] }; });
  availability.forEach((a) => {
    if (a.can_drive_morning) availMap[a.day_of_week].morning.push(a.parent_id);
    if (a.can_drive_afternoon) availMap[a.day_of_week].afternoon.push(a.parent_id);
  });

  const assignCount: Record<string, number> = {};
  members.forEach((m) => { if (m.parent_id) assignCount[m.parent_id] = 0; });

  const newSlots: ScheduleSlot[] = [];

  days.forEach((day) => {
    const am = [...availMap[day].morning].sort((a, b) => (assignCount[a] || 0) - (assignCount[b] || 0));
    if (am.length > 0) {
      assignCount[am[0]] = (assignCount[am[0]] || 0) + 1;
      newSlots.push({ day_of_week: day, slot_type: "morning", driver_parent_id: am[0], departure_time: "07:30:00", status: "confirmed" });
    } else {
      newSlots.push({ day_of_week: day, slot_type: "morning", driver_parent_id: null, departure_time: "07:30:00", status: "needs_coverage" });
    }

    const pm = [...availMap[day].afternoon].sort((a, b) => (assignCount[a] || 0) - (assignCount[b] || 0));
    if (pm.length > 0) {
      assignCount[pm[0]] = (assignCount[pm[0]] || 0) + 1;
      newSlots.push({ day_of_week: day, slot_type: "afternoon", driver_parent_id: pm[0], departure_time: "14:45:00", status: "confirmed" });
    } else {
      newSlots.push({ day_of_week: day, slot_type: "afternoon", driver_parent_id: null, departure_time: "14:45:00", status: "needs_coverage" });
    }

    const lateExceptions = exceptions.filter((e) => e.day_of_week === day && e.exception_type === "late_pickup");
    if (lateExceptions.length === 1) {
      // Single kid with late pickup — their own parent must drive, regardless of fairness
      const family = members.find((m) => m.student_id === lateExceptions[0].student_id);
      const forcedParentId = family?.parent_id || null;
      if (forcedParentId) {
        assignCount[forcedParentId] = (assignCount[forcedParentId] || 0) + 1;
        newSlots.push({ day_of_week: day, slot_type: "late_afternoon", driver_parent_id: forcedParentId, departure_time: lateExceptions[0].custom_pickup_time || "16:30:00", status: "confirmed" });
      } else {
        // Parent not in group yet — fair fallback
        const late = [...availMap[day].afternoon].sort((a, b) => (assignCount[a] || 0) - (assignCount[b] || 0));
        if (late.length > 0) {
          assignCount[late[0]] = (assignCount[late[0]] || 0) + 1;
          newSlots.push({ day_of_week: day, slot_type: "late_afternoon", driver_parent_id: late[0], departure_time: lateExceptions[0].custom_pickup_time || "16:30:00", status: "confirmed" });
        }
      }
    } else if (lateExceptions.length > 1) {
      // Multiple kids with late pickup — assign fairly
      const late = [...availMap[day].afternoon].sort((a, b) => (assignCount[a] || 0) - (assignCount[b] || 0));
      if (late.length > 0) {
        assignCount[late[0]] = (assignCount[late[0]] || 0) + 1;
        newSlots.push({ day_of_week: day, slot_type: "late_afternoon", driver_parent_id: late[0], departure_time: lateExceptions[0].custom_pickup_time || "16:30:00", status: "confirmed" });
      }
    }
  });

  return newSlots;
}
