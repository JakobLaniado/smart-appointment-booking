import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionFunctionTool,
} from 'openai/resources/chat/completions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { customerTools, providerTools } from './tools/tool-definitions.js';
import { ToolExecutor, type ToolContext } from './tools/tool-executor.js';

const MAX_ITERATIONS = 10;
const MAX_HISTORY_MESSAGES = 20; // Keep last N messages to avoid token overflow

interface AgentRequest {
  message: string;
  userId: string;
  role: 'CUSTOMER' | 'PROVIDER';
  providerId?: string; // for customer: the provider they want to interact with
}

/** Serializable subset of conversation messages stored in Redis. */
interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class SchedulingAgentService {
  private readonly logger = new Logger(SchedulingAgentService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly toolExecutor: ToolExecutor,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.client = new OpenAI({
      apiKey: this.configService.get<string>('openrouter.apiKey', ''),
      baseURL: this.configService.get<string>(
        'openrouter.baseUrl',
        'https://openrouter.ai/api/v1',
      ),
    });
    this.model = this.configService.get<string>(
      'openrouter.model',
      'openrouter/free',
    );
  }

  async chat(request: AgentRequest): Promise<string> {
    const { message, userId, role, providerId } = request;

    // Build context
    const toolContext: ToolContext = {
      userId,
      role,
    };

    // If provider, resolve their provider ID
    if (role === 'PROVIDER') {
      const provider = await this.prisma.provider.findUnique({
        where: { userId },
      });
      if (provider) {
        toolContext.providerId = provider.id;
      }
    }

    // Select tools based on role
    const tools: ChatCompletionFunctionTool[] =
      role === 'PROVIDER' ? providerTools : customerTools;

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(role, providerId);

    // Load conversation history from Redis
    const history = await this.loadHistory(userId);

    // Initialize conversation with history
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    // Agentic loop
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      this.logger.debug({
        msg: 'Agent iteration',
        iteration: i + 1,
        userId,
      });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools,
      });

      const choice = response.choices[0];
      if (!choice) {
        return "I'm sorry, I couldn't generate a response. Please try again.";
      }

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      // If no tool calls, return the text response
      if (
        choice.finish_reason !== 'tool_calls' ||
        !assistantMessage.tool_calls?.length
      ) {
        const responseText =
          assistantMessage.content ?? "I've completed the requested actions.";

        // Save updated conversation history
        await this.saveHistory(userId, history, message, responseText);

        return responseText;
      }

      // Process tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const toolName = toolCall.function.name;
        let parsedArgs: unknown;

        try {
          parsedArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error: 'Failed to parse tool arguments as JSON',
            }),
          });
          continue;
        }

        this.logger.log({
          msg: 'Executing tool call',
          toolName,
          userId,
          iteration: i + 1,
        });

        const result = await this.toolExecutor.execute(
          toolName,
          parsedArgs,
          toolContext,
        );

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    const fallback =
      "I've reached the maximum number of steps for this request. Please try breaking your request into smaller parts.";
    await this.saveHistory(userId, history, message, fallback);
    return fallback;
  }

  async clearHistory(userId: string): Promise<void> {
    await this.redis.deleteConversation(userId);
  }

  private async loadHistory(
    userId: string,
  ): Promise<ChatCompletionMessageParam[]> {
    const raw = await this.redis.getConversation(userId);
    if (!raw) return [];

    try {
      const stored = JSON.parse(raw) as StoredMessage[];
      return stored.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } catch {
      return [];
    }
  }

  private async saveHistory(
    userId: string,
    previousHistory: ChatCompletionMessageParam[],
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    // Reconstruct stored messages from previous history + new exchange
    const stored: StoredMessage[] = previousHistory
      .filter(
        (m): m is ChatCompletionMessageParam & { role: 'user' | 'assistant' } =>
          m.role === 'user' || m.role === 'assistant',
      )
      .map((m) => ({
        role: m.role,
        content: (m.content as string) ?? '',
      }));

    stored.push({ role: 'user', content: userMessage });
    stored.push({ role: 'assistant', content: assistantResponse });

    // Trim to max history length
    const trimmed = stored.slice(-MAX_HISTORY_MESSAGES);

    await this.redis.setConversation(userId, JSON.stringify(trimmed));
  }

  private buildSystemPrompt(
    role: 'CUSTOMER' | 'PROVIDER',
    providerId?: string,
  ): string {
    const now = new Date().toISOString();
    const base = `You are a helpful scheduling assistant for an appointment booking platform.
Current date/time: ${now}

Time interpretation rules:
- "morning" means 9:00 AM - 12:00 PM
- "afternoon" means 12:00 PM - 5:00 PM
- "evening" means 5:00 PM - 8:00 PM
- "next week" means the upcoming Monday through Sunday
- "tomorrow" means the next calendar day
- Always use ISO 8601 format for dates and times in tool calls
- When the user says a day like "Monday", assume the NEXT occurrence

Important rules:
- Always confirm with the user before making bookings or schedule changes
- Present slot options clearly with date, time, and duration
- When holding a slot, inform the user they have 5 minutes to confirm
- Be concise but friendly in responses
- You have conversation history — reference previous messages when relevant`;

    if (role === 'CUSTOMER') {
      return `${base}

You are helping a CUSTOMER book appointments.
${providerId ? `The customer is looking at provider ID: ${providerId}` : 'The customer has not specified a provider yet. You can list available providers using the list_providers tool.'}

Available actions:
- List available providers
- Search for available time slots
- View a provider's schedule
- Hold a time slot (temporary 5-minute reservation)
- Confirm a held slot to create a booking
- View your bookings
- Cancel a booking
- Reschedule an existing booking to a new time

Workflow for booking:
1. Help the customer find available slots
2. Let them choose a slot
3. Hold the slot (creates a 5-minute hold)
4. Confirm the booking (before the hold expires)

Workflow for rescheduling:
1. Find the customer's existing booking (use get_my_bookings)
2. Search for alternative available slots (use find_available_slots)
3. Present the top options to the customer
4. Once they choose, reschedule the booking (use reschedule_booking)`;
    }

    return `${base}

You are helping a PROVIDER manage their schedule.

Available actions:
- View your recurring availability and overrides
- View your upcoming bookings
- Preview schedule changes (always preview before applying!)
- Apply schedule changes (block or open time ranges)
- Block specific time ranges
- Add new availability (recurring or one-time)

Important: For any schedule modifications:
1. ALWAYS use preview_schedule_change first to show what would happen
2. Tell the provider about any affected bookings
3. Only call apply_schedule_change after the provider confirms`;
  }
}
