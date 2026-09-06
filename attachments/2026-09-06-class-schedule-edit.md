# Class schedule edit — locked 2026-09-06

## Decisions

D1. Clash policy (create + series-edit, same):
- clashN = count of generated slots that hard-clash GV or phòng (online room skips room).
- clashN == 0 → apply.
- 0 < clashN < 5 → apply non-clash slots; prompt to cover each clash slot as ad-hoc ("Học bù" path). User can create / skip each. Do not silent-drop without the prompt.
- clashN >= 5 → hard-block. Large modal + monthly calendar: clash days marked, who holds GV/phòng, no partial apply.

D2. This-and-future: IN this slice.
- Occurrence = only that session (override=true).
- This-and-future = new rule from that session's start; frozen past unchanged; leftover dates in old rule after split become implicit EXDATE (cancel if no attendance, else keep + override).
- All-future from class edit = same as this-and-future from first mutable lesson.

## Clock
- clock = g.meta.clock
- frozen = lesson.start <= clock OR attendance/homework/makeup-target exists
- mutable = regular, !override, !is_makeup, start > clock
- in-progress (start <= clock < end) = frozen
- finished / cancelled class = no schedule change (series or occurrence)

## Recurrence
- Keep weekly days[] + duration_min. No rrule lib.
- enumerateRecurrence: one slot per weekday; pass fromDate = first mutable instant on running series.
- Horizon 42d unless end_date earlier.

## Resources
- GV/phòng: hard clash (self except class/lesson ids).
- Student overlap + capacity: warn only.
- Makeup / override / substitute=true: series does not rewrite.
- Cancelled future: do not resurrect on rematerialize.
- Keep lesson ids when date stays.

## UI
- Class edit reuses create schedule+calendar (not name-only modal).
- Occurrence + this-and-future actions on lesson/calendar event.
- Running banner: N frozen / M will change.
- Clash>=5: large monthly calendar modal.

## Out
- RFC5545 persist, holiday calendar, billing recalc, Zalo auto-send, cross-branch seats.
