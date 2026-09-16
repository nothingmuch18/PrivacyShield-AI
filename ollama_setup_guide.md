# Ollama Setup Guide

To use a local AI model for vision tasks (as an alternative to the Groq API), you can configure PrivacyShield to use Ollama.

## 1. Download and Install
- Go to [ollama.com](https://ollama.com/)
- Download the installer for your operating system and complete the installation.

## 2. Pull the Vision Model
PrivacyShield requires a vision model to analyze screenshots. Open your terminal or command prompt and run:
```bash
ollama pull llava
```
*(Alternatively, you can pull other vision models like `llama3.2-vision`)*

## 3. Run Ollama
Once installed, the Ollama server starts automatically and runs locally at `http://localhost:11434`.

## 4. Connect the Server
Our FastAPI server will connect to your local Ollama instance automatically when the provider is set to `"ollama"`.

You can switch between Groq and Ollama at runtime using the `/api/config` endpoint:
```bash
curl -X POST http://localhost:8000/api/config \
     -H "Content-Type: application/json" \
     -d '{"provider": "ollama", "model": "llava"}'
```
Or by setting it in your environment variables: `AI_PROVIDER=ollama`.
