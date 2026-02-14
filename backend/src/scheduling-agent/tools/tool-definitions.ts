import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions.js";

// ─── Customer Tools ─────────────────────────────────────────────────────────

const findAvailableSlots: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "find_available_slots",
    description:
      "Search for available appointment slots with a specific provider. Returns ranked slots based on preferences.",
    parameters: {
      type: "object",
      properties: {
        providerId: {
          type: "string",
          description: "The provider's ID to search slots for",
        },
        startDate: {
          type: "string",
          description: "Start of date range (YYYY-MM-DD)",
        },
        endDate: {
          type: "string",
          description: "End of date range (YYYY-MM-DD)",
        },
        durationMinutes: {
          type: "number",
          description: "Desired appointment duration in minutes",
        },
        timeOfDay: {
          type: "string",
          enum: ["morning", "afternoon", "evening"],
          description:
            "Preferred time of day (morning=9-12, afternoon=12-5, evening=5-8)",
        },
        preferredDays: {
          type: "array",
          items: { type: "number" },
          description:
            "Preferred days of the week (0=Sun, 1=Mon, ..., 6=Sat)",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of slots to return (default 10)",
        },
      },
      required: ["providerId", "startDate", "endDate", "durationMinutes"],
    },
  },
};

const getProviderAvailability: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "get_provider_availability",
    description:
      "View a provider's profile including their recurring schedule, timezone, and buffer time.",
    parameters: {
      type: "object",
      properties: {
        providerId: {
          type: "string",
          description: "The provider's ID",
        },
      },
      required: ["providerId"],
    },
  },
};

const holdSlot: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "hold_slot",
    description:
      "Create a temporary hold on a time slot (5 minutes). Must be confirmed before it expires.",
    parameters: {
      type: "object",
      properties: {
        providerId: {
          type: "string",
          description: "The provider's ID",
        },
        startTime: {
          type: "string",
          description: "Slot start time in ISO 8601 format",
        },
        durationMinutes: {
          type: "number",
          description: "Appointment duration in minutes",
        },
        notes: {
          type: "string",
          description: "Optional notes for the appointment",
        },
      },
      required: ["providerId", "startTime", "durationMinutes"],
    },
  },
};

const confirmBooking: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "confirm_booking",
    description:
      "Confirm a held slot to create a booking. Must provide the holdId from a previous hold_slot call.",
    parameters: {
      type: "object",
      properties: {
        holdId: {
          type: "string",
          description: "The hold ID returned from hold_slot",
        },
      },
      required: ["holdId"],
    },
  },
};

const getMyBookings: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "get_my_bookings",
    description:
      "List bookings. For customers: shows their appointments. For providers: shows their schedule.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["CONFIRMED", "CANCELLED"],
          description: "Filter by booking status",
        },
        dateFrom: {
          type: "string",
          description: "Filter bookings from this date (ISO 8601)",
        },
        dateTo: {
          type: "string",
          description: "Filter bookings up to this date (ISO 8601)",
        },
        page: { type: "number", description: "Page number (default 1)" },
        limit: {
          type: "number",
          description: "Results per page (default 20)",
        },
      },
      required: [],
    },
  },
};

const cancelBooking: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "cancel_booking",
    description: "Cancel an existing booking.",
    parameters: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          description: "The booking ID to cancel",
        },
        reason: {
          type: "string",
          description: "Reason for cancellation",
        },
      },
      required: ["bookingId"],
    },
  },
};

// ─── Provider Tools ─────────────────────────────────────────────────────────

const getMyAvailability: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "get_my_availability",
    description:
      "View your own schedule: recurring availability rules, overrides, and upcoming bookings.",
    parameters: {
      type: "object",
      properties: {
        dateFrom: {
          type: "string",
          description: "Start date for overrides/bookings (ISO 8601)",
        },
        dateTo: {
          type: "string",
          description: "End date for overrides/bookings (ISO 8601)",
        },
      },
      required: [],
    },
  },
};

const previewScheduleChange: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "preview_schedule_change",
    description:
      "Preview what would happen if you block or open a time range. Shows what overrides would be created and any existing bookings that would be affected. Does NOT apply the change.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["BLOCK", "OPEN"],
          description: "Whether to block or open the time range",
        },
        startTime: {
          type: "string",
          description: "Start time in ISO 8601 format",
        },
        endTime: {
          type: "string",
          description: "End time in ISO 8601 format",
        },
        reason: {
          type: "string",
          description: "Reason for the change",
        },
      },
      required: ["action", "startTime", "endTime"],
    },
  },
};

const applyScheduleChange: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "apply_schedule_change",
    description:
      "Apply a previously previewed schedule change. Creates the override(s). Only call after preview_schedule_change.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["BLOCK", "OPEN"],
          description: "Whether to block or open the time range",
        },
        startTime: {
          type: "string",
          description: "Start time in ISO 8601 format",
        },
        endTime: {
          type: "string",
          description: "End time in ISO 8601 format",
        },
        reason: {
          type: "string",
          description: "Reason for the change",
        },
      },
      required: ["action", "startTime", "endTime"],
    },
  },
};

const blockTimeRange: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "block_time_range",
    description: "Block off a time range so no appointments can be booked.",
    parameters: {
      type: "object",
      properties: {
        startTime: {
          type: "string",
          description: "Start time in ISO 8601 format",
        },
        endTime: {
          type: "string",
          description: "End time in ISO 8601 format",
        },
        reason: {
          type: "string",
          description: "Reason for blocking",
        },
      },
      required: ["startTime", "endTime"],
    },
  },
};

const addAvailability: ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "add_availability",
    description:
      "Add a new availability window. Can be a one-time OPEN override or a recurring weekly rule.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["recurring", "one_time"],
          description:
            "Whether this is a recurring weekly rule or a one-time availability window",
        },
        dayOfWeek: {
          type: "number",
          description:
            "Day of week for recurring rules (0=Sun, 1=Mon, ..., 6=Sat). Required for type=recurring.",
        },
        startTime: {
          type: "string",
          description:
            'Start time. For recurring: "HH:mm" format. For one_time: ISO 8601.',
        },
        endTime: {
          type: "string",
          description:
            'End time. For recurring: "HH:mm" format. For one_time: ISO 8601.',
        },
      },
      required: ["type", "startTime", "endTime"],
    },
  },
};

// ─── Exports ────────────────────────────────────────────────────────────────

export const customerTools: ChatCompletionFunctionTool[] = [
  findAvailableSlots,
  getProviderAvailability,
  holdSlot,
  confirmBooking,
  getMyBookings,
  cancelBooking,
];

export const providerTools: ChatCompletionFunctionTool[] = [
  getMyAvailability,
  getMyBookings,
  previewScheduleChange,
  applyScheduleChange,
  blockTimeRange,
  addAvailability,
];

export const customerToolNames = new Set(
  customerTools.map((t) => t.function.name),
);
export const providerToolNames = new Set(
  providerTools.map((t) => t.function.name),
);
