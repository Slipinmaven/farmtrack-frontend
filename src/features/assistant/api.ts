import { apiClient } from "@/lib/api/client";

export type AssistantConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  from_date: string | null;
  to_date: string | null;
  created_at: string;
};

export type AssistantConversation = AssistantConversationSummary & {
  messages: AssistantMessage[];
};

export type AssistantAnswer = {
  conversation_id: string;
  answer: string;
  needs_clarification: boolean;
  data_scopes: string[];
  suggested_replies: AssistantSuggestedReply[];
  from_date: string | null;
  to_date: string | null;
};

export type AssistantSuggestedReply = {
  label: string;
  question: string;
};

export async function listAssistantConversations(
  farmId: string,
): Promise<AssistantConversationSummary[]> {
  const { data } = await apiClient.get<{ items: AssistantConversationSummary[] }>(
    `/farms/${farmId}/assistant/conversations`,
    { params: { limit: 50, offset: 0 } },
  );
  return data.items;
}

export async function getAssistantConversation(
  farmId: string,
  conversationId: string,
): Promise<AssistantConversation> {
  const { data } = await apiClient.get<AssistantConversation>(
    `/farms/${farmId}/assistant/conversations/${conversationId}`,
  );
  return data;
}

export async function renameAssistantConversation(
  farmId: string,
  conversationId: string,
  title: string,
): Promise<AssistantConversationSummary> {
  const { data } = await apiClient.patch<AssistantConversationSummary>(
    `/farms/${farmId}/assistant/conversations/${conversationId}`,
    { title },
  );
  return data;
}

export async function askFarmAssistant(
  farmId: string,
  payload: {
    question: string;
    conversation_id?: string;
    source_route?: string;
  },
): Promise<AssistantAnswer> {
  const { data } = await apiClient.post<AssistantAnswer>(
    `/farms/${farmId}/assistant/chat`,
    payload,
  );
  return data;
}

export async function deleteAssistantConversation(
  farmId: string,
  conversationId: string,
): Promise<void> {
  await apiClient.delete(
    `/farms/${farmId}/assistant/conversations/${conversationId}`,
  );
}
