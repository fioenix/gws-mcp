"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { ConversationList } from "@/components/conversation-list";
import { ConversationView } from "@/components/conversation-view";
import { CustomerPanel } from "@/components/customer-panel";
import { api } from "@/lib/client-api";
import type { Agent, Conversation, Message } from "@/lib/types";

export function InboxWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Agent>();
  const [selectedId, setSelectedId] = useState<string>();
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refreshList = useCallback(async () => {
    const { conversations } = await api.conversations();
    setConversations(conversations);
    return conversations;
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const { conversation, messages } = await api.thread(id);
    setConversation(conversation);
    setMessages(messages);
  }, []);

  // Tải dữ liệu ban đầu.
  useEffect(() => {
    (async () => {
      const [{ conversations }, { currentAgent }] = await Promise.all([
        api.conversations(),
        api.agents(),
      ]);
      setConversations(conversations);
      setCurrentAgent(currentAgent);
      if (conversations.length) setSelectedId(conversations[0].id);
      setLoaded(true);
    })();
  }, []);

  // Khi đổi hội thoại được chọn → tải thread.
  useEffect(() => {
    if (selectedId) loadThread(selectedId);
  }, [selectedId, loadThread]);

  async function withBusy<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  const handleSendAgent = (text: string) =>
    withBusy(async () => {
      if (!selectedId) return;
      await api.sendMessage(selectedId, text, "agent");
      await Promise.all([loadThread(selectedId), refreshList()]);
    });

  const handleAiAutoReply = () =>
    withBusy(async () => {
      if (!selectedId) return;
      await api.aiReply(selectedId, "send");
      await Promise.all([loadThread(selectedId), refreshList()]);
    });

  const handleRequestDraft = async () => {
    if (!selectedId) return null;
    const res = await api.aiReply(selectedId, "draft");
    return res.draft ?? null;
  };

  const handleToggleMode = (mode: "ai" | "human") =>
    withBusy(async () => {
      if (!selectedId) return;
      await api.setMode(selectedId, mode);
      await Promise.all([loadThread(selectedId), refreshList()]);
    });

  const handleResolve = () =>
    withBusy(async () => {
      if (!selectedId) return;
      await api.setStatus(selectedId, "resolved");
      await Promise.all([loadThread(selectedId), refreshList()]);
    });

  // Giả lập tin nhắn khách → nếu hội thoại ở chế độ AI thì tự động trả lời.
  const handleSimulateCustomer = (text: string) =>
    withBusy(async () => {
      if (!selectedId) return;
      await api.sendMessage(selectedId, text, "customer");
      const current = conversations.find((c) => c.id === selectedId);
      if (current?.mode === "ai") {
        await api.aiReply(selectedId, "send");
      }
      await Promise.all([loadThread(selectedId), refreshList()]);
    });

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang tải hộp thư…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar currentAgent={currentAgent} />
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {conversation ? (
        <ConversationView
          key={conversation.id}
          conversation={conversation}
          messages={messages}
          onSendAgent={handleSendAgent}
          onAiAutoReply={handleAiAutoReply}
          onRequestDraft={handleRequestDraft}
          onToggleMode={handleToggleMode}
          onResolve={handleResolve}
          onSimulateCustomer={handleSimulateCustomer}
          busy={busy}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Chọn một hội thoại để bắt đầu.
        </div>
      )}
      {conversation && <CustomerPanel conversation={conversation} />}
    </div>
  );
}
