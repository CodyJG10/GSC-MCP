import { google, searchconsole_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class GSCClient {
    private searchConsole: searchconsole_v1.Searchconsole;

    constructor(auth: OAuth2Client) {
        this.searchConsole = google.searchconsole({ version: 'v1', auth });
    }

    async listSites() {
        const res = await this.searchConsole.sites.list();
        return res.data.siteEntry || [];
    }

    async getSearchAnalytics(
        siteUrl: string,
        startDate: string,
        endDate: string,
        dimensions: string[]
    ) {
        const res = await this.searchConsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate,
                endDate,
                dimensions,
            },
        });
        return res.data.rows || [];
    }

    async inspectUrl(siteUrl: string, inspectionUrl: string) {
        const res = await this.searchConsole.urlInspection.index.inspect({
            requestBody: {
                siteUrl,
                inspectionUrl,
            },
        });
        return res.data;
    }
}
