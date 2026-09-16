import chromadb
from chromadb.config import Settings
import logging
from typing import List, Dict, Any
import os

logger = logging.getLogger("agent.memory")

class ShortTermMemory:
    """Manages session history for loop detection and state tracking."""
    def __init__(self):
        self.history = []
        
    def add_action(self, action_type: str, target: str, success: bool):
        self.history.append({
            "type": action_type,
            "target": target,
            "success": success
        })
        
    def get_recent(self, count: int = 5) -> List[Dict[str, Any]]:
        return self.history[-count:]
        
    def check_loop(self) -> bool:
        if len(self.history) < 3:
            return False
        last_3 = self.history[-3:]
        targets = [a['target'] for a in last_3]
        types = [a['type'] for a in last_3]
        # If the last 3 actions were exactly the same
        return len(set(targets)) == 1 and len(set(types)) == 1

class LongTermMemory:
    """Manages persistent vector memory using ChromaDB."""
    def __init__(self, persist_directory: str = "./chroma_db"):
        self.persist_directory = persist_directory
        self.client = None
        self.experience_collection = None
        self.knowledge_collection = None
        self.initialize()
        
    def initialize(self):
        try:
            self.client = chromadb.PersistentClient(path=self.persist_directory)
            self.experience_collection = self.client.get_or_create_collection("experiences")
            self.knowledge_collection = self.client.get_or_create_collection("knowledge_base")
            logger.info(f"[Memory] ChromaDB initialized at {self.persist_directory}")
        except Exception as e:
            logger.error(f"[Memory] Failed to initialize ChromaDB: {e}")
            
    def add_experience(self, task: str, successful_steps: List[str]):
        if not self.experience_collection: return
        doc_id = f"exp_{hash(task)}"
        try:
            self.experience_collection.add(
                documents=[" -> ".join(successful_steps)],
                metadatas=[{"task": task}],
                ids=[doc_id]
            )
        except Exception as e:
            logger.error(f"[Memory] Failed to add experience: {e}")
            
    def add_document(self, doc_id: str, text: str, metadata: dict):
        if not self.knowledge_collection: return
        try:
            self.knowledge_collection.add(
                documents=[text],
                metadatas=[metadata],
                ids=[doc_id]
            )
        except Exception as e:
            logger.error(f"[Memory] Failed to add document: {e}")
            
    def search_documents(self, query: str, n_results: int = 3) -> List[str]:
        if not self.knowledge_collection: return []
        try:
            results = self.knowledge_collection.query(
                query_texts=[query],
                n_results=n_results
            )
            return results["documents"][0] if results["documents"] else []
        except Exception as e:
            logger.error(f"[Memory] Failed to search documents: {e}")
            return []
