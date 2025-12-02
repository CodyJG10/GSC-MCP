import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env file');
    process.exit(1);
}

async function testAuth() {
    console.log('Initializing OAuth2 client...');
    try {
        const oAuth2Client = new google.auth.OAuth2(
            CLIENT_ID,
            CLIENT_SECRET,
            'http://localhost:3000/oauth2callback'
        );

        console.log('Generating Auth URL...');
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/webmasters.readonly'],
        });

        console.log('Success! Auth URL generated:');
        console.log(authUrl);
    } catch (error) {
        console.error('Error generating Auth URL:', error);
    }
}

testAuth();
