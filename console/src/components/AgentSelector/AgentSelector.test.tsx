import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/common_setup";
import { useAgentStore } from "@/stores/agentStore";
import AgentSelector from "./index";

const { mockSetSelectedAgent, mockSetAgents, mockListAgents, mockNavigate } =
  vi.hoisted(() => ({
    mockSetSelectedAgent: vi.fn(),
    mockSetAgents: vi.fn(),
    mockListAgents: vi.fn(),
    mockNavigate: vi.fn(),
  }));

vi.mock("@/api/modules/agents", () => ({
  agentsApi: { listAgents: mockListAgents },
}));

vi.mock("@/stores/agentStore", () => ({
  useAgentStore: vi.fn(() => ({
    selectedAgent: "default",
    agents: [],
    setSelectedAgent: mockSetSelectedAgent,
    setAgents: mockSetAgents,
  })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockAgentsData = {
  agents: [
    { id: "agent-1", name: "Agent One", enabled: true, description: "desc" },
    { id: "agent-2", name: "Agent Two", enabled: false, description: "" },
  ],
};

const STORAGE_KEY = "qwenpaw.agentTeamPresentation.v1";

describe("AgentSelector", () => {
  beforeEach(() => {
    mockListAgents.mockResolvedValue(mockAgentsData);
    localStorage.removeItem(STORAGE_KEY);
    vi.mocked(useAgentStore).mockReturnValue({
      selectedAgent: "default",
      agents: [],
      setSelectedAgent: mockSetSelectedAgent,
      setAgents: mockSetAgents,
    } as ReturnType<typeof useAgentStore>);
  });

  afterEach(() => vi.clearAllMocks());

  it("calls listAgents on mount", async () => {
    renderWithProviders(<AgentSelector />);
    await waitFor(() => expect(mockListAgents).toHaveBeenCalled());
  });

  it("after loading, setAgents receives the list with enabled agents first", async () => {
    renderWithProviders(<AgentSelector />);
    await waitFor(() => expect(mockSetAgents).toHaveBeenCalled());
    const sortedAgents = mockSetAgents.mock.calls[0][0];
    expect(sortedAgents[0].enabled).toBe(true);
    expect(sortedAgents[1].enabled).toBe(false);
  });

  it("renders Select in non-collapsed mode", async () => {
    renderWithProviders(<AgentSelector />);
    await waitFor(() => expect(mockListAgents).toHaveBeenCalled());
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("does not crash when listAgents fails", async () => {
    mockListAgents.mockRejectedValue(new Error("network error"));
    expect(() => renderWithProviders(<AgentSelector />)).not.toThrow();
    await waitFor(() => expect(mockListAgents).toHaveBeenCalled());
  });

  it("chatToolbar only lists summoned agents from my AI team", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "agent-1": { summoned: true, origin: "myTeam" },
        "agent-2": { summoned: false, origin: "team" },
      }),
    );
    vi.mocked(useAgentStore).mockReturnValue({
      selectedAgent: "agent-1",
      agents: mockAgentsData.agents,
      setSelectedAgent: mockSetSelectedAgent,
      setAgents: mockSetAgents,
    } as ReturnType<typeof useAgentStore>);

    renderWithProviders(<AgentSelector variant="chatToolbar" />);
    await waitFor(() => expect(mockListAgents).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Agent One"));
    await waitFor(() => {
      expect(screen.getByText("Agent One")).toBeInTheDocument();
      expect(screen.queryByText("Agent Two")).not.toBeInTheDocument();
    });
  });
});
