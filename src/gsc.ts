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
        dimensions: string[],
        dimensionFilterGroups?: searchconsole_v1.Schema$ApiDimensionFilterGroup[]
    ) {
        const res = await this.searchConsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate,
                endDate,
                dimensions,
                dimensionFilterGroups,
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

    async listSitemaps(siteUrl: string) {
        const res = await this.searchConsole.sitemaps.list({
            siteUrl,
        });
        return res.data.sitemap || [];
    }

    async submitSitemap(siteUrl: string, feedpath: string) {
        await this.searchConsole.sitemaps.submit({
            siteUrl,
            feedpath,
        });
        return { success: true, message: `Sitemap submitted: ${feedpath}` };
    }

    async getTopQueries(siteUrl: string, startDate: string, endDate: string, limit: number = 10) {
        const res = await this.searchConsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate,
                endDate,
                dimensions: ['query'],
                rowLimit: limit,
            },
        });
        return res.data.rows || [];
    }
}
