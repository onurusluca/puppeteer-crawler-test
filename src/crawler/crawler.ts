import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { promises as fs } from 'fs';
import { performance } from 'perf_hooks';
import logger from '../utils/logger';
import { CrawlRequestParams, CrawlResult } from './interfaces/index';

const CONCURRENCY_LIMIT = 4;

async function crawlPage(
  browser: Browser,
  url: string,
  depth: number,
  maxDepth: number,
  visitedUrls: Set<string>,
  crawlRequestParams: CrawlRequestParams,
  results: CrawlResult,
  crawlStart: number,
) {
  if (depth > maxDepth || visitedUrls.has(url)) {
    logger.info(`Skipping ${url} at depth ${depth}` + (visitedUrls.has(url) ? ' (already visitedUrls)' : 'max depth reached'));
    return;
  }
  visitedUrls.add(url);

  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 720 });

  page.setDefaultNavigationTimeout(10000);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!takeScreenshot && ['stylesheet', 'image', 'font'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
  } catch (error) {
    console.error(`Failed to load ${url}:`, error.message);
  }

  if (crawlRequestParams.colorScheme === 'dark') {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

    logger.info('Emulating dark color scheme');
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' }); // or 'domcontentloaded' or 'networkidle2'
  await page.waitForNavigation();

  const pageTitle = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText);

  results.pageData.push({ url, title: pageTitle, bodyText });

  // Take a screenshot if requested
  if (crawlRequestParams.takeScreenshot) {
    // logger.info(`Taking screenshot of ${url}`);
    await takeScreenshot(page, crawlRequestParams.userId, crawlRequestParams.serviceId, pageTitle, crawlRequestParams.colorScheme);
  }

  // Extract all links from the page
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .map((a) => a.href)
      .filter((href) => href.startsWith('http')),
  );

  const currentTime = performance.now();
  const elapsedSeconds = (currentTime - crawlStart) / 1000;
  const crawledCount = visitedUrls.size;
  const rate = crawledCount / elapsedSeconds;
  logger.info(`Crawled ${crawledCount} URLs at a rate of ${rate.toFixed(2)} URLs/second`);

  await page.close();

  // Recursively crawl each link
  if (links.length > 0) {
    logger.info(`Crawling ${links.length} links from ${url} at depth ${depth}`);
    await parallelCrawl(links, browser, depth, maxDepth, visitedUrls, crawlRequestParams, results, crawlStart, CONCURRENCY_LIMIT);
  }
}

// Crawl the web starting from the given URL
export async function crawl(crawlRequestParams: CrawlRequestParams) {
  logger.info('Starting crawl:', crawlRequestParams);

  const browser = await puppeteer.launch();
  const visitedUrls = new Set<string>();
  const results: CrawlResult = { pageData: [], screenshots: [] };
  const crawlStart = performance.now();
  let isCrawlingComplete = false;

  try {
    await crawlPage(browser, crawlRequestParams.startUrl, 0, crawlRequestParams.maxDepth, visitedUrls, crawlRequestParams, results, crawlStart);

    // Set the flag to indicate crawling is complete
    isCrawlingComplete = true;
  } catch (error) {
    logger.error('Error during crawling:', error);
  } finally {
    const crawlEnd = performance.now();
    const crawlDuration = crawlEnd - crawlStart; // Duration in milliseconds
    const urlsPerSecond = results.pageData.length / (crawlDuration / 1000); // URLs crawled per second

    // Log the final message here, ensuring it's outside the finally block
    logger.info(`Crawl completed in ${crawlDuration}ms (${urlsPerSecond.toFixed(2)} URLs/s). Crawled ${results.pageData.length} pages.`);

    // After crawling is complete, save the results to a file
    await saveResults(results, crawlRequestParams);

    await browser.close();
  }

  // Add an additional check to log if crawling is complete
  if (isCrawlingComplete) {
    logger.info('Crawling is complete.');
  }
}

/*******************************
 * HELPER FUNCTIONS
 *******************************/

// Helper function to limit concurrency
async function parallelCrawl(
  pagesToCrawl: string[],
  browser: Browser,
  depth: number,
  maxDepth: number,
  visitedUrls: Set<string>,
  crawlRequestParams: CrawlRequestParams,
  results: CrawlResult,
  crawlStart: number,
  concurrencyLimit: number,
) {
  const promises = [];
  // const semaphore = new Array(concurrencyLimit).fill(null);

  for (const url of pagesToCrawl) {
    const execPromise = (async (url) => {
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname !== new URL(crawlRequestParams.startUrl).hostname) return; // Stay within the same domain
        if (!visitedUrls.has(url)) {
          await crawlPage(browser, url, depth + 1, maxDepth, visitedUrls, crawlRequestParams, results, crawlStart);
        }
      } catch (error) {
        logger.info(`Error crawling ${url}:`, error);
      }
    })(url);

    const nextPromise = (async () => {
      await execPromise;
    })();

    promises.push(nextPromise);

    if (promises.length >= concurrencyLimit) {
      await Promise.race(promises);
      promises.splice(promises.indexOf(nextPromise), 1); // Remove settled promise
    }
  }

  await Promise.all(promises); // Wait for all remaining promises to settle
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');

const sanitizeFilename = (name: string) => {
  // Replace non-alphanumeric characters with a single underscore
  let safeName = name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  // Trim leading and trailing underscores
  safeName = safeName.replace(/^_+|_+$/g, '');
  return safeName;
};

const ensureDirExists = async (path: string) => {
  try {
    await fs.access(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(path, { recursive: true });
    } else {
      throw error;
    }
  }
};

const takeScreenshot = async (page: Page, userId: string, serviceId: string, pageTitle: string, colorScheme: string) => {
  const screenshotsDir = `screenshots`;
  await ensureDirExists(screenshotsDir);

  const sanitizedTitle = sanitizeFilename(pageTitle);
  const date = formatDate(new Date());
  const filename = `${sanitizedTitle}-${date}-${userId}-${serviceId}-${colorScheme}.png`;

  await page.screenshot({ fullPage: true, path: `${screenshotsDir}/${filename}` });

  logger.info(`Took screenshot: ${filename}`);
};

const saveResults = async (results: CrawlResult, crawlRequestParams: CrawlRequestParams) => {
  const outputDir = `output`;
  await ensureDirExists(outputDir);
  const outputPath = `${outputDir}/${crawlRequestParams.userId}-${crawlRequestParams.serviceId}-crawl-results.json`;
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

  logger.info(`Saved results to: ${outputPath}`);
};
