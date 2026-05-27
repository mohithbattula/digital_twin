"""
Jaswanth Digital Twin — LangGraph Builder
Compiles the StateGraph with conditional edge routing. (Doc 2, Doc 5 §3.3)
"""

from langgraph.graph import StateGraph, END

from graph.state import TwinState
from graph.nodes.sanitizer import sanitizer_node
from graph.nodes.context_hydration import context_hydration_node
from graph.nodes.evaluator import evaluator_node
from graph.nodes.rag_retrieval import rag_retrieval_node
from graph.nodes.summarizer import summarizer_node
from graph.nodes.persona import persona_node
from graph.nodes.rejection import rejection_node


def route_after_sanitization(state: TwinState) -> str:
    """
    Conditional edge after the Sanitizer Node. (Doc 5, §3.3)
    Routes to rejection_node if input is unsafe, else continues pipeline.
    """
    if not state.get("is_safe", True):
        return "rejection_node"
    return "context_hydration_node"


def build_evaluation_graph() -> StateGraph:
    """
    Builds the full evaluation pipeline:

    START → sanitizer → [conditional]
      ├─ unsafe → rejection → END
      └─ safe → context_hydration → evaluator → rag_retrieval → summarizer → persona → END
    """
    graph = StateGraph(TwinState)

    # Register nodes
    graph.add_node("sanitizer_node", sanitizer_node)
    graph.add_node("rejection_node", rejection_node)
    graph.add_node("context_hydration_node", context_hydration_node)
    graph.add_node("evaluator_node", evaluator_node)
    graph.add_node("rag_retrieval_node", rag_retrieval_node)
    graph.add_node("summarizer_node", summarizer_node)
    graph.add_node("persona_node", persona_node)

    # Entry point
    graph.set_entry_point("sanitizer_node")

    # Conditional routing after sanitization
    graph.add_conditional_edges(
        "sanitizer_node",
        route_after_sanitization,
        {
            "rejection_node": "rejection_node",
            "context_hydration_node": "context_hydration_node",
        },
    )

    # Linear pipeline after sanitization passes
    graph.add_edge("context_hydration_node", "evaluator_node")
    graph.add_edge("evaluator_node", "rag_retrieval_node")
    graph.add_edge("rag_retrieval_node", "summarizer_node")
    graph.add_edge("summarizer_node", "persona_node")

    # Terminal edges
    graph.add_edge("persona_node", END)
    graph.add_edge("rejection_node", END)

    return graph.compile()


def build_chat_graph() -> StateGraph:
    """
    Builds a simplified chat-only pipeline (no task evaluation):

    START → sanitizer → [conditional]
      ├─ unsafe → rejection → END
      └─ safe → rag_retrieval → summarizer → persona → END
    """
    graph = StateGraph(TwinState)

    # Register nodes (no context_hydration — task context is pre-injected by chat.py)
    graph.add_node("sanitizer_node", sanitizer_node)
    graph.add_node("rejection_node", rejection_node)
    graph.add_node("rag_retrieval_node", rag_retrieval_node)
    graph.add_node("summarizer_node", summarizer_node)
    graph.add_node("persona_node", persona_node)

    # Entry point
    graph.set_entry_point("sanitizer_node")

    # Conditional routing
    def route_chat_sanitization(state: TwinState) -> str:
        if not state.get("is_safe", True):
            return "rejection_node"
        return "rag_retrieval_node"  # skip context_hydration, go straight to rag

    graph.add_conditional_edges(
        "sanitizer_node",
        route_chat_sanitization,
        {
            "rejection_node": "rejection_node",
            "rag_retrieval_node": "rag_retrieval_node",
        },
    )

    # Linear pipeline
    graph.add_edge("rag_retrieval_node", "summarizer_node")
    graph.add_edge("summarizer_node", "persona_node")

    # Terminal edges
    graph.add_edge("persona_node", END)
    graph.add_edge("rejection_node", END)

    return graph.compile()
