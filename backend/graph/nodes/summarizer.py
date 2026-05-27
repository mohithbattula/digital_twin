"""
Jaswanth Digital Twin — Summarizer Node
Rolling window memory compression to manage context limits. (Doc 7, §2.2-2.3)
"""

from graph.state import TwinState
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage


SUMMARIZATION_PROMPT = """You are a memory compression engine. 
Current Summary: {historical_summary}
New Chat to Compress: {oldest_messages}

Instruction: Combine the new chat into the current summary. Keep it concise. Focus strictly on technical decisions made, tasks discussed, and any specific feedback Jaswanth gave. Do not summarize pleasantries."""

MAX_HISTORY_LENGTH = 6  # Trigger compression after 6 messages (3 turns)
KEEP_RECENT = 4  # Keep last 4 messages (2 turns)


def summarizer_node(state: TwinState) -> dict:
    """
    Compresses chat history when it exceeds MAX_HISTORY_LENGTH messages.
    Keeps the last KEEP_RECENT messages and summarizes the rest.

    Only triggers if chat_history > 6 messages (Doc 7, §2.2).
    Uses GPT-4o-mini for lightweight summarization.

    Returns:
        Updated state with compressed historical_summary and truncated chat_history.
    """
    chat_history = state.get("chat_history", [])
    historical_summary = state.get("historical_summary", "")

    # Only summarize if history exceeds threshold
    if len(chat_history) <= MAX_HISTORY_LENGTH:
        return {"chat_history": chat_history}

    # Split: oldest messages to compress, recent messages to keep
    oldest_messages = chat_history[:-KEEP_RECENT]
    recent_messages = chat_history[-KEEP_RECENT:]

    # Format oldest messages for the summarizer
    formatted_old = []
    for msg in oldest_messages:
        if isinstance(msg, dict):
            sender = msg.get("sender_type", "unknown")
            content = msg.get("content", "")
        else:
            sender = getattr(msg, "type", "unknown")
            content = getattr(msg, "content", str(msg))
        formatted_old.append(f"[{sender}]: {content}")

    oldest_text = "\n".join(formatted_old)

    # Run compression via GPT-4o-mini
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, max_tokens=300)

    prompt = SUMMARIZATION_PROMPT.format(
        historical_summary=historical_summary or "No prior summary.",
        oldest_messages=oldest_text,
    )

    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content="Compress the above into an updated summary."),
    ]

    response = llm.invoke(messages)
    new_summary = response.content.strip()

    return {
        "historical_summary": new_summary,
        "chat_history": recent_messages,
    }
