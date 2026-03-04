import api from "../services/api";

// Types
export interface CalendarSlot {
  slot_id: number;
  calendar_id?: number;
  academic_term_id: number;
  class_group_id?: number;
  subject_id: number;
  user_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location?: string;
  color?: string;
  notes?: string;
  subject_name?: string;
  subject_code?: string;
  instructor_name?: string;
  instructor_lastname?: string;
  class_group_name?: string;
}

export interface CalendarActivity {
  activity_id: number;
  academic_term_id: number;
  class_group_id?: number;
  activity_name: string;
  activity_type: string;
  day_of_week?: number;
  start_date?: string;
  end_date?: string;
  start_time: string;
  end_time: string;
  location?: string;
  description?: string;
  color?: string;
  is_recurring: number;
  class_group_name?: string;
}

export interface CalendarNotification {
  notification_id?: number;
  user_id?: number;
  notification_type: string;
  minutes_before: number;
  is_enabled: number;
  notification_method: string;
}

export interface UpcomingLesson {
  slot_id: number;
  subject_name: string;
  class_name: string;
  location?: string;
  start_time: string;
  end_time: string;
  minutes_until_start: number;
  notification_type: string;
}

export interface MyCalendarResponse {
  slots: CalendarSlot[];
  upcoming: UpcomingLesson[];
  term_id: number;
}

export interface CalendarSetupData {
  academic_term_id: number;
  class_groups?: {
    class_group_id: number;
    name: string;
    grade_name: string;
  }[];
  subjects: {
    subject_id: string;
    name: string;
    code: string;
    teachers: {
      user_id: string;
      first_name: string;
      last_name: string;
      class_group_id: string;
    }[];
  }[];
}

// API Functions

// Get calendar slots (admin)
export const getCalendarSlots = async (params?: {
  academic_term_id?: number;
  class_group_id?: number;
  day_of_week?: number;
}): Promise<CalendarSlot[]> => {
  const response = await api.get<
    | { success: boolean; message: string; data: CalendarSlot[] }
    | { data: CalendarSlot[] }
  >("/calendar/slots", {
    params,
  });
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Create calendar slot (admin)
export const createCalendarSlot = async (data: {
  calendar_id: number;
  academic_term_id: number;
  class_group_id: number;
  subject_id: number;
  user_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location?: string;
  color?: string;
  notes?: string;
}): Promise<{ slot_id: number }> => {
  const response = await api.post<{ data: { slot_id: number } }>(
    "/calendar/slots",
    data,
  );
  return response.data.data;
};

// Update calendar slot (admin)
export const updateCalendarSlot = async (
  id: number,
  data: Partial<CalendarSlot>,
): Promise<{ slot_id: number }> => {
  const response = await api.put<{ data: { slot_id: number } }>(
    `/calendar/slots/${id}`,
    data,
  );
  return response.data.data;
};

// Delete calendar slot (admin)
export const deleteCalendarSlot = async (id: number): Promise<void> => {
  await api.delete(`/calendar/slots/${id}`);
};

// Get calendar setup data (admin)
export const getCalendarSetupData = async (
  academic_term_id?: number,
  class_group_id?: number,
): Promise<CalendarSetupData> => {
  const response = await api.get<
    | { success: boolean; message: string; data: CalendarSetupData }
    | { data: CalendarSetupData }
  >("/calendar/setup-data", {
    params: { academic_term_id, class_group_id },
  });
  // Handle both response formats
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Get calendar activities
export const getCalendarActivities = async (params?: {
  academic_term_id?: number;
  class_group_id?: number;
  day_of_week?: number;
  start_date?: string;
  end_date?: string;
}): Promise<CalendarActivity[]> => {
  const response = await api.get<
    | { success: boolean; message: string; data: CalendarActivity[] }
    | { data: CalendarActivity[] }
  >("/calendar/activities", { params });
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Create calendar activity (admin)
export const createCalendarActivity = async (data: {
  academic_term_id: number;
  class_group_id?: number;
  activity_name: string;
  activity_type: string;
  day_of_week?: number;
  start_date?: string;
  end_date?: string;
  start_time: string;
  end_time: string;
  location?: string;
  description?: string;
  color?: string;
  is_recurring?: number;
}): Promise<{ activity_id: number }> => {
  const response = await api.post<{ data: { activity_id: number } }>(
    "/calendar/activities",
    data,
  );
  return response.data.data;
};

// Update calendar activity (admin)
export const updateCalendarActivity = async (
  id: number,
  data: Partial<CalendarActivity>,
): Promise<{ activity_id: number }> => {
  const response = await api.put<{ data: { activity_id: number } }>(
    `/calendar/activities/${id}`,
    data,
  );
  return response.data.data;
};

// Delete calendar activity (admin)
export const deleteCalendarActivity = async (id: number): Promise<void> => {
  await api.delete(`/calendar/activities/${id}`);
};

// Get instructor's calendar
export const getMyCalendar = async (params?: {
  academic_term_id?: number;
  day_of_week?: number;
}): Promise<MyCalendarResponse> => {
  const response = await api.get<
    | { success: boolean; message: string; data: MyCalendarResponse }
    | { data: MyCalendarResponse }
  >("/calendar/my-calendar", { params });
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Get notification settings
export const getNotificationSettings = async (): Promise<
  CalendarNotification[]
> => {
  const response = await api.get<
    | { success: boolean; message: string; data: CalendarNotification[] }
    | { data: CalendarNotification[] }
  >("/calendar/notifications");
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Update notification settings
export const updateNotificationSettings = async (data: {
  notifications: CalendarNotification[];
}): Promise<CalendarNotification[]> => {
  const response = await api.put<{ data: CalendarNotification[] }>(
    "/calendar/notifications",
    data,
  );
  return response.data.data;
};

// Check upcoming lessons (for notifications)
export const checkUpcomingLessons = async (): Promise<UpcomingLesson[]> => {
  const response = await api.get<
    | { success: boolean; message: string; data: UpcomingLesson[] }
    | { data: UpcomingLesson[] }
  >("/calendar/upcoming");
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Get lesson plan for a slot
export const getLessonPlanForSlot = async (
  slot_id: number,
  date?: string,
): Promise<any> => {
  const response = await api.get<
    | {
        success: boolean;
        message: string;
        data: any;
      }
    | { data: any }
  >(`/calendar/lesson-plan/${slot_id}`, {
    params: date ? { lesson_date: date } : {},
  });
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Get student's enrolled subjects calendar
export const getStudentCalendar = async (params?: {
  academic_term_id?: number;
  academic_year_id?: number;
}): Promise<MyCalendarResponse> => {
  const response = await api.get<
    | { success: boolean; message: string; data: MyCalendarResponse }
    | { data: MyCalendarResponse }
  >("/calendar/student-calendar", { params });
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// ============================================
// Academic Calendar Management
// ============================================

export interface AcademicCalendar {
  calendar_id: number;
  academic_year_id: number;
  academic_term_id: number;
  class_group_id: number;
  name?: string;
  description?: string;
  is_active: number;
  created_at?: string;
  updated_at?: string;
  // Related data
  academic_year_name?: string;
  academic_term_name?: string;
  class_group_name?: string;
  grade_name?: string;
}

// Create a new academic calendar
export const createAcademicCalendar = async (data: {
  academic_year_id: number;
  academic_term_id: number;
  class_group_id: number;
  name?: string;
  description?: string;
}): Promise<{ calendar_id: number }> => {
  const response = await api.post<{ data: { calendar_id: number } }>(
    "/calendar/calendars",
    data,
  );
  return response.data.data;
};

// Get all academic calendars
export const getAcademicCalendars = async (params?: {
  academic_year_id?: number;
  academic_term_id?: number;
  class_group_id?: number;
  is_active?: number;
}): Promise<AcademicCalendar[]> => {
  const response = await api.get<
    | { success: boolean; message: string; data: AcademicCalendar[] }
    | { data: AcademicCalendar[] }
  >("/calendar/calendars", { params });
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Get a single academic calendar
export const getAcademicCalendar = async (
  id: number,
): Promise<AcademicCalendar> => {
  const response = await api.get<
    | { success: boolean; message: string; data: AcademicCalendar }
    | { data: AcademicCalendar }
  >(`/calendar/calendars/${id}`);
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};

// Update an academic calendar
export const updateAcademicCalendar = async (
  id: number,
  data: {
    name?: string;
    description?: string;
    is_active?: number;
  },
): Promise<void> => {
  await api.put(`/calendar/calendars/${id}`, data);
};

// Delete an academic calendar
export const deleteAcademicCalendar = async (id: number): Promise<void> => {
  await api.delete(`/calendar/calendars/${id}`);
};

// Get class groups available for calendar creation
export const getCalendarClassGroups = async (params: {
  academic_year_id: number;
  academic_term_id: number;
}): Promise<
  {
    class_group_id: number;
    name: string;
    grade_name?: string;
    grade_level?: number;
  }[]
> => {
  const response = await api.get<
    | {
        success: boolean;
        message: string;
        data: {
          class_group_id: number;
          name: string;
          grade_name?: string;
          grade_level?: number;
        }[];
      }
    | {
        data: {
          class_group_id: number;
          name: string;
          grade_name?: string;
          grade_level?: number;
        }[];
      }
  >("/calendar/calendars/class-groups", { params });
  const responseData = (response as any).data;
  return (responseData as any).data || responseData;
};
