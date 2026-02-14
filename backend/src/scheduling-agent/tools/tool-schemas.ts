import { z } from 'zod';

export const findAvailableSlotsSchema = z.object({
  providerId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(5).max(480),
  timeOfDay: z.enum(['morning', 'afternoon', 'evening']).optional(),
  preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
  maxResults: z.number().int().min(1).max(50).optional(),
});

export const getProviderAvailabilitySchema = z.object({
  providerId: z.string().min(1),
});

export const holdSlotSchema = z.object({
  providerId: z.string().min(1),
  startTime: z.string().min(1),
  durationMinutes: z.number().int().min(5).max(480),
  notes: z.string().optional(),
});

export const confirmBookingSchema = z.object({
  holdId: z.string().min(1),
});

export const getMyBookingsSchema = z.object({
  status: z.enum(['CONFIRMED', 'CANCELLED']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().optional(),
});

export const rescheduleBookingSchema = z.object({
  bookingId: z.string().min(1),
  newStartTime: z.string().min(1),
  durationMinutes: z.number().int().min(5).max(480),
});

export const getMyAvailabilitySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const previewScheduleChangeSchema = z.object({
  action: z.enum(['BLOCK', 'OPEN']),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  reason: z.string().optional(),
});

export const applyScheduleChangeSchema = z.object({
  action: z.enum(['BLOCK', 'OPEN']),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  reason: z.string().optional(),
});

export const blockTimeRangeSchema = z.object({
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  reason: z.string().optional(),
});

export const addAvailabilitySchema = z.object({
  type: z.enum(['recurring', 'one_time']),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
});

export const listProvidersSchema = z.object({});

// Inferred types for use in tool-executor
export type FindAvailableSlotsInput = z.infer<typeof findAvailableSlotsSchema>;
export type GetProviderAvailabilityInput = z.infer<
  typeof getProviderAvailabilitySchema
>;
export type HoldSlotInput = z.infer<typeof holdSlotSchema>;
export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;
export type GetMyBookingsInput = z.infer<typeof getMyBookingsSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;
export type GetMyAvailabilityInput = z.infer<typeof getMyAvailabilitySchema>;
export type ScheduleChangeInput = z.infer<typeof previewScheduleChangeSchema>;
export type BlockTimeRangeInput = z.infer<typeof blockTimeRangeSchema>;
export type AddAvailabilityInput = z.infer<typeof addAvailabilitySchema>;

export const toolSchemas: Record<string, z.ZodType> = {
  list_providers: listProvidersSchema,
  find_available_slots: findAvailableSlotsSchema,
  get_provider_availability: getProviderAvailabilitySchema,
  hold_slot: holdSlotSchema,
  confirm_booking: confirmBookingSchema,
  get_my_bookings: getMyBookingsSchema,
  cancel_booking: cancelBookingSchema,
  reschedule_booking: rescheduleBookingSchema,
  get_my_availability: getMyAvailabilitySchema,
  preview_schedule_change: previewScheduleChangeSchema,
  apply_schedule_change: applyScheduleChangeSchema,
  block_time_range: blockTimeRangeSchema,
  add_availability: addAvailabilitySchema,
};
