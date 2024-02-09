import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";
import Typesense from "typesense";
import fs from "fs/promises";

// Setup Typesense client for indexing
const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: "localhost",
      port: "8108",
      protocol: "http",
    },
  ],
  apiKey: process.env.TYPESSENSE_API_KEY,
});

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

/******************************************
 * CRAWL ENDPOINTS
 ******************************************/
app.post("/start-crawl", async (req, res) => {
  const { userId, serviceId, startUrl, maxDepth, takeScreenshot, colorScheme } =
    req.body;

  if (!userId || !serviceId || !startUrl) {
    return res.status(400).send("Missing required parameters.");
  }

  res.status(202).json({
    message: "Crawl started successfully.",
    userId,
    serviceId,
  });

  crawlInBackground(
    userId,
    serviceId,
    startUrl,
    maxDepth,
    takeScreenshot,
    colorScheme
  ).catch((error) =>
    console.error("Crawling process encountered an error:", error)
  );
});

/******************************************
 * CRAWL LOGIC
 ******************************************/

// Handles crawling logic in the background
async function crawlInBackground(
  userId,
  serviceId,
  startUrl,
  maxDepth,
  takeScreenshot,
  colorScheme
) {
  const visitedUrls = new Set();
  const startTime = Date.now();

  console.log(`Launching browser for user ${userId}, service ${serviceId}`);
  const browser = await puppeteer.launch({ headless: "new" });
  const crawledData = await crawlPage(
    userId,
    serviceId,
    browser,
    startUrl,
    0,
    maxDepth,
    takeScreenshot,
    colorScheme,
    visitedUrls,
    startTime
  );

  // Close the browser after crawling is complete
  await browser.close();

  const endTime = Date.now();
  const crawlDuration = (endTime - startTime) / 1000;

  console.log(
    `Crawl completed in ${crawlDuration} seconds. Crawled ${visitedUrls.size} URLs in total.`
  );

  await indexCrawledData(crawledData, userId, serviceId);
}

// Main crawling function, recursively crawls pages
async function crawlPage(
  userId,
  serviceId,
  browser,
  url,
  depth,
  maxDepth,
  takeScreenshot,
  colorScheme,
  visitedUrls,
  startTime,
  startUrl,
  crawledUrlsCount = { count: 0 } // Use an object to maintain a reference count across recursive calls
) {
  if (visitedUrls.has(url) || depth > maxDepth) return [];

  console.log(`Crawling: ${url} at depth ${depth}`);

  visitedUrls.add(url);
  crawledUrlsCount.count++;

  let pageData = [];
  let page;
  try {
    page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 720 });

    // page.setDefaultNavigationTimeout(0);

    await setupPage(page, takeScreenshot, colorScheme);

    await page.goto(url, { waitUntil: "networkidle2" });

    const data = await extractPageData(
      page,
      userId,
      serviceId,
      takeScreenshot,
      url
    );

    pageData.push(data);

    logTotalCrawledAndCrawlRate(startTime, crawledUrlsCount.count);

    const childPagesData = await crawlChildPages(
      userId,
      serviceId,
      pageData.links,
      browser,
      depth,
      maxDepth,
      takeScreenshot,
      colorScheme,
      visitedUrls,
      startTime,
      startUrl,
      crawledUrlsCount
    );

    //  appendToJsonFile(data);

    // console.log(`Crawled ${crawledUrlsCount.count} URLs`);
    return [
      {
        url: pageData.url,
        title: pageData.title,
        text: pageData.text,
        screenshotUrl: pageData.screenshotUrl,
        //  links: pageData.links,
      },
      ...childPagesData,
    ];
  } catch (error) {
    console.error(`Error crawling ${url}:`, error);
    return [];
  } finally {
    if (page && !page.isClosed()) await page.close();
  }
}

async function crawlChildPages(
  userId,
  serviceId,
  links,
  browser,
  depth,
  maxDepth,
  takeScreenshot,
  colorScheme,
  visitedUrls,
  startTime,
  startUrl,
  crawledUrlsCount
) {
  const childPagesDataPromises = links
    .filter(
      (link) =>
        link.startsWith(startUrl) &&
        !link.match(/\.(css|js|png|jpg|jpeg|gif|svg|rss)$/)
    )
    .map((link) =>
      crawlPage(
        userId,
        serviceId,
        browser,
        link,
        depth + 1,
        maxDepth,
        takeScreenshot,
        colorScheme,
        visitedUrls,
        startTime,
        startUrl,
        crawledUrlsCount
      )
    );
  return (await Promise.all(childPagesDataPromises)).flat();
}

// Sets up page based on requirements
async function setupPage(page, takeScreenshot, colorScheme) {
  // Enable request interception to manage or modify network requests
  await page.setRequestInterception(true);

  if (colorScheme) {
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: colorScheme },
    ]);
  }
  page.on("request", (req) => {
    if (
      !takeScreenshot &&
      ["stylesheet", "image", "font"].includes(req.resourceType())
    )
      req.abort();
    else req.continue();
  });
}

// Extracts data from a page
async function extractPageData(page, userId, serviceId, takeScreenshot, url) {
  const title = await page.title();
  const text = await page.evaluate(() => document.body.innerText);
  let screenshotUrl = null;
  if (takeScreenshot)
    screenshotUrl = await takeScreenshotOfPage(page, userId, serviceId, url);

  return { userId, serviceId, url, title, text, screenshotUrl };
}

// Takes a screenshot of the current page
async function takeScreenshotOfPage(page, userId, serviceId, url) {
  // Create a directory for screenshots if it doesn't exist
  const screenshotsDir = `./screenshots/${userId}/${serviceId}`;
  await fs.mkdir(screenshotsDir, { recursive: true });

  // Generate a filename based on the URL or any unique identifier
  const filename = `${new Date().getTime()}.png`;
  const filePath = `${screenshotsDir}/${filename}`;

  await page.screenshot({ path: filePath, fullPage: false });

  // Here, instead of returning the local file path, you would upload the file
  // to your preferred cloud storage and return the URL after upload.
  // For simplicity, this example returns the local file path.
  return filePath;
}

/******************************************
 * INDEXING LOGIC
 ******************************************/
// Indexes crawled data into Typesense
async function indexCrawledData(crawledData, userId, serviceId) {
  await initializeTypesenseCollection();
  for (const data of crawledData) {
    await feedDataToTypesense(data);
  }
  console.log("Indexing completed.");
}

// Initializes the Typesense collection
async function initializeTypesenseCollection() {
  try {
    await typesenseClient.collections("webpages").delete();
  } catch (error) {
    console.log("Collection does not exist or error deleting:", error.message);
  }
  return typesenseClient.collections().create({
    name: "webpages",
    fields: [
      { name: "userId", type: "string" },
      { name: "serviceId", type: "string" },
      { name: "url", type: "string" },
      { name: "title", type: "string" },
      { name: "text", type: "string" },
      { name: "screenshotUrl", type: "string", optional: true },
    ],
  });
}

// Feeds data into the Typesense collection
async function feedDataToTypesense(data) {
  try {
    await typesenseClient.collections("webpages").documents().upsert(data);
  } catch (error) {
    console.error("Error indexing data:", error);
  }
}

const appendToJsonFile = async (dataObject) => {
  let fileContent;
  const filePath = "output.json";

  // Check if the file exists and has content; if not, initialize it with an empty array
  try {
    fileContent = await fs.readFile(filePath, { encoding: "utf8" });
    // Check if file is empty and initialize it with an empty array JSON string if true
    if (fileContent.trim().length === 0) {
      console.log("JSON file is empty, initializing with an empty array.");
      fileContent = "[]";
    }
  } catch (error) {
    // If file does not exist, initialize content with an empty array
    if (error.code === "ENOENT") {
      console.log(`File not found. Creating ${filePath} with initial content.`);
      fileContent = "[]";
    } else {
      throw error; // Rethrow unexpected errors
    }
  }

  // Parse the existing data, append new data, and write back to file
  try {
    const existingData = JSON.parse(fileContent);
    const newData = { ...dataObject };
    existingData.push(newData);
    await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
    console.log(`Data appended to ${filePath}`);
  } catch (parseError) {
    console.error("Error parsing JSON from file:", parseError);
    // Handle JSON parsing error, potentially initializing the file again or logging the error
  }
};

let lastLoggedCount = 0;
function logTotalCrawledAndCrawlRate(startTime, crawledCount) {
  if (crawledCount > lastLoggedCount) {
    // Only log if there's been progress
    const elapsedTime = (Date.now() - startTime) / 1000; // Time elapsed in seconds
    const rate = crawledCount / elapsedTime;
    console.log(
      `Crawled ${crawledCount} URLs at a rate of ${rate.toFixed(2)} URLs/second`
    );
    lastLoggedCount = crawledCount; // Update last logged count for next comparison
  }
}

app.listen(port, () => console.log(`Server is running on port ${port}`));
