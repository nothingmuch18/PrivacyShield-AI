# PrivacyShield AI - Backend Server

This is the FastAPI backend server for the PrivacyShield Chrome Extension. It receives redacted screenshots and structured DOM data, optionally passing them to an AI Vision-Language Model (VLM) for real-time web interaction.

## Installation

1. Make sure you have Python 3.10+ installed.
2. It's recommended to use a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
   ```
3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Configuration

1. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your AI API key (e.g., Groq) if you have one. If you don't set an API key, the server will gracefully fallback to a MOCK mode.

## Running the Server

Start the FastAPI server using Uvicorn:

```bash
uvicorn main:app --reload --port 8000
```

The server will be available at `http://localhost:8000`.

## API Documentation and Testing

FastAPI automatically generates interactive API documentation. You can test the endpoints by navigating to:
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Core Endpoints
- `GET /api/health`: Check server status.
- `POST /api/analyze`: Takes a JSON payload containing the `redacted_screenshot` and `page_structure`, returning an AI (or mock) `action`.
- `WS /ws/agent`: WebSocket endpoint for continuous, bi-directional agent communication.
