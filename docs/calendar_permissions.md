# Academic Calendar Permissions Documentation

This document describes the 4-tier permission model implemented for the Academic Calendar system.

## 1. CALENDAR ADMIN
**Permission**: `MANAGE_ACADEMIC_CALENDAR`
- **Scope**: Entire Academic Calendar module.
- **Capabilities**: 
  - View all class group grids.
  - Create new academic calendars.
  - Create, update, and delete calendar slots.
  - Create and manage calendar activities (holidays, events, etc.).
  - Access setup data (subject-to-instructor mapping).
- **Use Case**: Registrar or Academic Dean who manages the school-wide schedule.

## 2. MANAGER
**Permission**: `VIEW_ACADEMIC_CALENDAR`
- **Scope**: Entire Academic Calendar module (Broad View).
- **Capabilities**: 
  - View all class group grids to see the full institution schedule.
  - View specific class calendars.
  - View lesson plans for any slot.
- **Restrictions**: 
  - **No Edit Access**: Cannot create calendars or edit/delete slots.
  - Dashboard buttons for management (e.g., "Create Calendar") are hidden.
- **Use Case**: Program Leads or Department Heads who need to oversee schedules without modifying them.

## 3. TEACHER
**Permission**: `VIEW_MY_CALENDAR` / `TEACHER_DASHBOARD`
- **Scope**: Personal Calendar.
- **Capabilities**: 
  - View their assigned teaching schedule.
  - View upcoming lesson alerts (tomorrow's lessons).
  - Manage personal notification settings.
  - View lesson plans for their own slots.
- **Use Case**: Instructors managing their daily teaching routine.

## 4. STUDENT
**Permission**: `VIEW_STUDENT_CALENDAR`
- **Scope**: Personal/Class Schedule.
- **Capabilities**: 
  - View the schedule for their specific class/group.
  - View upcoming lesson alerts.
- **Use Case**: Students checking their timetable.

---

## Technical Enforcement

### Backend
Enforced via the `authorize` middleware in `backend/src/routes/calendar.ts`:
- `GET` routes allow both `MANAGE_ACADEMIC_CALENDAR` and `VIEW_ACADEMIC_CALENDAR`.
- `POST`, `PUT`, `DELETE` routes are reserved strictly for `MANAGE_ACADEMIC_CALENDAR`.

### Frontend
Managed in `AcademicCalendar.tsx`:
- `isBroadView`: Determines if the full multi-class navigation is shown.
- `canEdit`: Determines if interactive elements (Add/Edit modals) are enabled.
