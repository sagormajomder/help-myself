"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const translations_1 = require("../src/i18n/translations");
const schedule_calculator_1 = require("../src/utils/schedule-calculator");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}
function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`Assertion failed (${message}): expected ${String(expected)}, got ${String(actual)}`);
    }
}
function runTests() {
    const officeProfile = {
        id: 'office',
        name: 'Office Focus',
        startMinuteOfDay: 10 * 60, // 10:00 AM
        endMinuteOfDay: 17 * 60, // 5:00 PM
        focusMinutes: 60,
        restMinutes: 5,
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        isActive: true,
    };
    // 1. Standard 10:00 AM - 5:00 PM schedule at 10:15 AM
    const morningNow = new Date(2026, 10, 26, 10, 15, 0, 0).getTime();
    const win = (0, schedule_calculator_1.resolveProfileWindow)(officeProfile, morningNow);
    assert(win !== null, 'Expected resolved window');
    assertEqual(win.isActiveDay, true, 'Expected today to be active');
    const schedule = (0, schedule_calculator_1.buildWindowSchedule)(officeProfile, win.windowStartAt, win.windowEndAt);
    assert(schedule.slots.length > 0, 'Expected non-empty slots');
    assertEqual(schedule.slots[0].type, 'focus', 'Slot 0 should be focus');
    assertEqual(schedule.slots[0].durationMinutes, 60, 'Slot 0 duration 60');
    assertEqual(schedule.slots[0].cumulativeFocusMinutes, 60, 'Slot 0 cumulative 60');
    assertEqual(schedule.slots[1].type, 'rest', 'Slot 1 should be rest');
    assertEqual(schedule.slots[1].durationMinutes, 5, 'Slot 1 duration 5');
    assertEqual(schedule.slots[2].type, 'focus', 'Slot 2 should be focus');
    assertEqual(schedule.slots[2].cumulativeFocusMinutes, 120, 'Slot 2 cumulative 120');
    const currentSlot = (0, schedule_calculator_1.findSlotAtTime)(schedule.slots, morningNow, 0);
    assert(currentSlot !== null, 'Expected active slot at 10:15 AM');
    assertEqual(currentSlot.index, 0, 'Active slot index should be 0');
    // 2. Overnight range 10:00 PM - 03:00 AM checked at 01:30 AM next calendar day
    const nightProfile = {
        ...officeProfile,
        id: 'night',
        startMinuteOfDay: 22 * 60,
        endMinuteOfDay: 3 * 60,
        focusMinutes: 60,
        restMinutes: 10,
    };
    const afterMidnight = new Date(2026, 10, 26, 1, 30, 0, 0).getTime();
    const nightWin = (0, schedule_calculator_1.resolveProfileWindow)(nightProfile, afterMidnight);
    assert(nightWin !== null, 'Expected overnight window to stay active past midnight');
    assertEqual(nightWin.windowEndAt > afterMidnight, true, 'Overnight end > 1:30 AM');
    const nightSchedule = (0, schedule_calculator_1.buildWindowSchedule)(nightProfile, nightWin.windowStartAt, nightWin.windowEndAt);
    const nightSlot = (0, schedule_calculator_1.findSlotAtTime)(nightSchedule.slots, afterMidnight, 0);
    assert(nightSlot !== null, 'Expected active slot inside overnight window');
    // 3. Zero-rest profile generates only focus slots
    const noRestProfile = {
        ...officeProfile,
        endMinuteOfDay: 12 * 60, // 2h window
        focusMinutes: 30,
        restMinutes: 0,
    };
    const noRestSchedule = (0, schedule_calculator_1.buildWindowSchedule)(noRestProfile, new Date(2026, 10, 26, 10, 0, 0, 0).getTime(), new Date(2026, 10, 26, 12, 0, 0, 0).getTime());
    assertEqual(noRestSchedule.slots.length, 4, 'Zero-rest 2h/30m should have 4 slots');
    assertEqual(noRestSchedule.slots.every((s) => s.type === 'focus'), true, 'All slots should be focus');
    assertEqual(noRestSchedule.slots[3].cumulativeFocusMinutes, 120, 'Total 120m');
    // 4. Time & i18n formatting checks
    assertEqual((0, schedule_calculator_1.formatMinuteOfDay)(10 * 60), '10:00 AM', '10:00 AM');
    assertEqual((0, schedule_calculator_1.formatMinuteOfDay)(17 * 60), '5:00 PM', '5:00 PM');
    assertEqual((0, translations_1.formatDurationText)(90, 'en'), '1h 30m', 'EN duration');
    assertEqual((0, translations_1.formatDurationText)(90, 'bn'), '1 ঘণ্টা 30 মিনিট', 'BN duration');
    assert((0, translations_1.buildFocusDoneMessage)(60, 5, 'bn').body.includes('5 মিনিট'), 'BN focus message');
    assert((0, translations_1.buildRestDoneMessage)('en').title.includes('Rest Complete'), 'EN rest message');
    assert((0, translations_1.buildRangeDoneMessage)(120, 'en').body.includes('2h'), 'EN range message');
    console.log('All 19 assertions passed!');
}
runTests();
