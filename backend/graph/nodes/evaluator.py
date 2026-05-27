"""
Jaswanth Digital Twin — Rational Evaluator Node
Compares submission_notes against daily_task and weekly_goal. (Doc 2, §2.2)
"""

import json
from graph.state import TwinState
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage


EVALUATOR_PROMPT = """You are a rational task evaluator for a software development team.
Your job is to compare a team member's submission notes and documentation updates against the daily task they were assigned and the overarching weekly goal.

Evaluate strictly on these criteria:
1. Did the submission demonstrate meaningful progress on the assigned task?
2. Are there technical gaps or missing deliverables?
3. Is the description specific enough to verify completion?

You must also output an "alignment_score" (integer, 0 to 100) representing how well the submission aligns with the daily task.
If the alignment_score is less than 50, the proposed status must be "rejected".

To keep the feedback authentic, write the "technical_gap_analysis" EXACTLY in the communication style of the team lead, Jaswanth.
Jaswanth's communication style guidelines:
- Direct, informal, and technical.
- Friendly but firm; points out errors/gaps immediately.
- Often uses lowercase for informal guidance (e.g. "hey, this looks ok but you missed the schema part. fix that and resubmit.").
- Avoids corporate fluff, marketing speak, or overly formal phrases like "Dear student" or "Please find attached". Just state the feedback directly.

Output your evaluation as valid JSON with exactly these fields:
{
    "alignment_score": 85,
    "evaluation_status": "approved" | "rejected" | "needs_clarification",
    "technical_gap_analysis": "your feedback written in jaswanth's style here"
}

Be fair but rigorous."""


def evaluator_node(state: TwinState) -> dict:
    """
    Rational evaluator using GPT-4o-mini for structured output.
    Compares submission against task requirements.

    Returns:
        Updated state with evaluation_status, technical_gap_analysis, and alignment_score.
    """
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2, max_tokens=500)

    context = f"""Weekly Goal: {state.get('weekly_goal', 'Not specified')}

Daily Task: {state.get('daily_task', 'Not specified')}

Submission Notes and Documentation Updates: {state.get('submission_notes', 'No notes provided')}"""

    messages = [
        SystemMessage(content=EVALUATOR_PROMPT),
        HumanMessage(content=context),
    ]

    response = llm.invoke(messages)

    try:
        # Clean response content just in case LLM wraps it in markdown blocks
        clean_content = response.content.strip()
        if clean_content.startswith("```json"):
            clean_content = clean_content.split("```json")[1].split("```")[0].strip()
        elif clean_content.startswith("```"):
            clean_content = clean_content.split("```")[1].split("```")[0].strip()

        result = json.loads(clean_content)
        alignment_score = int(result.get("alignment_score", 100))
        evaluation_status = result.get("evaluation_status", "needs_clarification")
        gap_analysis = result.get("technical_gap_analysis", "unable to parse evaluation.")

        # Force rejection if alignment score is under 50%
        if alignment_score < 50:
            evaluation_status = "rejected"

    except (json.JSONDecodeError, AttributeError, ValueError) as e:
        print(f"[WARN] Failed to parse evaluator response: {e}")
        alignment_score = 50
        evaluation_status = "needs_clarification"
        gap_analysis = "evaluation parsing failed. manual review recommended."

    return {
        "evaluation_status": evaluation_status,
        "technical_gap_analysis": gap_analysis,
        "alignment_score": alignment_score,
    }

