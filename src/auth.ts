import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const TOKEN_PATH = path.join(DATA_DIR, 'token.json');

export class GSCAuth {
    private oAuth2Client: OAuth2Client;

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        this.oAuth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            redirectUri
        );
    }

    async getClient(): Promise<OAuth2Client | null> {
        if (fs.existsSync(TOKEN_PATH)) {
            console.log('Found token.json, loading credentials...');
            const token = fs.readFileSync(TOKEN_PATH, 'utf8');
            this.oAuth2Client.setCredentials(JSON.parse(token));
            return this.oAuth2Client;
        }
        return null;
    }

    getAuthUrl(): string {
        return this.oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
    }

    async handleCallback(code: string): Promise<OAuth2Client> {
        const { tokens } = await this.oAuth2Client.getToken(code);
        this.oAuth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        return this.oAuth2Client;
    }
}
