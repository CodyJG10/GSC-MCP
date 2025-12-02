import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

export class GSCAuth {
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    createClient(): OAuth2Client {
        return new google.auth.OAuth2(
            this.clientId,
            this.clientSecret,
            this.redirectUri
        );
    }

    getAuthUrl(state: string): string {
        const client = this.createClient();
        return client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            state: state, // Pass session ID as state
        });
    }

    async handleCallback(code: string): Promise<OAuth2Client> {
        const client = this.createClient();
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        return client;
    }
}
