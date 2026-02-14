import axios, { type AxiosInstance, type AxiosError } from "axios";
import { randomUUID } from "crypto";

export interface AuthTokens {
  accessToken: string;
}

export class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseUrl: string = "http://localhost:3000") {
    this.client = axios.create({ baseURL: baseUrl });
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setToken(token: string) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  // ─── Auth ──────────────────────────────────────────────
  async register(data: {
    email: string;
    password: string;
    name: string;
    role: string;
    profession?: string;
    timezone?: string;
  }) {
    const res = await this.request("post", "/auth/register", data);
    return res;
  }

  async login(email: string, password: string) {
    const res = await this.request("post", "/auth/login", {
      email,
      password,
    });
    if (res.accessToken && typeof res.accessToken === "string") {
      this.setToken(res.accessToken);
    }
    return res;
  }

  async me() {
    return this.request("get", "/auth/me");
  }

  // ─── Providers ─────────────────────────────────────────
  async listProviders() {
    return this.request("get", "/providers");
  }

  async getProvider(id: string) {
    return this.request("get", `/providers/${id}`);
  }

  // ─── Availability ──────────────────────────────────────
  async querySlots(
    providerId: string,
    params: {
      startDate: string;
      endDate: string;
      durationMinutes: number;
      timeOfDay?: string;
      maxResults?: number;
    },
  ) {
    const query = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      durationMinutes: String(params.durationMinutes),
      ...(params.timeOfDay ? { timeOfDay: params.timeOfDay } : {}),
      ...(params.maxResults
        ? { maxResults: String(params.maxResults) }
        : {}),
    });
    return this.request(
      "get",
      `/availability/slots/${providerId}?${query}`,
    );
  }

  // ─── Booking ───────────────────────────────────────────
  async holdSlot(data: {
    providerId: string;
    startTime: string;
    durationMinutes: number;
    notes?: string;
  }) {
    return this.request("post", "/bookings/hold", data);
  }

  async confirmBooking(holdId: string) {
    return this.request("post", "/bookings/confirm", { holdId }, true);
  }

  async listBookings(params?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params?.dateTo) query.set("dateTo", params.dateTo);
    const qs = query.toString();
    return this.request("get", `/bookings${qs ? `?${qs}` : ""}`);
  }

  async cancelBooking(bookingId: string, reason?: string) {
    return this.request(
      "patch",
      `/bookings/${bookingId}/cancel`,
      { reason },
      true,
    );
  }

  // ─── Agent ─────────────────────────────────────────────
  async chat(message: string, providerId?: string) {
    return this.request("post", "/agent/chat", {
      message,
      ...(providerId ? { providerId } : {}),
    });
  }

  // ─── Provider Schedule ─────────────────────────────────
  async addRecurring(data: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }) {
    return this.request("post", "/availability/recurring", data);
  }

  async listRecurring() {
    return this.request("get", "/availability/recurring");
  }

  async addOverride(data: {
    startTime: string;
    endTime: string;
    type: string;
    reason?: string;
  }) {
    return this.request("post", "/availability/overrides", data);
  }

  async listOverrides(dateFrom?: string, dateTo?: string) {
    const query = new URLSearchParams();
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);
    const qs = query.toString();
    return this.request(
      "get",
      `/availability/overrides${qs ? `?${qs}` : ""}`,
    );
  }

  // ─── Internals ─────────────────────────────────────────
  private async request(
    method: "get" | "post" | "patch" | "delete",
    url: string,
    data?: unknown,
    idempotent?: boolean,
  ): Promise<Record<string, unknown>> {
    try {
      const headers: Record<string, string> = {};
      if (idempotent) {
        headers["Idempotency-Key"] = randomUUID();
      }
      const res = await this.client.request({ method, url, data, headers });
      const body = res.data as Record<string, unknown>;
      // Unwrap success envelope
      if (body.success && body.data !== undefined) {
        return body.data as Record<string, unknown>;
      }
      return body;
    } catch (err) {
      const axiosErr = err as AxiosError<{
        error?: { message?: string; code?: string };
        message?: string;
      }>;
      if (axiosErr.response?.data) {
        const errData = axiosErr.response.data;
        const msg =
          errData.error?.message ?? errData.message ?? "Request failed";
        throw new Error(`[${axiosErr.response.status}] ${msg}`);
      }
      throw err;
    }
  }
}
