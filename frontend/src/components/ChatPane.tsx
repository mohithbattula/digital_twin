"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/stores/useAppStore";
import { apiFetch, getApiBaseUrl } from "@/lib/api";
import { useRealtimeChat } from "@/lib/useRealtimeChat";
import MessageBubble from "./MessageBubble";
import type { Message } from "@/stores/useAppStore";

export default function ChatPane() {
  const {
    messages,
    setMessages,
    addMessage,
    activeSessionId,
    currentUser,
    isStreaming,
    setIsStreaming,
  } = useAppStore();

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeTwinMsgId = useRef<string | null>(null); // tracks current streaming twin msg

  // Real-time subscription: auto-append new messages from lead or twin
  useRealtimeChat(activeSessionId ?? null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load messages on session change + poll every 3s as fallback safety net
  useEffect(() => {
    if (!activeSessionId) return;

    const loadMessages = async () => {
      try {
        const data = await apiFetch<{ messages: Message[] }>(
          `/chat/messages?session_id=${encodeURIComponent(activeSessionId)}`
        );
        setMessages(data.messages);
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    };

    loadMessages();

    // Polling fallback: every 3 seconds in case realtime websocket drops
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [activeSessionId, setMessages]);


  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isStreaming || !currentUser || !activeSessionId) return;

    setInputValue("");
    setIsStreaming(true);

    // Optimistic: add human message to UI immediately
    const tempHumanMsg = {
      id: `temp-${Date.now()}`,
      session_id: activeSessionId,
      sender_id: currentUser.id,
      sender_type: "human" as const,
      content: text,
      associated_task_id: null,
      created_at: new Date().toISOString(),
    };
    addMessage(tempHumanMsg);

    // Placeholder for twin response (streaming)
    const tempTwinId = `twin-${Date.now()}`;
    const tempTwinMsg = {
      id: tempTwinId,
      session_id: activeSessionId,
      sender_id: null,
      sender_type: "twin" as const,
      content: "",
      associated_task_id: null,
      created_at: new Date().toISOString(),
    };
    addMessage(tempTwinMsg);

    try {
      const response = await fetch(`${getApiBaseUrl()}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: activeSessionId,
          message: text,
          user_id: currentUser.id,
        }),
      });

      if (!response.ok) throw new Error("Stream failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE lines
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === '"[DONE]"') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.chunk) {
                  fullResponse += parsed.chunk;
                  // Update the twin message in-place
                  useAppStore.setState((state) => ({
                    messages: state.messages.map((m) =>
                      m.id === tempTwinId
                        ? { ...m, content: fullResponse }
                        : m
                    ),
                  }));
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Chat stream error:", err);
      // Update twin message with error
      useAppStore.setState((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempTwinId
            ? {
                ...m,
                content:
                  "Sorry, I couldn't process that. The backend may be offline.",
              }
            : m
        ),
      }));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div
        className="px-5 py-4 border-b flex items-center gap-3"
        style={{ borderColor: "var(--glass-border)" }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "var(--gradient-accent)", flexShrink: 0 }}
        >
          <span className="text-white text-xs font-bold">J</span>
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Jaswanth (AI Twin)
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {isStreaming ? "Typing..." : "Online - Ready to assist"}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
              >
                <span className="text-sm font-bold" style={{ color: "var(--text-accent)" }}>JT</span>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Start a conversation with Jaswanth&apos;s Digital Twin
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Ask about tasks, get feedback, or discuss technical decisions
              </p>
            </motion.div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div
        className="px-4 py-3 border-t"
        style={{ borderColor: "var(--glass-border)" }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Jaswanth's Twin..."
            disabled={isStreaming}
            rows={1}
            className="glass-input resize-none flex-1"
            style={{ maxHeight: 120 }}
            id="chat-input"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            className="btn-accent flex items-center justify-center"
            style={{ height: 44, width: 44, padding: 0, borderRadius: 12, flexShrink: 0 }}
            id="chat-send-btn"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
