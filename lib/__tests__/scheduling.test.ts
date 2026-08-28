import { computeBasicSchedule, AvailabilityRow, ExceptionRow, MemberRow } from "../scheduling";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function member(studentId: string, parentId: string | null): MemberRow {
  return { student_id: studentId, parent_id: parentId };
}

describe("computeBasicSchedule", () => {
  it("assigns morning and afternoon slots to an available parent", () => {
    const availability: AvailabilityRow[] = [
      { parent_id: "p1", day_of_week: "Mon", can_drive_morning: true, can_drive_afternoon: true },
    ];
    const slots = computeBasicSchedule(["Mon"], availability, [], [member("s1", "p1")]);

    const morning = slots.find((s) => s.slot_type === "morning");
    const afternoon = slots.find((s) => s.slot_type === "afternoon");
    expect(morning).toMatchObject({ driver_parent_id: "p1", status: "confirmed", departure_time: "07:30:00" });
    expect(afternoon).toMatchObject({ driver_parent_id: "p1", status: "confirmed", departure_time: "14:45:00" });
  });

  it("marks a slot needs_coverage with a null driver when nobody is available", () => {
    const slots = computeBasicSchedule(["Mon"], [], [], [member("s1", "p1")]);
    const morning = slots.find((s) => s.slot_type === "morning");
    expect(morning).toMatchObject({ driver_parent_id: null, status: "needs_coverage" });
  });

  it("produces exactly one morning and one afternoon slot per day, no late slot without exceptions", () => {
    const slots = computeBasicSchedule(DAYS, [], [], []);
    expect(slots).toHaveLength(DAYS.length * 2);
    expect(slots.filter((s) => s.slot_type === "late_afternoon")).toHaveLength(0);
  });

  it("splits driving fairly across multiple available parents (least-loaded first)", () => {
    const availability: AvailabilityRow[] = DAYS.flatMap((day) => ([
      { parent_id: "p1", day_of_week: day, can_drive_morning: true, can_drive_afternoon: false },
      { parent_id: "p2", day_of_week: day, can_drive_morning: true, can_drive_afternoon: false },
    ]));
    const slots = computeBasicSchedule(DAYS, availability, [], [member("s1", "p1"), member("s2", "p2")]);
    const morningSlots = slots.filter((s) => s.slot_type === "morning");
    const p1Count = morningSlots.filter((s) => s.driver_parent_id === "p1").length;
    const p2Count = morningSlots.filter((s) => s.driver_parent_id === "p2").length;
    // 5 weekdays split between 2 equally-available parents should be as even as possible
    expect(Math.abs(p1Count - p2Count)).toBeLessThanOrEqual(1);
    expect(p1Count + p2Count).toBe(DAYS.length);
  });

  it("forces the student's own parent onto late_afternoon when exactly one late_pickup exception exists, even if unavailable", () => {
    const availability: AvailabilityRow[] = [
      // p1 (the late student's parent) marked NOT available afternoon — should be overridden
      { parent_id: "p1", day_of_week: "Mon", can_drive_morning: true, can_drive_afternoon: false },
      { parent_id: "p2", day_of_week: "Mon", can_drive_morning: true, can_drive_afternoon: true },
    ];
    const exceptions: ExceptionRow[] = [
      { student_id: "s1", day_of_week: "Mon", exception_type: "late_pickup", custom_pickup_time: "16:00:00" },
    ];
    const members = [member("s1", "p1"), member("s2", "p2")];
    const slots = computeBasicSchedule(["Mon"], availability, exceptions, members);

    const late = slots.find((s) => s.slot_type === "late_afternoon");
    expect(late).toMatchObject({ driver_parent_id: "p1", status: "confirmed", departure_time: "16:00:00" });
    // the regular afternoon slot still goes to a fairly-assigned parent (p2, the only one available)
    const afternoon = slots.find((s) => s.slot_type === "afternoon");
    expect(afternoon?.driver_parent_id).toBe("p2");
  });

  it("defaults the late_afternoon departure time to 16:30:00 when no custom_pickup_time is given", () => {
    const exceptions: ExceptionRow[] = [
      { student_id: "s1", day_of_week: "Mon", exception_type: "late_pickup" },
    ];
    const members = [member("s1", "p1")];
    const slots = computeBasicSchedule(["Mon"], [], exceptions, members);
    const late = slots.find((s) => s.slot_type === "late_afternoon");
    expect(late?.departure_time).toBe("16:30:00");
  });

  it("falls back to fair assignment among available afternoon parents when the late student's family has no linked parent yet", () => {
    const availability: AvailabilityRow[] = [
      { parent_id: "p2", day_of_week: "Mon", can_drive_morning: true, can_drive_afternoon: true },
    ];
    const exceptions: ExceptionRow[] = [
      { student_id: "s1", day_of_week: "Mon", exception_type: "late_pickup" },
    ];
    // s1's own family has no parent_id (parent hasn't joined yet)
    const members = [member("s1", null), member("s2", "p2")];
    const slots = computeBasicSchedule(["Mon"], availability, exceptions, members);
    const late = slots.find((s) => s.slot_type === "late_afternoon");
    expect(late?.driver_parent_id).toBe("p2");
  });

  it("assigns late_afternoon fairly among available parents when multiple students have late_pickup the same day", () => {
    const availability: AvailabilityRow[] = [
      { parent_id: "p1", day_of_week: "Mon", can_drive_morning: false, can_drive_afternoon: true },
      { parent_id: "p2", day_of_week: "Mon", can_drive_morning: false, can_drive_afternoon: true },
    ];
    const exceptions: ExceptionRow[] = [
      { student_id: "s1", day_of_week: "Mon", exception_type: "late_pickup" },
      { student_id: "s2", day_of_week: "Mon", exception_type: "late_pickup" },
    ];
    const members = [member("s1", "p1"), member("s2", "p2")];
    const slots = computeBasicSchedule(["Mon"], availability, exceptions, members);

    // exactly one late_afternoon slot is created (not one per exception)
    expect(slots.filter((s) => s.slot_type === "late_afternoon")).toHaveLength(1);
  });

  it("leaves late_afternoon uncreated (not needs_coverage) when nobody is available and there are multiple late exceptions", () => {
    const exceptions: ExceptionRow[] = [
      { student_id: "s1", day_of_week: "Mon", exception_type: "late_pickup" },
      { student_id: "s2", day_of_week: "Mon", exception_type: "late_pickup" },
    ];
    const members = [member("s1", "p1"), member("s2", "p2")];
    const slots = computeBasicSchedule(["Mon"], [], exceptions, members);
    expect(slots.filter((s) => s.slot_type === "late_afternoon")).toHaveLength(0);
  });

  it("ignores exceptions on days that are not late_pickup type", () => {
    const exceptions: ExceptionRow[] = [
      { student_id: "s1", day_of_week: "Mon", exception_type: "no_ride" },
    ];
    const members = [member("s1", "p1")];
    const slots = computeBasicSchedule(["Mon"], [], exceptions, members);
    expect(slots.filter((s) => s.slot_type === "late_afternoon")).toHaveLength(0);
  });

  describe("consolidateLatePickups", () => {
    it("collapses a single late_pickup exception into one fairly-assigned late_afternoon slot, no separate afternoon slot", () => {
      const availability: AvailabilityRow[] = [
        { parent_id: "p1", day_of_week: "Mon", can_drive_morning: false, can_drive_afternoon: true },
        { parent_id: "p2", day_of_week: "Mon", can_drive_morning: false, can_drive_afternoon: true },
      ];
      const exceptions: ExceptionRow[] = [
        { student_id: "s1", day_of_week: "Mon", exception_type: "late_pickup", custom_pickup_time: "16:15:00" },
      ];
      // s1's own parent is p1, but with consolidation on, fairness applies instead of forcing p1
      const members = [member("s1", "p1"), member("s2", "p2")];
      const slots = computeBasicSchedule(["Mon"], availability, exceptions, members, true);

      expect(slots.filter((s) => s.slot_type === "afternoon")).toHaveLength(0);
      const late = slots.filter((s) => s.slot_type === "late_afternoon");
      expect(late).toHaveLength(1);
      expect(late[0]).toMatchObject({ departure_time: "16:15:00", status: "confirmed" });
    });

    it("gives a needs_normal_pickup student their own normal-time slot with their own parent, while everyone else shares the late trip", () => {
      const availability: AvailabilityRow[] = [
        { parent_id: "p1", day_of_week: "Mon", can_drive_morning: false, can_drive_afternoon: true },
        { parent_id: "p2", day_of_week: "Mon", can_drive_morning: false, can_drive_afternoon: true },
      ];
      const exceptions: ExceptionRow[] = [
        { student_id: "s1", day_of_week: "Mon", exception_type: "late_pickup" },
        { student_id: "s2", day_of_week: "Mon", exception_type: "needs_normal_pickup" },
      ];
      const members = [member("s1", "p1"), member("s2", "p2")];
      const slots = computeBasicSchedule(["Mon"], availability, exceptions, members, true);

      const afternoon = slots.filter((s) => s.slot_type === "afternoon");
      expect(afternoon).toHaveLength(1);
      expect(afternoon[0]).toMatchObject({ driver_parent_id: "p2", departure_time: "14:45:00", status: "confirmed" });

      const late = slots.filter((s) => s.slot_type === "late_afternoon");
      expect(late).toHaveLength(1);
    });

    it("leaves the default (unset) three-way split unchanged when consolidateLatePickups is not passed", () => {
      const availability: AvailabilityRow[] = [
        { parent_id: "p1", day_of_week: "Mon", can_drive_morning: false, can_drive_afternoon: true },
      ];
      const exceptions: ExceptionRow[] = [
        { student_id: "s1", day_of_week: "Mon", exception_type: "late_pickup" },
      ];
      const members = [member("s1", "p1")];
      const slots = computeBasicSchedule(["Mon"], availability, exceptions, members);
      expect(slots.filter((s) => s.slot_type === "afternoon")).toHaveLength(1);
      expect(slots.filter((s) => s.slot_type === "late_afternoon")).toHaveLength(1);
    });
  });
});
