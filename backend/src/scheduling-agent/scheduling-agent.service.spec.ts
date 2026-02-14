import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SchedulingAgentService } from "./scheduling-agent.service.js";
import { ToolExecutor } from "./tools/tool-executor.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Mock OpenAI
jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

describe("SchedulingAgentService", () => {
  let service: SchedulingAgentService;
  let toolExecutor: { execute: jest.Mock };
  let prisma: { [key: string]: any };
  let mockCreate: jest.Mock;

  beforeEach(async () => {
    toolExecutor = {
      execute: jest.fn(),
    };

    prisma = {
      provider: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingAgentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                "openrouter.apiKey": "test-key",
                "openrouter.baseUrl": "https://openrouter.ai/api/v1",
                "openrouter.model": "test-model",
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        { provide: ToolExecutor, useValue: toolExecutor },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SchedulingAgentService>(SchedulingAgentService);

    // Get access to the mocked OpenAI client
    mockCreate = (service as any).client.chat.completions.create;
  });

  it("should return text response when no tool calls", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: "Hello! How can I help you?", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const result = await service.chat({
      message: "Hi",
      userId: "user-1",
      role: "CUSTOMER",
    });

    expect(result).toBe("Hello! How can I help you?");
  });

  it("should execute tool calls and return final response", async () => {
    // First call: LLM wants to call a tool
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "get_my_bookings",
                  arguments: "{}",
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    // Tool returns data
    toolExecutor.execute.mockResolvedValueOnce({
      success: true,
      data: { bookings: [], pagination: { total: 0 } },
    });

    // Second call: LLM returns text
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "You have no upcoming bookings.",
            tool_calls: null,
          },
          finish_reason: "stop",
        },
      ],
    });

    const result = await service.chat({
      message: "Show my bookings",
      userId: "user-1",
      role: "CUSTOMER",
    });

    expect(result).toBe("You have no upcoming bookings.");
    expect(toolExecutor.execute).toHaveBeenCalledWith(
      "get_my_bookings",
      {},
      expect.objectContaining({ userId: "user-1", role: "CUSTOMER" }),
    );
  });

  it("should resolve provider ID for provider role", async () => {
    prisma.provider.findUnique.mockResolvedValue({ id: "prov-123" });

    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: "Here is your schedule.", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    await service.chat({
      message: "Show my schedule",
      userId: "user-1",
      role: "PROVIDER",
    });

    expect(prisma.provider.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("should stop after MAX_ITERATIONS", async () => {
    // Always return tool calls to trigger the loop
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "get_my_bookings",
                  arguments: "{}",
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    toolExecutor.execute.mockResolvedValue({
      success: true,
      data: {},
    });

    const result = await service.chat({
      message: "infinite loop",
      userId: "user-1",
      role: "CUSTOMER",
    });

    expect(result).toContain("maximum number of steps");
    // Should have been called exactly 10 times (MAX_ITERATIONS)
    expect(mockCreate).toHaveBeenCalledTimes(10);
  });

  it("should handle JSON parse errors in tool arguments", async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "get_my_bookings",
                    arguments: "not valid json",
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Sorry, there was an error.",
              tool_calls: null,
            },
            finish_reason: "stop",
          },
        ],
      });

    const result = await service.chat({
      message: "test",
      userId: "user-1",
      role: "CUSTOMER",
    });

    expect(result).toBe("Sorry, there was an error.");
    // Tool executor should NOT have been called
    expect(toolExecutor.execute).not.toHaveBeenCalled();
  });
});
