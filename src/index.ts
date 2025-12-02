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
let gscClient: GSCClient | null = null;

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
                        dimensionFilterGroups: {
                            type: 'array',
                            description: 'Filters for the query. See Google Search Console API docs for structure.',
                            items: {
                                type: 'object',
                            }
                        }
                    },
                    required: ['siteUrl', 'startDate', 'endDate'],
                },
            },
            {
                name: 'get_top_queries',
                description: 'Get top performing queries for a site',
                inputSchema: {
                    type: 'object',
                    properties: {
                        siteUrl: {
                            type: 'string',
                            description: 'The URL of the property',
                        },
                        startDate: {
                            type: 'string',
                            description: 'Start date (YYYY-MM-DD)',
                        },
                        endDate: {
                            type: 'string',
                            description: 'End date (YYYY-MM-DD)',
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of queries to return (default 10)',
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
            {
                name: 'get_sitemaps',
                description: 'List sitemaps for a site',
                inputSchema: {
                    type: 'object',
                    properties: {
                        siteUrl: {
                            type: 'string',
                            description: 'The URL of the property as defined in Search Console',
                        },
                    },
                    required: ['siteUrl'],
                },
            },
            {
                name: 'submit_sitemap',
                description: 'Submit a sitemap for a site',
                inputSchema: {
                    type: 'object',
                    properties: {
                        siteUrl: {
                            type: 'string',
                            description: 'The URL of the property as defined in Search Console',
                        },
                        feedpath: {
                            type: 'string',
                            description: 'The URL of the sitemap to submit',
                        },
                    },
                    required: ['siteUrl', 'feedpath'],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!gscClient) {
        const oAuthClient = await auth.getClient();
        if (oAuthClient) {
            gscClient = new GSCClient(oAuthClient);
        } else {
            throw new McpError(
                ErrorCode.InternalError,
                `Authentication required. Please visit ${REDIRECT_URI.replace('/oauth2callback', '/auth')} to authenticate.`
            );
        }
    }

    switch (request.params.name) {
        case 'list_sites': {
            try {
                const sites = await gscClient!.listSites();
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
            const { siteUrl, startDate, endDate, dimensions, dimensionFilterGroups } = request.params.arguments as any;
            try {
                const rows = await gscClient!.getSearchAnalytics(
                    siteUrl,
                    startDate,
                    endDate,
                    dimensions || ['date'],
                    dimensionFilterGroups
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

        case 'get_top_queries': {
            const { siteUrl, startDate, endDate, limit } = request.params.arguments as any;
            try {
                const rows = await gscClient!.getTopQueries(
                    siteUrl,
                    startDate,
                    endDate,
                    limit
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
                    `Failed to get top queries: ${error instanceof Error ? error.stack : error}`
                );
            }
        }

        case 'inspect_url': {
            const { siteUrl, inspectionUrl } = request.params.arguments as any;
            try {
                const result = await gscClient!.inspectUrl(siteUrl, inspectionUrl);
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

        case 'get_sitemaps': {
            const { siteUrl } = request.params.arguments as any;
            try {
                const sitemaps = await gscClient!.listSitemaps(siteUrl);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(sitemaps, null, 2),
                        },
                    ],
                };
            } catch (error) {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Failed to list sitemaps: ${error instanceof Error ? error.stack : error}`
                );
            }
        }

        case 'submit_sitemap': {
            const { siteUrl, feedpath } = request.params.arguments as any;
            try {
                const result = await gscClient!.submitSitemap(siteUrl, feedpath);
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
                    `Failed to submit sitemap: ${error instanceof Error ? error.stack : error}`
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

const app = express();
app.use(cors());

let transport: SSEServerTransport | null = null;

app.get('/sse', async (req, res) => {
    console.log('Received connection');
    transport = new SSEServerTransport('/messages', res);
    await server.connect(transport);
});

app.post('/messages', async (req, res) => {
    console.log('Received message');
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(400).json({ error: 'No active connection' });
    }
});

app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code as string;
    if (code) {
        try {
            const oAuthClient = await auth.handleCallback(code);
            gscClient = new GSCClient(oAuthClient);
            res.send('Authentication successful! You can now close this window and use the MCP server.');
        } catch (error) {
            console.error('Error during OAuth callback:', error);
            res.status(500).send('Authentication failed.');
        }
    } else {
        res.status(400).send('No code provided.');
    }
});

app.get('/auth', (req, res) => {
    res.redirect(auth.getAuthUrl());
});

app.get('/', async (req, res) => {
    const oAuthClient = await auth.getClient();
    const status = oAuthClient ? 'Authenticated' : 'Not Authenticated';
    const authLink = oAuthClient ? '' : '<p><a href="/auth">Click here to Authenticate</a></p>';
    res.send(`
    <h1>Google Search Console MCP Server</h1>
    <p>Status: <strong>${status}</strong></p>
    ${authLink}
    <p>MCP Endpoint: <code>/sse</code></p>
  `);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Redirect URI: ${REDIRECT_URI}`);
});
