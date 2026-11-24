import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Animated as RNAnimated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  type ScrollViewInstance,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Card } from "@/components/ui/card";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import {
  askFarmAssistant,
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversations,
  renameAssistantConversation,
  type AssistantConversationSummary,
  type AssistantMessage,
  type AssistantSuggestedReply,
} from "@/features/assistant/api";
import { assistantHref } from "@/features/assistant/assistant-links";
import { parseAssistantMarkdownTable } from "@/features/assistant/assistant-markdown";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";
import { SessionGate } from "@/components/layout/session-gate";

const suggestedQuestions = [
  {
    label: "Sales this hour",
    question: "Who did I sell to in the previous hour?",
  },
  {
    label: "Supplier balances",
    question: "What do I owe my suppliers?",
  },
  {
    label: "Feed in stock",
    question: "How much feed do I have in stock?",
  },
  {
    label: "Flock this month",
    question: "How is my flock doing this month?",
  },
];
const assistantName = "FarmMate";
const welcomeVariants = [
  "How can I help you today?",
  "What would you like to know about the farm?",
  "How are things looking on the farm today?",
  "Need a hand figuring something out?",
  "Let's make sense of your farm data.",
  "What's on your mind today?",
  "Want to take a closer look at your flock?",
  "Something not adding up? Let's investigate.",
  "Curious about your latest farm numbers?",
  "What would you like to explore?",
  "Need insights into your farm operations?",
  "Let's turn your farm data into useful insights.",
  "Have a question? Let's work through it.",
  "Want to review how your farm is doing?",
  "What would you like to understand better?",
  "Let's see what's happening around your farm.",
  "Need a second opinion on something?",
  "Ready to dig a little deeper?",
  "What can I help you make sense of today?",
  "A question, an idea, or something to investigate?",
];
let nextWelcomeVariant = 0;

function chooseWelcomeVariant(): number {
  const variant = nextWelcomeVariant;
  nextWelcomeVariant = (nextWelcomeVariant + 1) % welcomeVariants.length;
  return variant;
}

function greetingForTimezone(timezone: string): string {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: timezone,
      }).format(new Date()),
    );
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  } catch {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }
}

function welcomeMessage(timezone: string, variant: number): string {
  const hourGreeting = greetingForTimezone(timezone);
  const question = welcomeVariants[variant] ?? welcomeVariants[0];
  return `${hourGreeting}! ${question}`;
}

function progressMessages(question: string): [string, string] {
  const normalized = question.toLowerCase();
  const farmDataQuestion =
    /\b(sales?|sold|sell|customers?|suppliers?|owe|balance|stock|inventory|blocks?|chickens?|eggs?|feed|deliveries|delivery|loss|profit|report|purchase|arrival)\b/.test(
      normalized,
    );
  const navigationQuestion =
    /\b(where|navigate|find|change|open|go to|how do i|how can i)\b/.test(
      normalized,
    );

  if (farmDataQuestion) {
    return [
      "Checking the relevant farm records…",
      "Putting the details together…",
    ];
  }
  if (navigationQuestion) {
    return [
      "Finding the right place in the app…",
      "Putting the steps together…",
    ];
  }
  return ["Thinking through your question…", "Putting a reply together…"];
}

type Message = AssistantMessage & {
  suggestedReplies?: AssistantSuggestedReply[];
};

function formatMessageDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function getConversationDateGroup(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Older";
  const now = new Date();
  const date = Date.UTC(
    timestamp.getFullYear(),
    timestamp.getMonth(),
    timestamp.getDate(),
  );
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.floor((today - date) / 86_400_000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo <= 7) return "Previous 7 days";
  return "Older";
}

const conversationGroupOrder = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Older",
];

function renderInlineMarkdown(value: string): ReactNode[] {
  return value
    .split(/(\[[^\]]+\]\(\/[^)\s]*\)|\*\*[^*]+\*\*)/g)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <AppText key={index} weight="semibold">
            {part.slice(2, -2)}
          </AppText>
        );
      }

      const link = part.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
      if (link) {
        const href = assistantHref(link[2]);
        if (href) {
          return (
            <AppText
              key={index}
              accessibilityRole="link"
              onPress={() => router.push(href)}
              tone="muted"
              style={styles.markdownLink}
            >
              {link[1]}
            </AppText>
          );
        }
        return link[1];
      }

      return part;
    });
}

function AssistantMessageBody({ content }: { content: string }) {
  const { theme } = useTheme();
  const lines = content.split(/\r?\n/);
  const renderedLines: ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const table = parseAssistantMarkdownTable(lines, index);
    if (table) {
      renderedLines.push(
        <View
          key={`table-${index}`}
          style={[
            styles.markdownTable,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
          ]}
        >
          {table.rows.map((row, rowIndex) => (
            <View
              key={`row-${rowIndex}`}
              style={[
                styles.markdownTableRecord,
                rowIndex > 0 && {
                  borderTopColor: theme.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <AppText
                weight="semibold"
                style={[styles.markdownTableTitle, { color: theme.primary }]}
              >
                {renderInlineMarkdown(row[0] || "Record")}
              </AppText>
              {table.headers.slice(1).map((header, cellIndex) => (
                <View key={`${header}-${cellIndex}`} style={styles.markdownTableField}>
                  <AppText
                    size="small"
                    tone="secondary"
                    style={styles.markdownTableLabel}
                  >
                    {header}
                  </AppText>
                  <AppText style={styles.markdownTableValue}>
                    {renderInlineMarkdown(row[cellIndex + 1] ?? "")}
                  </AppText>
                </View>
              ))}
            </View>
          ))}
        </View>,
      );
      index = table.nextIndex - 1;
      continue;
    }

    const line = lines[index];
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (!line.trim()) {
      renderedLines.push(<View key={index} style={styles.paragraphGap} />);
    } else if (bullet || numbered) {
      renderedLines.push(
        <View key={index} style={styles.markdownListItem}>
          <AppText style={styles.markdownBullet}>
            {numbered ? `${line.match(/^\s*(\d+)/)?.[1]}.` : "•"}
          </AppText>
          <AppText style={styles.markdownListText}>
            {renderInlineMarkdown((bullet ?? numbered)?.[1] ?? line)}
          </AppText>
        </View>,
      );
    } else {
      renderedLines.push(
        <AppText
          key={index}
          weight={heading ? "semibold" : "regular"}
          style={heading ? styles.markdownHeading : undefined}
        >
          {renderInlineMarkdown(heading?.[1] ?? line)}
        </AppText>,
      );
    }
  }

  return (
    <View style={styles.markdownBody}>{renderedLines}</View>
  );
}

function TypingDots() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((value) => (value + 1) % 3), 280);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.typingDots} accessibilityLabel="FarmMate is typing">
      {[0, 1, 2].map((dot) => (
        <View
          key={dot}
          style={[
            styles.typingDot,
            {
              opacity: phase === dot ? 1 : 0.3,
              transform: [{ translateY: phase === dot ? -2 : 0 }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function SendingGlyph({ color }: { color: string }) {
  const [pulse] = useState(() => new RNAnimated.Value(0.94));

  useEffect(() => {
    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, {
          toValue: 1.08,
          duration: 620,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulse, {
          toValue: 0.94,
          duration: 620,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <RNAnimated.View style={{ transform: [{ scale: pulse }] }}>
      <Ionicons name="sparkles" size={21} color={color} />
    </RNAnimated.View>
  );
}

function FarmMateWelcome({
  variant,
  timezone,
}: {
  variant: number;
  timezone: string;
}) {
  const { theme } = useTheme();
  const content = welcomeMessage(timezone, variant);
  const [visibleCharacters, setVisibleCharacters] = useState(0);
  const [cursorOpacity] = useState(() => new RNAnimated.Value(1));

  useEffect(() => {
    const cursor = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(cursorOpacity, {
          toValue: 0,
          duration: 530,
          useNativeDriver: true,
        }),
        RNAnimated.timing(cursorOpacity, {
          toValue: 1,
          duration: 530,
          useNativeDriver: true,
        }),
      ]),
    );
    cursor.start();
    return () => cursor.stop();
  }, [cursorOpacity]);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleCharacters((visible) => {
        if (visible >= content.length) {
          clearInterval(timer);
          return visible;
        }
        return visible + 1;
      });
    }, 28);
    return () => clearInterval(timer);
  }, [content]);

  const greetingComplete = visibleCharacters >= content.length;

  return (
    <View style={[styles.messageRow, styles.assistantMessageRow]}>
      <View
        style={[
          styles.messageAvatar,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Ionicons name="sparkles" size={15} color={theme.primary} />
      </View>
      <View style={styles.messageContent}>
        <AppText
          size="small"
          weight="semibold"
          style={[styles.messageSender, { color: theme.primary }]}
        >
          {assistantName}
        </AppText>
        <View
          style={[
            styles.messageBubble,
            styles.assistantBubble,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <AppText>
            {content.slice(0, visibleCharacters)}
            {!greetingComplete ? (
              <RNAnimated.Text
                style={{ color: theme.primary, opacity: cursorOpacity }}
              >
                |
              </RNAnimated.Text>
            ) : null}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function AnimatedAssistantBody({
  content,
  messageId,
  onComplete,
}: {
  content: string;
  messageId: string;
  onComplete: (messageId: string) => void;
}) {
  const words = content.match(/\S+\s*/g) ?? [];
  const [visibleWords, setVisibleWords] = useState(0);
  useEffect(() => {
    if (!words.length) {
      onComplete(messageId);
      return;
    }
    const step = Math.max(1, Math.ceil(words.length / 60));
    let visible = 0;
    const timer = setInterval(() => {
      visible = Math.min(visible + step, words.length);
      setVisibleWords(visible);
      if (visible === words.length) {
        clearInterval(timer);
        onComplete(messageId);
      }
    }, 40);
    return () => clearInterval(timer);
  }, [content, messageId, onComplete, words.length]);

  let partialContent = words
    .slice(0, visibleWords)
    .join("");
  const markdownMarkers = partialContent.match(/\*\*/g) ?? [];
  if (markdownMarkers.length % 2 !== 0) {
    partialContent = partialContent.replace(/\*\*(?![\s\S]*\*\*)/, "");
  }
  return <AssistantMessageBody content={partialContent} />;
}

export default function AssistantScreen() {
  const { selectedFarm } = useFarm();
  return (
    <SessionGate>
      <AssistantAccessGate key={selectedFarm?.id ?? "no-farm"} />
    </SessionGate>
  );
}

function AssistantAccessGate() {
  const { user } = useAuth();
  if (user?.role !== "SUPER_ADMIN") return <FarmMatePreviewScreen />;
  return <AssistantScreenContent />;
}

function FarmMatePreviewScreen() {
  const { theme } = useTheme();
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <View style={styles.previewPage}>
        <FarmPageHeader
          title={assistantName}
          showBack
          showNotifications={false}
          backHref="/(tabs)"
        />
        <View style={styles.previewContent}>
          <View
            style={[
              styles.previewIcon,
              { backgroundColor: `${theme.primary}14` },
            ]}
          >
            <Ionicons name="sparkles" size={28} color={theme.primary} />
          </View>
          <AppText size="heading" weight="semibold">
            FarmMate is in testing
          </AppText>
          <AppText tone="secondary" style={styles.previewDescription}>
            Tool-powered AI features are an upcoming feature for your account.
            We’re testing FarmMate before making these features broadly
            available.
          </AppText>
          <Card style={styles.previewWarning}>
            <View style={styles.previewWarningHeading}>
              <Ionicons
                name="shield-checkmark-outline"
                size={19}
                color={theme.danger}
              />
              <AppText weight="semibold">Please protect your information</AppText>
            </View>
            <AppText size="small" tone="secondary">
              AI is experimental and may make mistakes. Do not send passwords,
              personal details, customer or supplier information, financial
              records, or any other sensitive data to AI features.
            </AppText>
          </Card>
        </View>
      </View>
    </SafeAreaView>
  );
}

function AssistantScreenContent() {
  const routeParams = useLocalSearchParams<{
    source_route?: string | string[];
  }>();
  const sourceRoute = Array.isArray(routeParams.source_route)
    ? routeParams.source_route[0]
    : routeParams.source_route;
  const { theme } = useTheme();
  const { user } = useAuth();
  const { selectedFarm } = useFarm();
  const queryClient = useQueryClient();
  const dialog = useAppDialog();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef<ScrollViewInstance>(null);
  const [drawerTranslateX] = useState(
    () => new RNAnimated.Value(-360),
  );
  const localMessageCounter = useRef(0);
  const longPressHandled = useRef(false);
  const [welcomeVariant] = useState(chooseWelcomeVariant);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [questionInputHeight, setQuestionInputHeight] = useState(44);
  const [sending, setSending] = useState(false);
  const [responseStatus, setResponseStatus] = useState("");
  const responseStatusTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [loadingConversationId, setLoadingConversationId] = useState<
    string | null
  >(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [selectedConversationIds, setSelectedConversationIds] = useState<
    Set<string>
  >(() => new Set());
  const [renameTarget, setRenameTarget] =
    useState<AssistantConversationSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const farmId = selectedFarm?.id ?? "";
  const userId = user?.id ?? "";
  const conversationsQueryKey = [
    "assistant-conversations",
    userId,
    farmId,
  ] as const;
  const conversations = useQuery({
    queryKey: conversationsQueryKey,
    queryFn: () => listAssistantConversations(farmId),
    enabled: Boolean(userId && farmId),
  });
  const composerDisabled =
    sending ||
    typingMessageId !== null ||
    loadingConversationId !== null;
  const conversationActionsDisabled =
    sending || typingMessageId !== null || loadingConversationId !== null;
  const filteredConversations = useMemo(() => {
    const search = conversationSearch.trim().toLocaleLowerCase();
    return (conversations.data ?? []).filter((item) =>
      item.title.toLocaleLowerCase().includes(search),
    );
  }, [conversationSearch, conversations.data]);
  const conversationGroups = useMemo(() => {
    const itemsByGroup = new Map<string, AssistantConversationSummary[]>();
    for (const item of filteredConversations) {
      const group = getConversationDateGroup(item.updated_at);
      const items = itemsByGroup.get(group) ?? [];
      items.push(item);
      itemsByGroup.set(group, items);
    }
    return conversationGroupOrder.flatMap((label) => {
      const items = itemsByGroup.get(label);
      return items ? [{ label, items }] : [];
    });
  }, [filteredConversations]);
  const selectedCount = selectedConversationIds.size;
  const allVisibleSelected =
    filteredConversations.length > 0 &&
    filteredConversations.every((item) =>
      selectedConversationIds.has(item.id),
    );

  useEffect(
    () => () => {
      responseStatusTimers.current.forEach(clearTimeout);
    },
    [],
  );

  useEffect(() => {
    if (messages.length) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  useEffect(() => {
    if (!historyOpen) return;
    drawerTranslateX.setValue(-Math.min(windowWidth * 0.88, 360));
    RNAnimated.spring(drawerTranslateX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
    }).start();
  }, [drawerTranslateX, historyOpen, windowWidth]);

  const finishTyping = useCallback((messageId: string) => {
    setTypingMessageId((current) => (current === messageId ? null : current));
  }, []);

  function closeHistory() {
    setSelectedConversationIds(new Set());
    RNAnimated.timing(drawerTranslateX, {
      toValue: -Math.min(windowWidth * 0.88, 360),
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setHistoryOpen(false);
    });
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setShowWelcome(true);
    setTypingMessageId(null);
    setQuestion("");
    setError(null);
    setSelectedConversationIds(new Set());
    closeHistory();
  }

  function toggleConversationSelection(id: string) {
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredConversations.forEach((item) => next.delete(item.id));
      } else {
        filteredConversations.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }

  async function openConversation(item: AssistantConversationSummary) {
    if (selectedConversationIds.size) {
      toggleConversationSelection(item.id);
      return;
    }
    setLoadingConversationId(item.id);
    setError(null);
    try {
      const conversation = await getAssistantConversation(farmId, item.id);
      setConversationId(conversation.id);
      setMessages(conversation.messages);
      setShowWelcome(conversation.messages.length === 0);
      setTypingMessageId(null);
      setQuestion("");
      closeHistory();
    } catch (requestError: unknown) {
      setError(normalizeApiError(requestError).message);
    } finally {
      setLoadingConversationId(null);
    }
  }

  function beginRenameConversation() {
    if (selectedConversationIds.size !== 1) return;
    const selectedId = [...selectedConversationIds][0];
    const item = conversations.data?.find(
      (conversation) => conversation.id === selectedId,
    );
    if (!item) return;
    setRenameTarget(item);
    setRenameTitle(item.title);
  }

  async function saveConversationRename() {
    const title = renameTitle.trim();
    if (!renameTarget || !title || savingRename) return;
    setSavingRename(true);
    setError(null);
    try {
      const updated = await renameAssistantConversation(
        farmId,
        renameTarget.id,
        title,
      );
      queryClient.setQueryData(
        conversationsQueryKey,
        (current: AssistantConversationSummary[] | undefined) =>
          current?.map((item) => (item.id === updated.id ? updated : item)),
      );
      setRenameTarget(null);
      setSelectedConversationIds(new Set());
    } catch (requestError: unknown) {
      setError(normalizeApiError(requestError).message);
    } finally {
      setSavingRename(false);
    }
  }

  async function removeSelectedConversations() {
    const selectedIds = [...selectedConversationIds];
    if (!selectedIds.length) return;
    const confirmed = await dialog.confirmDialog({
      title:
        selectedIds.length === 1
          ? "Delete this chat?"
          : `Delete ${selectedIds.length} chats?`,
      message: `This permanently removes ${
        selectedIds.length === 1 ? "this conversation" : "these conversations"
      } and their messages.`,
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      destructive: true,
    });
    if (!confirmed) return;

    const results = await Promise.allSettled(
      selectedIds.map((id) => deleteAssistantConversation(farmId, id)),
    );
    const deletedIds = selectedIds.filter(
      (_, index) => results[index].status === "fulfilled",
    );
    const failedIds = selectedIds.filter(
      (_, index) => results[index].status === "rejected",
    );
    await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    setSelectedConversationIds(new Set(failedIds));
    if (conversationId && deletedIds.includes(conversationId)) {
      setConversationId(null);
      setMessages([]);
      setShowWelcome(true);
      setTypingMessageId(null);
      setQuestion("");
    }
    if (failedIds.length) {
      setError(
        `${deletedIds.length} chat${deletedIds.length === 1 ? "" : "s"} deleted. ${failedIds.length} could not be deleted; try again.`,
      );
    }
  }

  async function sendQuestion(text = question) {
    const trimmed = text.trim();
    if (!trimmed || sending || typingMessageId !== null) return;
    localMessageCounter.current += 1;
    const messageId = `local-user-${localMessageCounter.current}`;
    const createdAt = new Date().toISOString();
    setMessages((current) => [
      ...current,
      {
        id: messageId,
        role: "user",
        content: trimmed,
        from_date: null,
        to_date: null,
        created_at: createdAt,
      },
    ]);
    setShowWelcome(false);
    setQuestion("");
    setError(null);
    setSending(true);
    const [laterStatus, slowStatus] = progressMessages(trimmed);
    setResponseStatus("Thinking through your question…");
    responseStatusTimers.current.forEach(clearTimeout);
    responseStatusTimers.current = [
      setTimeout(() => setResponseStatus(laterStatus), 1500),
      setTimeout(() => setResponseStatus(slowStatus), 4800),
    ];
    try {
      const response = await askFarmAssistant(farmId, {
        question: trimmed,
        ...(conversationId ? { conversation_id: conversationId } : {}),
        ...(sourceRoute ? { source_route: sourceRoute } : {}),
      });
      const assistantCreatedAt = new Date().toISOString();
      const assistantMessageId = `local-assistant-${localMessageCounter.current}`;
      setConversationId(response.conversation_id);
      setMessages((current) => [
        ...current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                from_date: response.from_date,
                to_date: response.to_date,
              }
            : message,
        ),
        {
          id: assistantMessageId,
          role: "assistant",
          content: response.answer,
          from_date: response.from_date,
          to_date: response.to_date,
          created_at: assistantCreatedAt,
          suggestedReplies: response.suggested_replies,
        },
      ]);
      setTypingMessageId(assistantMessageId);
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    } catch (requestError: unknown) {
      setMessages((current) =>
        current.filter((message) => message.id !== messageId),
      );
      setQuestion(trimmed);
      setError(normalizeApiError(requestError).message);
    } finally {
      responseStatusTimers.current.forEach(clearTimeout);
      responseStatusTimers.current = [];
      setResponseStatus("");
      setSending(false);
    }
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : Platform.OS === "android"
              ? "height"
              : undefined
        }
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.page,
            { paddingBottom: Math.max(insets.bottom, 8) },
          ]}
        >
          <FarmPageHeader
            title={assistantName}
            showBack
            showNotifications={false}
            backHref="/(tabs)"
            rightAction={
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open conversation history"
                  disabled={conversationActionsDisabled}
                  onPress={() => setHistoryOpen(true)}
                  style={[
                    styles.headerIconButton,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="menu-outline"
                    size={21}
                    color={theme.text}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Start a new conversation"
                  disabled={conversationActionsDisabled}
                  onPress={startNewConversation}
                  style={[
                    styles.headerIconButton,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons name="create-outline" size={20} color={theme.text} />
                </Pressable>
              </View>
            }
          />

          <View style={styles.chatPanel}>
            <ScrollView
              ref={listRef}
              contentContainerStyle={styles.messageList}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() =>
                listRef.current?.scrollToEnd({ animated: true })
              }
            >
              {showWelcome ? (
                <>
                  <FarmMateWelcome
                    variant={welcomeVariant}
                    timezone={theme.timezone}
                  />
                  <ScrollView
                    horizontal
                    style={styles.suggestionStrip}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.suggestions}
                    keyboardShouldPersistTaps="handled"
                  >
                    {suggestedQuestions.map((suggestion) => (
                      <Pressable
                        key={suggestion.label}
                        disabled={sending}
                        onPress={() => void sendQuestion(suggestion.question)}
                        style={[
                          styles.suggestion,
                          {
                            backgroundColor: theme.background,
                            borderColor: theme.border,
                          },
                        ]}
                      >
                        <AppText
                          numberOfLines={1}
                          size="small"
                          weight="semibold"
                          style={{ color: theme.primary }}
                        >
                          {suggestion.label}
                        </AppText>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageRow,
                      isUser
                        ? styles.userMessageRow
                        : styles.assistantMessageRow,
                    ]}
                  >
                    {!isUser ? (
                      <View
                        style={[
                          styles.messageAvatar,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Ionicons
                          name="sparkles"
                          size={15}
                          color={theme.primary}
                        />
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.messageContent,
                        isUser && styles.userMessageContent,
                      ]}
                    >
                      {!isUser ? (
                        <AppText
                          size="small"
                          weight="semibold"
                          style={[
                            styles.messageSender,
                            { color: theme.primary },
                          ]}
                        >
                          {assistantName}
                        </AppText>
                      ) : null}
                      <View
                        style={[
                          styles.messageBubble,
                          isUser
                            ? styles.userBubble
                            : styles.assistantBubble,
                          isUser
                            ? {
                                backgroundColor: theme.primary,
                                borderColor: theme.primary,
                              }
                            : {
                                backgroundColor: theme.backgroundElement,
                                borderColor: theme.border,
                              },
                        ]}
                      >
                        {isUser ? (
                          <AppText
                            style={{
                              color: theme.onPrimary,
                              flexShrink: 1,
                            }}
                          >
                            {message.content}
                          </AppText>
                        ) : typingMessageId === message.id ? (
                          <AnimatedAssistantBody
                            content={message.content}
                            messageId={message.id}
                            onComplete={finishTyping}
                          />
                        ) : (
                          <AssistantMessageBody content={message.content} />
                        )}
                        <AppText
                          size="small"
                          style={[
                            styles.messageTime,
                            {
                              color: isUser
                                ? `${theme.onPrimary}B8`
                                : theme.textSecondary,
                            },
                          ]}
                        >
                          {formatMessageDate(message.created_at)}
                        </AppText>
                      </View>
                        {!isUser &&
                        message.id === messages[messages.length - 1]?.id &&
                        message.suggestedReplies?.length ? (
                          <View style={styles.suggestedReplies}>
                            {message.suggestedReplies.map((reply) => (
                              <Pressable
                                key={reply.question}
                                accessibilityRole="button"
                                accessibilityLabel={reply.label}
                                accessibilityState={{
                                  disabled:
                                    sending || typingMessageId !== null,
                                }}
                                disabled={sending || typingMessageId !== null}
                                onPress={() => void sendQuestion(reply.question)}
                                style={({ pressed }) => [
                                  styles.suggestedReply,
                                  {
                                    borderColor: theme.border,
                                    backgroundColor: pressed
                                      ? theme.backgroundSelected
                                      : theme.backgroundElement,
                                    opacity:
                                      sending || typingMessageId !== null
                                        ? 0.55
                                        : 1,
                                  },
                                ]}
                              >
                                <AppText
                                  size="small"
                                  weight="semibold"
                                  style={{ color: theme.primary }}
                                >
                                  {reply.label}
                                </AppText>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                    </View>
                  </View>
                );
              })}
              {sending ? (
                <View style={[styles.messageRow, styles.assistantMessageRow]}>
                  <View
                    style={[
                      styles.messageAvatar,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="sparkles"
                      size={15}
                      color={theme.primary}
                    />
                  </View>
                  <View
                    style={[
                      styles.thinking,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <TypingDots />
                    <AppText size="small" tone="secondary">
                      {responseStatus || "Thinking through your question…"}
                    </AppText>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>

          {error ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.errorBanner,
                { backgroundColor: `${theme.danger}12` },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={19}
                color={theme.danger}
              />
              <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                {error}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
                onPress={() => setError(null)}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={theme.danger} />
              </Pressable>
            </View>
          ) : null}

          <View
            style={[
              styles.composer,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <TextInput
              accessibilityLabel="Ask FarmMate a question"
              value={question}
              onChangeText={setQuestion}
              onContentSizeChange={(event) => {
                setQuestionInputHeight(
                  Math.min(106, Math.max(44, event.nativeEvent.contentSize.height)),
                );
              }}
              placeholder="Ask about your farm or anything else…"
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={2000}
              scrollEnabled={questionInputHeight >= 106}
              editable={!composerDisabled}
              returnKeyType="default"
              style={[
                styles.input,
                {
                  color: theme.text,
                  fontFamily: theme.fontFamily,
                  height: questionInputHeight,
                },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send question"
              accessibilityState={{
                disabled:
                  !question.trim() || composerDisabled,
                busy: sending,
              }}
              disabled={
                !question.trim() || composerDisabled
              }
              onPress={() => void sendQuestion()}
              style={[
                styles.sendButton,
                {
                  backgroundColor: theme.primary,
                  opacity:
                    !question.trim() || composerDisabled
                      ? 0.45
                      : 1,
                },
              ]}
            >
              {sending ? (
                <SendingGlyph color={theme.onPrimary} />
              ) : (
                <Ionicons name="arrow-up" size={21} color={theme.onPrimary} />
              )}
            </Pressable>
          </View>
          <AppText size="small" tone="secondary" style={styles.privacyNote}>
            Read-only farm assistant · Private to your account
          </AppText>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={historyOpen}
        transparent
        animationType="none"
        onRequestClose={closeHistory}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close conversation history"
            onPress={closeHistory}
            style={StyleSheet.absoluteFill}
          />
          <RNAnimated.View
            style={[
              styles.historyDrawer,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                width: Math.min(windowWidth * 0.88, 360),
                paddingTop: insets.top + 12,
                paddingBottom: Math.max(insets.bottom, 16),
                transform: [{ translateX: drawerTranslateX }],
              },
            ]}
          >
            <View style={styles.historyHeading}>
              {selectedCount ? (
                <>
                  <View style={styles.selectionTitle}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear chat selection"
                      onPress={() => setSelectedConversationIds(new Set())}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="close-circle"
                        size={25}
                        color={theme.textSecondary}
                      />
                    </Pressable>
                    <View>
                      <AppText size="heading" weight="semibold">
                        {selectedCount} selected
                      </AppText>
                      <AppText size="small" tone="secondary">
                        Choose chats to manage
                      </AppText>
                    </View>
                  </View>
                  <View style={styles.selectionActions}>
                    {selectedCount === 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Rename selected chat"
                        onPress={beginRenameConversation}
                        style={[
                          styles.historyActionButton,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Ionicons
                          name="pencil-outline"
                          size={18}
                          color={theme.text}
                        />
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${selectedCount} selected chats`}
                      onPress={() => void removeSelectedConversations()}
                      style={[
                        styles.historyActionButton,
                        { backgroundColor: `${theme.danger}18` },
                      ]}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={theme.danger}
                      />
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View>
                    <AppText size="heading" weight="semibold">
                      Chats
                    </AppText>
                    <AppText size="small" tone="secondary">
                      Your conversations with FarmMate
                    </AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close history"
                    onPress={closeHistory}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="close-circle"
                      size={27}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                </>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={startNewConversation}
              style={[
                styles.newConversation,
                {
                  backgroundColor: theme.backgroundSelected,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="add" size={19} color={theme.primary} />
              <AppText weight="semibold" style={{ color: theme.primary }}>
                Start a new conversation
              </AppText>
            </Pressable>
            <View
              style={[
                styles.historySearch,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name="search"
                size={18}
                color={theme.textSecondary}
              />
              <TextInput
                accessibilityLabel="Search chats"
                value={conversationSearch}
                onChangeText={setConversationSearch}
                placeholder="Search conversations"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="search"
                style={[
                  styles.historySearchInput,
                  { color: theme.text, fontFamily: theme.fontFamily },
                ]}
              />
              {conversationSearch ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear chat search"
                  onPress={() => setConversationSearch("")}
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              ) : null}
            </View>
            {filteredConversations.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  allVisibleSelected
                    ? "Deselect all visible chats"
                    : "Select all visible chats"
                }
                onPress={toggleSelectAllVisible}
                style={styles.selectAllButton}
              >
                <Ionicons
                  name={allVisibleSelected ? "checkbox" : "square-outline"}
                  size={17}
                  color={theme.primary}
                />
                <AppText size="small" weight="semibold" tone="muted">
                  {allVisibleSelected ? "Deselect all" : "Select all"}
                </AppText>
              </Pressable>
            ) : null}
            {error ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.historyError,
                  { backgroundColor: `${theme.danger}18` },
                ]}
              >
                <AppText
                  size="small"
                  style={{ color: theme.danger, flex: 1 }}
                >
                  {error}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss chat history error"
                  onPress={() => setError(null)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={17} color={theme.danger} />
                </Pressable>
              </View>
            ) : null}
            {conversations.isLoading ? (
              <View style={styles.historyState}>
                <ActivityIndicator color={theme.primary} />
                <AppText size="small" tone="secondary">
                  Loading conversations…
                </AppText>
              </View>
            ) : conversations.isError ? (
              <View style={styles.historyState}>
                <AppText size="small" style={{ color: theme.danger }}>
                  Could not load your conversations.
                </AppText>
                <Pressable onPress={() => void conversations.refetch()}>
                  <AppText size="small" weight="semibold" tone="muted">
                    Try again
                  </AppText>
                </Pressable>
              </View>
            ) : filteredConversations.length ? (
              <ScrollView
                style={styles.historyList}
                contentContainerStyle={styles.historyItems}
                keyboardShouldPersistTaps="handled"
              >
                {conversationGroups.map((group) => (
                  <View key={group.label}>
                    <AppText
                      size="small"
                      weight="semibold"
                      style={styles.historyGroupHeading}
                    >
                      {group.label}
                    </AppText>
                    {group.items.map((item) => {
                      const selected = selectedConversationIds.has(item.id);
                      const active = conversationId === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.title}, ${formatMessageDate(item.updated_at)}`}
                          accessibilityHint={
                            selectedCount
                              ? "Tap to change selection. Hold to select chats."
                              : "Tap to open. Hold to select chats."
                          }
                          accessibilityState={{ selected }}
                          disabled={loadingConversationId !== null || sending}
                          onPress={() => {
                            if (longPressHandled.current) {
                              longPressHandled.current = false;
                              return;
                            }
                            void openConversation(item);
                          }}
                          onPressIn={() => {
                            longPressHandled.current = false;
                          }}
                          onLongPress={() => {
                            longPressHandled.current = true;
                            toggleConversationSelection(item.id)
                          }}
                          delayLongPress={350}
                          style={[
                            styles.historyItem,
                            {
                              backgroundColor: selected
                                ? theme.backgroundSelected
                                : "transparent",
                              borderBottomColor: theme.border,
                            },
                          ]}
                        >
                          <View style={styles.historyItemMain}>
                            <View
                              style={[
                                styles.historyChatIcon,
                                {
                                  backgroundColor: selected
                                    ? theme.primary
                                    : theme.backgroundSelected,
                                },
                              ]}
                            >
                              {selected ? (
                                <Ionicons
                                  name="checkmark"
                                  size={17}
                                  color={theme.onPrimary}
                                />
                              ) : (
                                <Ionicons
                                  name="chatbubble-outline"
                                  size={17}
                                  color={active ? theme.primary : theme.textSecondary}
                                />
                              )}
                            </View>
                            <View style={styles.historyCopy}>
                              <AppText
                                weight={active || selected ? "semibold" : "regular"}
                                numberOfLines={1}
                                style={{
                                  color: active ? theme.primary : theme.text,
                                }}
                              >
                                {item.title}
                              </AppText>
                              <AppText
                                size="small"
                                tone="secondary"
                                numberOfLines={1}
                              >
                                {formatMessageDate(item.updated_at)}
                              </AppText>
                            </View>
                            {loadingConversationId === item.id ? (
                              <ActivityIndicator color={theme.primary} />
                            ) : selectedCount ? (
                              <Ionicons
                                name={
                                  selected
                                    ? "checkmark-circle"
                                    : "ellipse-outline"
                                }
                                size={20}
                                color={selected ? theme.primary : theme.border}
                              />
                            ) : active ? (
                              <View
                                style={[
                                  styles.activeChatDot,
                                  { backgroundColor: theme.primary },
                                ]}
                              />
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.historyState}>
                <Ionicons
                  name={conversationSearch ? "search-outline" : "chatbubbles-outline"}
                  size={28}
                  color={theme.primary}
                />
                <AppText weight="semibold">
                  {conversationSearch
                    ? "No matching chats"
                    : "No conversations yet"}
                </AppText>
                <AppText size="small" tone="secondary" style={styles.emptyHint}>
                  {conversationSearch
                    ? "Try another title or clear your search."
                    : "Ask FarmMate a question to start your first conversation."}
                </AppText>
              </View>
            )}
          </RNAnimated.View>
        </View>
      </Modal>
      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          style={styles.renameBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel rename"
            onPress={() => setRenameTarget(null)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.renameDialog,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
              },
            ]}
          >
            <AppText size="heading" weight="semibold">
              Rename chat
            </AppText>
            <AppText size="small" tone="secondary">
              Choose a name that will help you find this conversation later.
            </AppText>
            <TextInput
              accessibilityLabel="Chat name"
              value={renameTitle}
              onChangeText={setRenameTitle}
              onSubmitEditing={() => void saveConversationRename()}
              placeholder="Chat name"
              placeholderTextColor={theme.textSecondary}
              maxLength={120}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              style={[
                styles.renameInput,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  fontFamily: theme.fontFamily,
                },
              ]}
            />
            {error ? (
              <AppText size="small" style={{ color: theme.danger }}>
                {error}
              </AppText>
            ) : null}
            <View style={styles.renameActions}>
              <Pressable
                accessibilityRole="button"
                disabled={savingRename}
                onPress={() => setRenameTarget(null)}
                style={styles.renameCancel}
              >
                <AppText weight="semibold" tone="secondary">
                  Cancel
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={
                  savingRename ||
                  !renameTitle.trim() ||
                  renameTitle.trim() === renameTarget?.title
                }
                onPress={() => void saveConversationRename()}
                style={[
                  styles.renameSave,
                  {
                    backgroundColor: theme.primary,
                    opacity:
                      savingRename ||
                      !renameTitle.trim() ||
                      renameTitle.trim() === renameTarget?.title
                        ? 0.5
                        : 1,
                  },
                ]}
              >
                {savingRename ? (
                  <ActivityIndicator color={theme.onPrimary} size="small" />
                ) : (
                  <AppText weight="semibold" style={{ color: theme.onPrimary }}>
                    Save name
                  </AppText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  previewPage: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  previewContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingBottom: 48,
  },
  previewIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  previewDescription: { maxWidth: 460, textAlign: "center", lineHeight: 22 },
  previewWarning: { width: "100%", maxWidth: 500, gap: 10 },
  previewWarningHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  page: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 8,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  chatPanel: {
    flex: 1,
    minHeight: 0,
  },
  suggestions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingLeft: 40,
    paddingRight: 12,
  },
  suggestionStrip: {
    flexGrow: 0,
    flexShrink: 0,
    height: 48,
    marginTop: 1,
  },
  suggestion: {
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  messageList: { flexGrow: 1, gap: 12, paddingTop: 10, paddingBottom: 16 },
  messageRow: { width: "100%", flexDirection: "row", gap: 9, minWidth: 0 },
  userMessageRow: { justifyContent: "flex-end" },
  assistantMessageRow: { justifyContent: "flex-start", alignItems: "flex-start" },
  messageAvatar: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    marginTop: 17,
  },
  messageContent: { flex: 1, minWidth: 0, maxWidth: "88%", gap: 3 },
  userMessageContent: {
    flex: 0,
    flexShrink: 1,
    maxWidth: "84%",
    minWidth: 0,
    alignItems: "flex-end",
  },
  messageSender: { marginLeft: 3, fontSize: 11, lineHeight: 16 },
  suggestedReplies: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 6,
  },
  suggestedReply: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  messageBubble: {
    maxWidth: "100%",
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  assistantBubble: { borderTopLeftRadius: 7 },
  userBubble: { borderTopRightRadius: 7 },
  messageTime: { fontSize: 10, lineHeight: 14, marginTop: 6 },
  markdownBody: { gap: 4 },
  markdownListItem: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  markdownBullet: { lineHeight: 22 },
  markdownListText: { flex: 1 },
  markdownHeading: { marginTop: 3 },
  markdownTable: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginVertical: 5,
  },
  markdownTableRecord: { paddingHorizontal: 12, paddingVertical: 10, gap: 7 },
  markdownTableTitle: { fontSize: 15 },
  markdownTableField: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  markdownTableLabel: { flex: 1, lineHeight: 18 },
  markdownTableValue: { flex: 1.3, textAlign: "right", lineHeight: 20 },
  markdownLink: { textDecorationLine: "underline" },
  paragraphGap: { height: 5 },
  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 16,
  },
  typingDots: { flexDirection: "row", alignItems: "center", gap: 3 },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#3A9993",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  composer: {
    minHeight: 58,
    maxHeight: 120,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    borderRadius: 25,
    padding: 7,
    shadowColor: "#153B35",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 106,
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 10,
    paddingTop: 11,
    paddingBottom: 9,
    textAlignVertical: "top",
    includeFontPadding: false,
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  privacyNote: {
    textAlign: "center",
    fontSize: 10,
    lineHeight: 14,
    paddingTop: 1,
  },
  modalBackdrop: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-start",
    backgroundColor: "#07120FCC",
  },
  historyDrawer: {
    height: "100%",
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 13,
  },
  historyHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  selectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  selectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyActionButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  newConversation: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  historySearch: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  historySearchInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    fontSize: 14,
  },
  selectAllButton: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    paddingHorizontal: 3,
  },
  historyError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  historyList: { flex: 1 },
  historyItems: { paddingBottom: 12 },
  historyGroupHeading: {
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 6,
  },
  historyItem: {
    minHeight: 64,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  historyItemMain: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
  },
  historyChatIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  historyCopy: { flex: 1, minWidth: 0, gap: 1 },
  activeChatDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginHorizontal: 6,
  },
  historyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    padding: 20,
  },
  emptyHint: { maxWidth: 300, textAlign: "center" },
  renameBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    backgroundColor: "#07120FCC",
  },
  renameDialog: {
    width: "100%",
    maxWidth: 420,
    gap: 12,
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
  },
  renameInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  renameCancel: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  renameSave: {
    minWidth: 104,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingHorizontal: 14,
  },
});
