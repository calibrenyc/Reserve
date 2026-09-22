import React, { useState } from 'react';
import { CalendarDays, Clock, UserPlus, Users, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

interface Shift {
  id: string;
  employee: string;
  role: string;
  day: string;
  time: string;
  hours: number;
}

export const ScheduleView: React.FC = () => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const [shifts] = useState<Shift[]>([
    { id: '1', employee: 'Marco Rossi', role: 'Head Chef', day: 'Monday', time: '08:00 AM - 04:30 PM', hours: 8.5 },
    { id: '2', employee: 'Sarah Jenkins', role: 'Line Cook', day: 'Monday', time: '10:00 AM - 06:30 PM', hours: 8.5 },
    { id: '3', employee: 'David Kim', role: 'Prep Cook', day: 'Monday', time: '07:00 AM - 03:00 PM', hours: 8.0 },
    { id: '4', employee: 'Elena Rostova', role: 'Sous Chef', day: 'Tuesday', time: '08:00 AM - 04:30 PM', hours: 8.5 },
    { id: '5', employee: 'Marco Rossi', role: 'Head Chef', day: 'Wednesday', time: '08:00 AM - 04:30 PM', hours: 8.5 },
    { id: '6', employee: 'Sarah Jenkins', role: 'Line Cook', day: 'Thursday', time: '11:00 AM - 07:30 PM', hours: 8.5 },
    { id: '7', employee: 'David Kim', role: 'Prep Cook', day: 'Friday', time: '07:00 AM - 03:00 PM', hours: 8.0 },
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-sky-400" />
            Team Schedule
          </h2>
          <p className="text-slate-400 text-sm">Weekly staff shifts, roster planning, and labor tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-semibold flex items-center gap-2 border border-zinc-700">
            <UserPlus className="w-4 h-4 text-sky-400" />
            Add Staff
          </button>
          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-lg shadow-emerald-950/40">
            <Plus className="w-4 h-4" />
            New Shift
          </button>
        </div>
      </div>

      {/* Week Selector Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-slate-100">Week of Sept 21 - Sept 27, 2026</span>
          <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-zinc-400">
            <Users className="w-4 h-4 text-amber-400" />
            <span>Active Staff: <strong className="text-white">8</strong></span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Total Hours: <strong className="text-white">164.5 hrs</strong></span>
          </div>
        </div>
      </div>

      {/* Roster Calendar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {days.map((day) => {
          const dayShifts = shifts.filter(s => s.day === day);
          const isToday = day === 'Monday';
          return (
            <div
              key={day}
              className={`bg-zinc-900 border rounded-xl p-3 min-h-[320px] flex flex-col justify-between ${
                isToday ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-zinc-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {day}
                  </span>
                  {isToday && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full">
                      Today
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 p-2.5 rounded-lg text-xs transition-colors"
                    >
                      <p className="font-semibold text-slate-100">{shift.employee}</p>
                      <p className="text-[11px] text-sky-400">{shift.role}</p>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400 border-t border-zinc-900 pt-1.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          {shift.time}
                        </span>
                      </div>
                    </div>
                  ))}

                  {dayShifts.length === 0 && (
                    <div className="py-8 text-center text-xs text-zinc-600 italic">
                      No shifts scheduled
                    </div>
                  )}
                </div>
              </div>

              <button className="mt-3 w-full py-1.5 border border-dashed border-zinc-800 hover:border-zinc-700 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1">
                <Plus className="w-3 h-3" />
                Add Shift
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

