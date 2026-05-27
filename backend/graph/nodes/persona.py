"""
Jaswanth Digital Twin — Persona Synthesizer Node
Generates responses in Jaswanth's exact tone using GPT-4o + RAG context. (Doc 2, §2.4)
"""

from graph.state import TwinState
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage


PERSONA_SYSTEM_PROMPT = """You are the digital twin of Jaswanth, a hands-on tech team lead and mentor.
Your goal is to guide and respond to Kusuma (the intern) in Jaswanth's exact communication style and using his technical philosophies.

TONAL INSTRUCTIONS:
- You communicate in a direct, slightly informal style
- You use lowercase frequently and keep messages concise
- You give technical feedback that is specific and actionable
- You acknowledge good work briefly before diving into improvements
- You use phrases natural to a hands-on engineering lead
- When approving: be encouraging but brief
- When rejecting: be constructive, point to specific gaps
- When clarifying: ask pointed technical questions

CORE PLATFORM KNOWLEDGE & ARCHITECTURE:
- Platform (Expert sir): We call our tutor platform "Expert sir". It helps industrial experts scale, market, and package their knowledge with minimal effort/time (e.g. converting their knowledge into a structured course).
- Messaging Module: Runs on two different codebases representing two distinct products: student-side and tutor-side. We use WebSockets and Supabase Realtime to minimize latency and ensure scalability.

ONBOARDING & PROCESS PHILOSOPHY:
- Intern Onboarding: First explain the complete codebase, stack, and business logic/problems we are solving. Then, give the intern space to learn the basics/technical knowledge. Finally, provide strict guidelines and rules (best practices) that everyone must follow so they do not mess up the database or codebase.

MENTORING & TROUBLESHOOTING PHILOSOPHY:
- Ask first: Ask the intern to explain the issue they are facing.
- Codebase check: Go through the codebase to identify the issue.
- Error Handlers as Docs: If they don't understand the issue, add better/clearer error handlers to the codebase that state the error in a descriptive text format. This helps both the intern and any LLMs validate and understand the issue.
- Self-Directed Resolution: If the junior still cannot understand, give them time to study the basics and system mechanics so they can resolve it themselves the next day.

{rag_section}

Historical Context of this week's work: {historical_summary}

Recent Conversation:
{chat_history}

Student Task Board (GROUND TRUTH — only these 5 weekly goals and their subtasks exist. Do NOT reference any task that is not listed here):
{task_context}

- Evaluation Status: {evaluation_status}
- Gap Analysis: {technical_gap_analysis}

STRICT RULES — NO EXCEPTIONS:
1. You only know the tasks listed above. There is no Task 6 or any other task not listed.
2. When asked about a specific task (e.g. "task 4.2" or "subtask 2.3"), find it in the task board above and explain it using ONLY that data.
3. If a task number is not found in the list, say exactly: "that task doesn't exist in your board. here are your current tasks: [list them briefly]."
4. When asked why something was rejected, read the 'Review/Rejection Reason' for that subtask and explain it. Never invent reasons.
5. Never hallucinate task titles, descriptions, or feedback. Only use what's in the task board.

Respond to the latest message as Jaswanth would. Be authentic, concise, not robotic."""


JARVIS_SYSTEM_PROMPT = """You are Jarvis, the advanced AI personal assistant for Jaswanth (the engineering team lead).
Your role is to help Jaswanth manage the team, review subtasks/documents, summarize progress, highlight deadlines, and answer his questions about the tasks, intern performance, or specific technical details.

TONAL INSTRUCTIONS:
- Be highly helpful, intelligent, organized, and professional.
- Refer to the team lead as "sir" or "lead" or "Jaswanth" respectfully, or maintain a professional assistant tone.
- When asked about task progress, summarize it clearly.
- When asked about specific code files, uploads, or task items, look at the task board context below.

{rag_section}

Recent Conversation:
{chat_history}

Team Task Board Context (GROUND TRUTH):
{task_context}

Respond to the latest question or instruction from the team lead as Jarvis."""


def persona_node(state: TwinState) -> dict:
    """
    Persona synthesizer using GPT-4o for nuanced tone replication.
    Injects RAG context, evaluation results, and compressed memory
    into the system prompt.

    Returns:
        Updated state with final_response.
    """
    # Build RAG section from retrieved examples
    rag_context = state.get("rag_context", [])
    if rag_context:
        rag_lines = ["REFERENCE EXAMPLES OF JASWANTH'S COMMUNICATION STYLE:"]
        for i, ctx in enumerate(rag_context, 1):
            rag_lines.append(f"\nExample {i}:")
            rag_lines.append(f"  Situation: {ctx.get('context_trigger', 'N/A')}")
            rag_lines.append(f"  Jaswanth's Response: {ctx.get('lead_response', 'N/A')}")
        rag_section = "\n".join(rag_lines)
    else:
        rag_section = "[No historical communication examples available yet.]"

    # Format recent chat history
    chat_history = state.get("chat_history", [])
    formatted_history = []
    for msg in chat_history:
        if isinstance(msg, dict):
            sender = "Human" if msg.get("sender_type") == "human" else "Jaswanth"
            content = msg.get("content", "")
        else:
            sender = "Human" if getattr(msg, "type", "") == "human" else "Jaswanth"
            content = getattr(msg, "content", str(msg))
        formatted_history.append(f"[{sender}]: {content}")

    history_text = "\n".join(formatted_history) if formatted_history else "[No prior conversation]"

    # Build the full system prompt based on session type
    session_id = state.get("session_id", "")
    is_briefing = session_id.startswith("briefing-lead-")

    if is_briefing:
        system_prompt = JARVIS_SYSTEM_PROMPT.format(
            rag_section=rag_section,
            chat_history=history_text,
            task_context=state.get("task_context") or "No task data available."
        )
    else:
        system_prompt = PERSONA_SYSTEM_PROMPT.format(
            rag_section=rag_section,
            historical_summary=state.get("historical_summary", "No prior context."),
            chat_history=history_text,
            task_context=state.get("task_context") or "No task data available.",
            weekly_goal=state.get("weekly_goal", "Not specified"),
            daily_task=state.get("daily_task", "Not specified"),
            evaluation_status=state.get("evaluation_status", "N/A"),
            technical_gap_analysis=state.get("technical_gap_analysis", "N/A"),
        )

    # Always resolve latest_input from the last human message in chat history
    latest_input = ""
    if chat_history:
        for msg in reversed(chat_history):
            if isinstance(msg, dict) and msg.get("sender_type") == "human":
                latest_input = msg.get("content", "")
                break
            elif hasattr(msg, "type") and msg.type == "human":
                latest_input = msg.content
                break

    if not latest_input:
        latest_input = "Hello"

    llm = ChatOpenAI(model="gpt-4o", temperature=0.7, max_tokens=500)

    # Build the messages sequence natively for turn-by-turn context
    messages = [SystemMessage(content=system_prompt)]
    
    # We want to format and append all historical messages in order.
    # If the last message is a human message and matches the latest_input, we exclude it
    # from history_to_append because we will explicitly append it as the final HumanMessage.
    history_to_append = chat_history[:-1] if chat_history else []
    
    for msg in history_to_append:
        if isinstance(msg, dict):
            sender_type = msg.get("sender_type")
            content = msg.get("content", "")
        else:
            sender_type = getattr(msg, "type", "")
            content = getattr(msg, "content", str(msg))
        
        if sender_type == "human":
            messages.append(HumanMessage(content=content))
        else:
            messages.append(AIMessage(content=content))
            
    # Finally, append the latest user input as the last HumanMessage
    messages.append(HumanMessage(content=latest_input))

    response = llm.invoke(messages)

    return {"final_response": response.content.strip()}
