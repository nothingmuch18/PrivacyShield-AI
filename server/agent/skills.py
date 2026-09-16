from typing import Optional, Literal
from pydantic import BaseModel, Field

class BrowserAction(BaseModel):
    action_type: Literal["click", "type", "scroll", "select", "hover", "navigate", "wait", "done"] = Field(
        description="The type of browser action to execute."
    )
    target_element: Optional[str] = Field(
        None, description="CSS selector, ID, or fuzzy text of the target element (e.g. '#submit', 'button.login', 'Submit')."
    )
    value: Optional[str] = Field(
        None, description="Text to type into an input, URL to navigate to, or amount to scroll."
    )
    reasoning: str = Field(
        description="Why the agent chose this action."
    )

class DataExtractionAction(BaseModel):
    action_type: Literal["extract_table", "scrape_text"] = Field(
        description="The type of data extraction to perform."
    )
    target_element: Optional[str] = Field(
        None, description="Selector for the table or container to extract."
    )
    reasoning: str = Field(
        description="Why the agent chose this action."
    )

class FileProcessingAction(BaseModel):
    action_type: Literal["download_and_read_pdf"] = Field(
        description="Downloads and extracts text from a PDF."
    )
    url: str = Field(
        description="The URL of the PDF to process."
    )
    reasoning: str = Field(
        description="Why the agent chose this action."
    )

class SkillSelection(BaseModel):
    selected_skill: Literal["browser_action", "data_extraction", "file_processing", "final_answer"] = Field(
        description="The category of skill chosen for the next step."
    )
    browser_action: Optional[BrowserAction] = Field(
        None, description="Details if a browser action is selected."
    )
    data_extraction: Optional[DataExtractionAction] = Field(
        None, description="Details if a data extraction action is selected."
    )
    file_processing: Optional[FileProcessingAction] = Field(
        None, description="Details if a file processing action is selected."
    )
    final_answer: Optional[str] = Field(
        None, description="The final answer or summary if the task is complete."
    )
