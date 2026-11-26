"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translations = void 0;
exports.formatDurationText = formatDurationText;
exports.buildFocusDoneMessage = buildFocusDoneMessage;
exports.buildRestDoneMessage = buildRestDoneMessage;
exports.buildRangeDoneMessage = buildRangeDoneMessage;
exports.translations = {
    bn: {
        appName: 'Help Myself',
        tabs: {
            today: 'আজকে',
            schedule: 'শিডিউল',
            stats: 'পরিসংখ্যান',
        },
        phases: {
            inactive: 'বন্ধ আছে',
            outside_range: 'সময়ের বাইরে',
            focusing: 'ফোকাস চলছে',
            resting: 'রেস্ট চলছে',
            paused: 'পজ করা',
            awaiting_rest_ack: 'রেস্ট শুরু করুন',
            awaiting_focus_ack: 'আবার ফোকাস দিন',
            completed_range: 'আজকের রেঞ্জ শেষ',
        },
        today: {
            activeProfile: 'অ্যাক্টিভ প্রোফাইল',
            noProfile: 'কোনো প্রোফাইল নেই',
            timeRange: 'সময়সীমা',
            cycleInfo: 'প্রতি সাইকেল',
            todayTotalFocus: 'আজ মোট ফোকাস',
            cyclesCompleted: 'সম্পন্ন সাইকেল',
            nextAlarmAt: 'পরবর্তী অ্যালার্ম',
            startsAt: 'শুরু হবে',
            noActiveDay: 'আজকের দিনটি অ্যাক্টিভ দিনে সিলেক্ট করা নেই',
            timelineTitle: 'আজকের টাইমলাইন',
            focusLabel: 'ফোকাস',
            restLabel: 'রেস্ট',
            remaining: 'বাকি আছে',
            actions: {
                pause: 'পজ করুন',
                resume: 'চালু করুন',
                startRest: 'রেস্ট শুরু করুন',
                startFocus: 'ফোকাস শুরু করুন',
                skipRest: 'রেস্ট স্কিপ',
                snooze5: '+৫ মি. স্নুজ',
                resetDay: 'রিসেট',
                goToSchedule: 'শিডিউল সেট করুন',
                testAlarm: 'অ্যালার্ম টেস্ট',
            },
            alarmModal: {
                focusDoneTitle: 'ফোকাস সময় পূর্ণ হয়েছে!',
                restDoneTitle: 'রেস্ট শেষ হয়েছে!',
                rangeDoneTitle: 'আজকের ফোকাস রেঞ্জ সম্পন্ন!',
                dismiss: 'ঠিক আছে',
            },
        },
        schedule: {
            title: 'শিডিউল ও সেটিংস',
            profilesTitle: 'ফোকাস প্রোফাইল',
            addProfile: '+ নতুন প্রোফাইল',
            newProfileDefault: 'নতুন রুটিন',
            profileName: 'প্রোফাইলের নাম',
            deleteProfile: 'মুছুন',
            activateProfile: 'চালু করুন',
            activeBadge: 'অ্যাক্টিভ',
            timeRangeTitle: 'দৈনিক সময়সীমা (লোকাল টাইম)',
            startTime: 'শুরু',
            endTime: 'শেষ',
            overnightHint: 'রাত পেরিয়ে পরের দিন পর্যন্ত চলবে (Overnight)',
            focusIntervalTitle: 'কতক্ষণ পরপর অ্যালার্ম দেবে (Focus)',
            restDurationTitle: 'বিরতির সময় (Rest)',
            customMinutes: 'কাস্টম (মিনিট)',
            minutesUnit: 'মিনিট',
            activeDaysTitle: 'সপ্তাহের অ্যাক্টিভ দিন',
            daysShort: ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'],
            settingsTitle: 'অ্যাপ সেটিংস',
            languageLabel: 'ভাষা (Language)',
            autoContinueLabel: 'অটো-কন্টিনিউ মোড',
            autoContinueDesc: 'অন থাকলে রেস্ট শেষে অটো পরের ফোকাস শুরু হবে; অফ থাকলে আপনি বাটন চাপলে শুরু হবে।',
            soundLabel: 'অ্যালার্ম সাউন্ড',
            voiceLabel: 'ভয়েস অ্যানাউন্সমেন্ট',
            voiceDesc: 'অ্যাপ খোলা থাকলে মুখে বলে দেবে, আর লকড থাকলে নোটিফিকেশন ভয়েস ক্লিপ বাজবে।',
            vibrationLabel: 'ভাইব্রেশন',
            saveButton: 'সেভ ও অ্যালার্ম শিডিউল করুন',
            savedToast: 'শিডিউল সেভ ও অ্যালার্ম আপডেট হয়েছে!',
            permissionsTitle: 'পারমিশন ও ডিভাইস',
            exactAlarmOk: 'Exact Alarm পারমিশন চালু আছে',
            exactAlarmMissing: 'সঠিক সময়ে অ্যালার্মের জন্য Exact Alarm পারমিশন দিন',
            requestPermission: 'পারমিশন দিন',
            batteryTipTitle: 'ব্যাকগ্রাউন্ড অ্যালার্ম টিপস',
            batteryTipBody: 'Xiaomi, Samsung বা OnePlus ফোনে ঠিক সময়ে অ্যালার্ম পেতে App Info -> Battery-তে "Unrestricted" সিলেক্ট করুন।',
            validationError: 'শুরু ও শেষের সময় এবং ফোকাস মিনিট সঠিকভাবে দিন (ফোকাস >= ১ মিনিট)।',
        },
        stats: {
            title: 'ফোকাস পরিসংখ্যান',
            todayFocus: 'আজকের ফোকাস',
            weekFocus: 'শেষ ৭ দিন',
            totalCycles: 'মোট সাইকেল',
            streak: 'ধারাবাহিক স্ট্রিক',
            daysUnit: 'দিন',
            last7Days: 'শেষ ৭ দিনের অগ্রগতি',
            recentSessions: 'সাম্প্রতিক ফোকাস সেশন',
            emptyHistory: 'এখনো কোনো ফোকাস সেশন সম্পন্ন হয়নি। প্রথম সাইকেল শেষ হলে এখানে দেখা যাবে!',
            clearHistory: 'হিস্ট্রি মুছুন',
        },
        notifications: {
            channelChimeFocus: 'ফোকাস শেষ (চাইম)',
            channelChimeRest: 'রেস্ট শেষ (চাইম)',
            channelVoiceFocus: 'ফোকাস শেষ (ভয়েস)',
            channelVoiceRest: 'রেস্ট শেষ (ভয়েস)',
            actionStartRest: 'রেস্ট শুরু',
            actionSkipRest: 'স্কিপ রেস্ট',
            actionSnooze: '+৫ মি. স্নুজ',
            actionStartFocus: 'ফোকাস শুরু',
        },
    },
    en: {
        appName: 'Help Myself',
        tabs: {
            today: 'Today',
            schedule: 'Schedule',
            stats: 'Stats',
        },
        phases: {
            inactive: 'Disabled',
            outside_range: 'Outside Range',
            focusing: 'Focusing',
            resting: 'Resting',
            paused: 'Paused',
            awaiting_rest_ack: 'Ready for Rest',
            awaiting_focus_ack: 'Back to Focus',
            completed_range: 'Range Completed',
        },
        today: {
            activeProfile: 'Active Profile',
            noProfile: 'No Profile',
            timeRange: 'Time Range',
            cycleInfo: 'Cycle',
            todayTotalFocus: "Today's Total Focus",
            cyclesCompleted: 'Cycles Completed',
            nextAlarmAt: 'Next Alarm',
            startsAt: 'Starts at',
            noActiveDay: 'Today is not selected in Active Days',
            timelineTitle: "Today's Timeline",
            focusLabel: 'Focus',
            restLabel: 'Rest',
            remaining: 'Remaining',
            actions: {
                pause: 'Pause',
                resume: 'Resume',
                startRest: 'Start Rest',
                startFocus: 'Start Focus',
                skipRest: 'Skip Rest',
                snooze5: 'Snooze +5m',
                resetDay: 'Reset',
                goToSchedule: 'Edit Schedule',
                testAlarm: 'Test Alarm',
            },
            alarmModal: {
                focusDoneTitle: 'Focus Milestone Reached!',
                restDoneTitle: 'Rest Time Over!',
                rangeDoneTitle: 'Daily Range Completed!',
                dismiss: 'Got it',
            },
        },
        schedule: {
            title: 'Schedule & Settings',
            profilesTitle: 'Focus Profiles',
            addProfile: '+ New Profile',
            newProfileDefault: 'New Routine',
            profileName: 'Profile Name',
            deleteProfile: 'Delete',
            activateProfile: 'Activate',
            activeBadge: 'Active',
            timeRangeTitle: 'Daily Time Range (Local Time)',
            startTime: 'Start',
            endTime: 'End',
            overnightHint: 'Runs overnight into the next day',
            focusIntervalTitle: 'Focus Alarm Interval',
            restDurationTitle: 'Rest / Break Duration',
            customMinutes: 'Custom (min)',
            minutesUnit: 'min',
            activeDaysTitle: 'Active Days',
            daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            settingsTitle: 'App Settings',
            languageLabel: 'Language',
            autoContinueLabel: 'Auto-Continue Mode',
            autoContinueDesc: 'When ON, the next focus/rest phase starts automatically. When OFF, you confirm manually.',
            soundLabel: 'Alarm Sound',
            voiceLabel: 'Voice Announcements',
            voiceDesc: 'Speaks dynamic focus totals in foreground and uses bundled voice clips on locked screen.',
            vibrationLabel: 'Vibration',
            saveButton: 'Save & Schedule Alarms',
            savedToast: 'Schedule saved and alarms updated!',
            permissionsTitle: 'Permissions & Device',
            exactAlarmOk: 'Exact Alarm permission granted',
            exactAlarmMissing: 'Grant Exact Alarm permission for on-time alarms',
            requestPermission: 'Grant Permission',
            batteryTipTitle: 'Background Alarm Tip',
            batteryTipBody: 'On Xiaomi, Samsung, or OnePlus phones, set Battery to "Unrestricted" in App Info so alarms are never delayed.',
            validationError: 'Please enter valid start/end times and focus duration (>= 1 min).',
        },
        stats: {
            title: 'Focus Statistics',
            todayFocus: 'Today',
            weekFocus: 'Last 7 Days',
            totalCycles: 'Total Cycles',
            streak: 'Current Streak',
            daysUnit: 'days',
            last7Days: 'Last 7 Days Progress',
            recentSessions: 'Recent Focus Sessions',
            emptyHistory: 'No focus sessions recorded yet. Finish your first cycle to see stats here!',
            clearHistory: 'Clear History',
        },
        notifications: {
            channelChimeFocus: 'Focus Complete (Chime)',
            channelChimeRest: 'Rest Complete (Chime)',
            channelVoiceFocus: 'Focus Complete (Voice)',
            channelVoiceRest: 'Rest Complete (Voice)',
            actionStartRest: 'Start Rest',
            actionSkipRest: 'Skip Rest',
            actionSnooze: 'Snooze +5m',
            actionStartFocus: 'Start Focus',
        },
    },
};
function formatDurationText(totalMinutes, lang) {
    const safeMinutes = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    if (lang === 'bn') {
        if (hours > 0 && mins > 0)
            return `${hours} ঘণ্টা ${mins} মিনিট`;
        if (hours > 0)
            return `${hours} ঘণ্টা`;
        return `${mins} মিনিট`;
    }
    if (hours > 0 && mins > 0)
        return `${hours}h ${mins}m`;
    if (hours > 0)
        return `${hours}h`;
    return `${mins}m`;
}
function buildFocusDoneMessage(cumulativeMinutes, restMinutes, lang) {
    const totalStr = formatDurationText(cumulativeMinutes, lang);
    const restStr = formatDurationText(restMinutes, lang);
    if (lang === 'bn') {
        if (restMinutes > 0) {
            return {
                title: `মোট ${totalStr} ফোকাস সম্পূর্ণ!`,
                body: `তুমি মোট ${totalStr} ফোকাস দিয়ে কাজ করেছো। এখন ${restStr} রেস্ট নাও, তারপর আবার ফোকাস দাও।`,
            };
        }
        return {
            title: `মোট ${totalStr} ফোকাস সম্পূর্ণ!`,
            body: `তুমি মোট ${totalStr} ফোকাস দিয়ে কাজ করেছো। এভাবেই চালিয়ে যাও!`,
        };
    }
    if (restMinutes > 0) {
        return {
            title: `${totalStr} Total Focus Done!`,
            body: `You focused for ${totalStr} in total. Take a ${restStr} rest now, then focus again.`,
        };
    }
    return {
        title: `${totalStr} Total Focus Done!`,
        body: `You focused for ${totalStr} in total. Keep up the great work!`,
    };
}
function buildRestDoneMessage(lang) {
    if (lang === 'bn') {
        return {
            title: 'রেস্ট শেষ! আবার ফোকাস দাও',
            body: 'বিরতির সময় শেষ হয়েছে। চলো আবার ফোকাস শুরু করি!',
        };
    }
    return {
        title: 'Rest Complete! Back to Focus',
        body: 'Your break is over. Let’s start the next focus session!',
    };
}
function buildRangeDoneMessage(totalFocusMinutes, lang) {
    const totalStr = formatDurationText(totalFocusMinutes, lang);
    if (lang === 'bn') {
        return {
            title: 'আজকের টাইম রেঞ্জ শেষ!',
            body: `দারুণ! আজকের পুরো সময়ে তুমি মোট ${totalStr} ফোকাস দিয়ে কাজ করেছো।`,
        };
    }
    return {
        title: 'Daily Time Range Completed!',
        body: `Great job! You focused for ${totalStr} in total during today’s schedule.`,
    };
}
