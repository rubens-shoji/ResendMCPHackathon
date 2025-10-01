import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Ollama } from 'ollama';
import * as readline from 'node:readline';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';

const DEBUG = true;

const db = new Database('emails.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE,
    subject TEXT,
    from_email TEXT,
    to_email TEXT,
    date TEXT,
    folder TEXT,
    body TEXT,
    headers TEXT,
    received_at TEXT,
    processed BOOLEAN DEFAULT 0
  )
`);

interface ToolCall {
  function: {
    name: string;
    arguments: any;
  };
}

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: ToolCall[];
}

interface OllamaResponse {
  message: OllamaMessage;
}

async function setupMCPClient(serverName: string, command: string, args: string[], env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command,
    args,
    env,
  });

  const client = new Client(
    {
      name: serverName,
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  return client;
}

function convertMCPToolsToOllama(mcpTools: any[]) {
  return mcpTools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

async function getOllamaTools(mcpClients: Client[]) {
  const allTools: any[] = [];

  for (const client of mcpClients) {
    const toolsList = await client.listTools();
    allTools.push(...convertMCPToolsToOllama(toolsList.tools));
  }

  return allTools;
}

async function chatWithTools(
  userMessage: string,
  ollama: Ollama,
  mcpClients: Client[],
  conversationHistory: OllamaMessage[],
  tools: any[],
  returnEarlyOnEmail: boolean = false
) {
  conversationHistory.push({
    role: 'user',
    content: userMessage,
  });

  const messages = conversationHistory;

  let response = (await ollama.chat({
    model: process.env.OLLAMA_MODEL || 'qwen3:14b',
    messages: messages,
    tools: tools,
    options: {
      temperature: 0.7,
    },
  })) as OllamaResponse;

  let hasToolCalls = response.message.tool_calls && response.message.tool_calls.length > 0;

  while (hasToolCalls) {
    messages.push(response.message);

    for (const toolCall of response.message.tool_calls!) {
      const toolName = toolCall.function.name;
      const toolArgs = toolCall.function.arguments;

      if (DEBUG) {
        console.log(`\n🔧 Calling tool: ${toolName}`);
        console.log(`📋 Arguments: ${JSON.stringify(toolArgs, null, 2)}`);
      }

      if (returnEarlyOnEmail && toolName === 'send-email') {
        setImmediate(async () => {
          for (const client of mcpClients) {
            try {
              await client.callTool({
                name: toolName,
                arguments: toolArgs,
              });
              if (DEBUG) {
                console.log(`✅ Email sent in background`);
              }
              break;
            } catch (error: any) {
              console.error(`❌ Error sending email: ${error.message}`);
            }
          }
        });

        messages.push({
          role: 'tool',
          content: JSON.stringify({ success: true, message: 'Email queued for sending' }),
        });

        const finalResponse = (await ollama.chat({
          model: process.env.OLLAMA_MODEL || 'qwen3:14b',
          messages: messages,
          tools: tools,
          options: {
            temperature: 0.7,
          },
        })) as OllamaResponse;

        conversationHistory.push(finalResponse.message);

        let cleanContent = finalResponse.message.content || '';
        cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        return cleanContent;
      }

      let toolResult = null;
      let toolError = null;

      for (const client of mcpClients) {
        try {
          toolResult = await client.callTool({
            name: toolName,
            arguments: toolArgs,
          });
          break;
        } catch (error: any) {
          toolError = error;
          continue;
        }
      }

      if (toolResult) {
        const toolResultMessage: OllamaMessage = {
          role: 'tool',
          content: JSON.stringify(toolResult),
        };

        messages.push(toolResultMessage);

        if (DEBUG) {
          console.log(`✅ Result: ${JSON.stringify(toolResult, null, 2)}`);
        }
      } else {
        console.error(`❌ Error calling tool: ${toolError?.message}`);

        messages.push({
          role: 'tool',
          content: `Error: ${toolError?.message || 'Tool not found'}`,
        });
      }
    }

    response = (await ollama.chat({
      model: process.env.OLLAMA_MODEL || 'qwen3:14b',
      messages: messages,
      tools: tools,
      options: {
        temperature: 0.7,
      },
    })) as OllamaResponse;

    hasToolCalls = response.message.tool_calls && response.message.tool_calls.length > 0;
  }

  conversationHistory.push(response.message);

  let cleanContent = response.message.content || '';
  cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return cleanContent;
}

async function startServer(
  ollama: Ollama,
  mcpClients: Client[],
  conversationHistory: OllamaMessage[],
  tools: any[]
) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/prompt', async (req, res) => {
    try {
      console.log(req.body)
      const { voice_input } = req.body;

      if (!voice_input) {
        return res.status(400).json({ success: false, message: 'Message is required' });
      }

      res.json({ success: true, response: "Email will be sent" });

      await chatWithTools(
        voice_input,
        ollama,
        mcpClients,
        conversationHistory,
        tools,
        true
      );

    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/process-email', (req, res) => {
    const email = req.body;
    const receivedAt = new Date().toISOString();

    try {
      const insert = db.prepare(`
        INSERT OR REPLACE INTO emails
        (message_id, subject, from_email, to_email, date, folder, body, headers, received_at, processed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `);

      insert.run(
        email.id || `${Date.now()}`,
        email.subject,
        email.from,
        JSON.stringify(email.to),
        email.date,
        email.folder,
        email.body,
        JSON.stringify(email.headers),
        receivedAt
      );

      if (DEBUG) {
        console.log('\n📧 Email saved to database:', email.subject);
      }

      res.json({ success: true, message: 'Email received and saved successfully' });
    } catch (error: any) {
      console.error('Error saving email:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/emails', (_req, res) => {
    try {
      const emails = db.prepare('SELECT * FROM emails ORDER BY received_at DESC').all();
      res.json({ total: emails.length, emails });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete('/emails/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM emails WHERE id = ?').run(id);
      res.json({ success: true, message: 'Email deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete('/emails', (_req, res) => {
    try {
      db.prepare('DELETE FROM emails').run();
      res.json({ success: true, message: 'All emails deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  const server = app.listen(3000, () => {
    const count = db.prepare('SELECT COUNT(*) as count FROM emails').get() as { count: number };
    console.log('🌐 HTTP Server running on port 3000');
    console.log('🤖 AI Chat: POST http://localhost:3000/prompt');
    console.log('📬 Process Email: POST http://localhost:3000/process-email');
    console.log('📋 List Emails: GET http://localhost:3000/emails');
    console.log(`💾 Emails in database: ${count.count}\n`);
  });

  return server;
}

async function main() {
  const ollama = new Ollama();

  const emailSenderClient = await setupMCPClient(
    'resend-email-sender',
    'node',
    ['./mcp-send-email/build/index.js'],
    {
      RESEND_API_KEY: process.env.RESEND_API_KEY || '',
      SENDER_EMAIL_ADDRESS: process.env.SENDER_EMAIL_ADDRESS || 'onboarding@resend.dev',
    }
  );

  const mcpClients = [emailSenderClient];
  const tools = await getOllamaTools(mcpClients);

  if (DEBUG) {
    console.log('🔧 MCP Tools loaded:', tools.map(t => t.function.name).join(', '));
  }

  const conversationHistory: OllamaMessage[] = [
    {
      role: 'system',
      content:
        `You are an intelligent and helpful personal assistant called Assistant.
        Chat naturally about any topic. Answer questions, clarify doubts, be friendly and polite.

        You have access to special tools:

        - send-email: send emails via Resend

        Use the tools when the user asks for something related to emails.

        IMPORTANT: When the user asks to send an email, use the email address: rubensdrk@gmail.com

        EMAIL SENDING INSTRUCTIONS:
        When sending emails, you MUST:
        The sign Name is always "Rubens Shoji"
        Replace [Your Name] with "Rubens Shoji"
        1. Generate an appropriate subject line based on the content
        2. Improve and enhance the message content to make it more professional and clear
        3. Create a beautiful HTML layout that matches the subject and content
        4. Use proper HTML structure with styling, headers, paragraphs, and formatting
        5. Make the email visually appealing with colors, spacing, and typography
        6. Adapt the HTML design style to match the email's purpose (formal, casual, celebratory, etc.)`,
    },
  ];

  await startServer(ollama, mcpClients, conversationHistory, tools);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n🧑 You: ',
  });

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║      🤖 Personal Assistant with Ollama + MCP        ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
  console.log('Type your messages (ctrl+c to exit)\n');

  rl.prompt();

  rl.on('line', async (input: string) => {
    const userInput = input.trim();

    if (!userInput) {
      rl.prompt();
      return;
    }

    try {
      const response = await chatWithTools(
        userInput,
        ollama,
        mcpClients,
        conversationHistory,
        tools
      );

      console.log(`\n🤖 Assistant: ${response}`);
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('\n\n👋 Goodbye!');
    for (const client of mcpClients) {
      await client.close();
    }
    process.exit(0);
  });
}

main().catch(console.error);