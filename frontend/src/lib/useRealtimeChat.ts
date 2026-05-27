"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAppStore, type Message } from "@/stores/useAppStore";

/**
 * Subscribes to Supabase Realtime INSERT events on `chat_messages`
 * filtered by session_id. Auto-appends new messages to the Zustand
 * store so both student and lead see messages in real-time without
 * manual refresh.
 */
export function useRealtimeChat(sessionId: string | null) {
  const { addMessage, messages } = useAppStore();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    // Unsubscribe any existing channel before creating a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`chat-realtime-${sessionId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as Message;

          // Deduplicate: skip if we already have this message in state
          // (prevents double-showing optimistic messages the sender added locally)
          const existingIds = useAppStore.getState().messages.map((m) => m.id);
          if (existingIds.includes(newMsg.id)) return;

          // Also skip temp optimistic messages (ids starting with "temp-" or "twin-")
          // Those are replaced by the real persisted message via this channel
          addMessage(newMsg);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, addMessage]);
}
