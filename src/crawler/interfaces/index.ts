import type { Browser } from 'puppeteer';

export interface CrawlRequestParams {
  userId: string;
  serviceId: string;
  startUrl: string;
  maxDepth: number;
  takeScreenshot: boolean;
  colorScheme: 'light' | 'dark';
}
interface PageData {
  url: string;
  title: string;
  bodyText: string;
}

export interface CrawlResult {
  pageData: PageData[];
  screenshots: string[];
}
