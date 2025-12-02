#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GSCAuth } from './auth.js';
import { GSCClient } from './gsc.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/oauth2callback';
const PORT = process.env.PORT || 3000;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env file');
    process.exit(1);
}

const auth = new GSCAuth(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Session management
interface Session {
    id: string;
    server: Server;
    transport: SSEServerTransport;
    gscClient: GSCClient | null;
}

const sessions = new Map<string, Session>();

function createServer(sessionId: string): Server {
    const server = new Server(
        {
            name: 'google-search-console-mcp',
            version: '0.1.0',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: 'list_sites',
                    description: 'List all sites in the Search Console account',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                    },
                },
                {
                    name: 'get_search_analytics',
                    description: 'Query search analytics data',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            siteUrl: {
                                type: 'string',
                                description: 'The URL of the property as defined in Search Console',
                            },
                            startDate: {
                                type: 'string',
                                description: 'Start date in YYYY-MM-DD format',
                            },
                            endDate: {
                                type: 'string',
                                description: 'End date in YYYY-MM-DD format',
                            },
                            dimensions: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    enum: ['date', 'query', 'page', 'country', 'device', 'searchAppearance'],
                                },
                                description: 'Dimensions to group results by',
                            },
                        },
                        required: ['siteUrl', 'startDate', 'endDate'],
                    },
                },
                {
                    name: 'inspect_url',
                    description: 'Inspect a specific URL',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            siteUrl: {
                                type: 'string',
                                description: 'The URL of the property as defined in Search Console',
                            },
                            inspectionUrl: {
                                type: 'string',
                                description: 'The URL to inspect',
                            },
                        },
                        required: ['siteUrl', 'inspectionUrl'],
                    },
                },
            ],
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const session = sessions.get(sessionId);
        if (!session || !session.gscClient) {
            throw new McpError(
                ErrorCode.InternalError,
                `Authentication required. Please visit ${REDIRECT_URI.replace('/oauth2callback', '/auth')}?sessionId=${sessionId} to authenticate.`
            );
        }

        const gscClient = session.gscClient;

        switch (request.params.name) {
            case 'list_sites': {
                try {
                    const sites = await gscClient.listSites();
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(sites, null, 2),
                            },
                        ],
                    };
                } catch (error) {
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Failed to list sites: ${error instanceof Error ? error.stack : error}`
                    );
                }
            }

            case 'get_search_analytics': {
                const { siteUrl, startDate, endDate, dimensions } = request.params.arguments as any;
                try {
                    const rows = await gscClient.getSearchAnalytics(
                        siteUrl,
                        startDate,
                        endDate,
                        dimensions || ['date']
                    );
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(rows, null, 2),
                            },
                        ],
                    };
                } catch (error) {
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Failed to get search analytics: ${error instanceof Error ? error.stack : error}`
                    );
                }
            }

            case 'inspect_url': {
                const { siteUrl, inspectionUrl } = request.params.arguments as any;
                try {
                    const result = await gscClient.inspectUrl(siteUrl, inspectionUrl);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                } catch (error) {
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Failed to inspect URL: ${error instanceof Error ? error.stack : error}`
                    );
                }
            }

            default:
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Unknown tool: ${request.params.name}`
                );
        }
    });

    return server;
}

const app = express();
app.use(cors());

app.get('/sse', async (req, res) => {
    const sessionId = uuidv4();
    console.log(`New connection: ${sessionId}`);

    const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res);
    const server = createServer(sessionId);

    sessions.set(sessionId, {
        id: sessionId,
        server,
        transport,
        gscClient: null
    });

    // Clean up on close
    res.on('close', () => {
        console.log(`Connection closed: ${sessionId}`);
        sessions.delete(sessionId);
    });

    await server.connect(transport);
});

app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const session = sessions.get(sessionId);

    if (session) {
        await session.transport.handlePostMessage(req, res);
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code as string;
    const state = req.query.state as string; // sessionId

    if (code && state) {
        try {
            const oAuthClient = await auth.handleCallback(code);
            const session = sessions.get(state);

            if (session) {
                session.gscClient = new GSCClient(oAuthClient);
                res.send('Authentication successful! You can now close this window and use the MCP server.');
            } else {
                res.status(404).send('Session expired or not found. Please try connecting again.');
            }
        } catch (error) {
            console.error('Error during OAuth callback:', error);
            res.status(500).send('Authentication failed.');
        }
    } else {
        res.status(400).send('Missing code or state.');
    }
});

app.get('/auth', (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
        res.status(400).send('Missing sessionId parameter');
        return;
    }
    res.redirect(auth.getAuthUrl(sessionId));
});

app.get('/', (req, res) => {
    res.send(`
    <h1>Google Search Console MCP Server</h1>
    <p>Status: <strong>Running</strong></p>
    <p>MCP Endpoint: <code>/sse</code></p>
    <p><em>Authentication is handled per-connection. Connect your MCP client to start.</em></p>
  `);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Redirect URI: ${REDIRECT_URI}`);
});
