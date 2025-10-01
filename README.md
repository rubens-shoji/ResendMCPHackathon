# Alexa Email Assistant with Ollama + MCP

> **Hackathon Project** - Built for the Resend Hackathon
> Special thanks to @resend and @zenorocha

Voice-controlled AI email assistant that uses Amazon Alexa, Ollama, and Model Context Protocol (MCP) to send emails via Resend with intelligent HTML formatting.

## 🎥 Video Demo

Watch the full video explanation: [https://youtu.be/dFMqPxThIyY](https://youtu.be/dFMqPxThIyY)

## Features

- 🗣️ Natural language email composition
- 📧 Automatic HTML email layout generation
- 🎨 Smart subject line creation
- ⚡ Async email sending via API
- 🔧 MCP integration with Resend
- 💾 Email storage with SQLite

## Prerequisites

- Node.js 18+
- Ollama installed and running
- Ollama model with tool calling support (see below)
- Resend API key

### Ollama Model Requirements

This project requires an Ollama model that supports **function/tool calling**. I used `qwen3:14b` but you can use any model that has this capability:

**Recommended models:**
- `qwen3:14b` (what I used - good balance of performance and quality)
- `llama3.1:8b` or larger
- `mistral-nemo`
- `command-r`
- Any other model with tool calling support

**Why qwen3:14b?**
- Excellent multilingual support (handles Portuguese/English well)
- Good at following system instructions for HTML generation
- Fast enough on consumer hardware (see my specs below)
- Released recently (January 2025) with solid tool calling

**My Development Machine:**
- CPU: AMD Ryzen 9 7950X3D 16-Core Processor
- RAM: 96GB DDR4
- GPU: NVIDIA RTX 4090 24GB
- OS: Linux (WSL2 on Windows)

The model runs entirely on my local machine - no external API calls for the LLM!

## Installation

```bash
npm install
```

## Build MCP Server

```bash
cd mcp-send-email
npm install
npm run build
cd ..
```

## Configuration

Create a `.env` file:

```env
RESEND_API_KEY=your_resend_api_key
SENDER_EMAIL_ADDRESS=your_verified_email@domain.com
OLLAMA_MODEL=qwen3:14b
```

## Running

```bash
npm start
```

Or with environment variables:

```bash
RESEND_API_KEY=re_xxx SENDER_EMAIL_ADDRESS=you@domain.com node resend-hackton-ollama-alexa.ts
```

## API Endpoints

### POST `/prompt` ⭐ Main Feature
**Used by Alexa Skill for voice-controlled email sending**

This endpoint is integrated with an Amazon Alexa Skill to send emails via voice commands. The Alexa integration code is available in `lambda_function.py`.

**Request:**
```json
{
  "voice_input": "Send an email saying hello"
}
```

**Response:**
```json
{
  "success": true,
  "response": "Email will be sent"
}
```

### Email Storage Endpoints (Work in Progress)

> **Note:** These endpoints are part of a planned feature that wasn't completed in time for the hackathon. The idea is to forward emails from Thunderbird via a web extension to this API, store them in the database, and potentially use AI to process/respond to them automatically. The Thunderbird extension code is in the `thunderbird-extension/` folder but is not yet fully integrated.

- **POST `/process-email`** - Store incoming emails forwarded from Thunderbird extension
- **GET `/emails`** - List all stored emails from the database
- **DELETE `/emails/:id`** - Delete a specific email by ID
- **DELETE `/emails`** - Clear all emails from the database

## Usage

### Via Alexa Skill 🎤

The primary use case is through Amazon Alexa:
1. User: "Alexa, ask my home server to send an email to my wife with a joke about cats"
2. Alexa forwards voice input to Lambda function (`lambda_function.py`)
3. Lambda calls the `/prompt` endpoint
4. Email is sent via Resend with AI-generated HTML layout
5. Alexa confirms: "Email will be sent"

### Direct API Usage

The assistant automatically:
1. Generates appropriate subject lines
2. Enhances message content
3. Creates beautiful HTML layouts
4. Sends to configured recipient (rubensdrk@gmail.com)

Example prompts:
- "Send an email saying hello"
- "Email about meeting tomorrow at 3pm"
- "Send a birthday greeting"

## How It Works

1. Voice input → Alexa Skill → AWS Lambda (`lambda_function.py`)
2. Lambda → `/prompt` endpoint → Ollama (qwen3:14b)
3. AI decides to use `send-email` tool
4. MCP server calls Resend API
5. Email sent in background with custom HTML
6. Immediate response returned to user

## Debug Mode

Debug is enabled by default. Set `DEBUG = false` in code to disable.

## Technologies

- **Ollama** - Local LLM runtime (qwen3:14b model)
- **MCP** - Model Context Protocol for tool integration
- **Resend** - Email sending service
- **Amazon Alexa** - Voice interface
- **AWS Lambda** - Serverless function (Python)
- **Express** - HTTP server
- **SQLite** - Email storage (experimental)
- **TypeScript** - Type safety

## Project Structure

```
.
├── resend-hackton-ollama-alexa.ts   # Main server with MCP + Ollama integration
├── lambda_function.py               # AWS Lambda for Alexa Skill
├── mcp-send-email/                  # MCP server for Resend integration
├── mcp-email-manager/               # MCP server for email management (WIP)
└── thunderbird-extension/           # Experimental email receiver (WIP)
```

## Learn More

Watch the full video tutorial on YouTube: [https://youtu.be/dFMqPxThIyY](https://youtu.be/dFMqPxThIyY)

This video explains how this project works, how to set up your own Alexa Skill, and how MCP enables AI to interact with external services like Resend.
