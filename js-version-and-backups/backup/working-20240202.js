import puppeteer from "puppeteer";
import fs from "fs/promises";

import { indexPageData } from "../feed.js";

// Configuration options
const config = {
  startUrl: "https://www.example.com/", // URL to start crawling from
  maxDepth: 10, // Maximum depth of sub-routes to crawl
};

// Keep track of visited URLs and crawling metrics
const takeScreenshot = true;
const colorScheme = "light"; // "light" or "dark"
const visitedUrls = new Set();
let crawledCurrentCount = 0;
const startTime = Date.now();
// const shouldCrawlWholeSite = false;

// Launch browser once and reuse the instance
let browser;

// Function to crawl a page
const crawlPage = async (url, depth = 0) => {
  // Skip if already visited or if max depth reached
  if (visitedUrls.has(url) || depth > config.maxDepth) {
    if (visitedUrls.has(url)) console.log(`Already visited: ${url}`);
    else console.log(`Reached max depth at: ${url}`);
    return [];
  }

  console.log(`Crawling: ${url} at depth ${depth}`);
  visitedUrls.add(url);
  crawledCurrentCount++;

  const page = await browser.newPage();

  // Emulate color scheme (light or dark mode)
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: colorScheme },
  ]);

  // Block stylesheets, images, and fonts for faster loading
  await page.setRequestInterception(true);

  // Only allow stylesheets, images, and fonts if taking a screenshot of the page (for visual diffing)
  page.on("request", (req) => {
    if (
      !takeScreenshot &&
      ["stylesheet", "image", "font"].includes(req.resourceType())
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto(url, { waitUntil: "networkidle2" });

  // Take a screenshot of the page
  const formattedUrl = encodeURIComponent(url)
    .replace(/%/g, "_") // Replace percent-encoded characters with underscore
    .substring(0, 100); // Limit the length to 100 characters

  const formattedDate = new Date()
    .toLocaleString()
    .replace(/[:/]/g, "-")
    .replace(/ /g, "_");

  const screenshotFileName = `${formattedUrl}_${formattedDate}_${colorScheme}_${depth}.png`;
  const screenshotPath = `screenshots/${screenshotFileName}`;

  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved: ${screenshotPath}`);

  console.log(`Evaluating page: ${url}`);

  // Extract data from the page
  const pageData = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      text: document.body.innerText,
      links: Array.from(document.querySelectorAll("a")).map((a) => a.href),
    };
  });

  await page.close();

  // Prepare data for indexing and saving (excluding links)
  const dataForIndexingAndSaving = {
    url: pageData.url,
    title: pageData.title,
    text: pageData.text,
    screenshot: screenshotFileName,
  };

  // Index data and append it to JSON file
  await indexPageData(dataForIndexingAndSaving);

  // Log crawling rate
  const elapsedTime = (Date.now() - startTime) / 1000; // seconds
  const rate = crawledCurrentCount / elapsedTime;
  console.log(
    `Crawled ${crawledCurrentCount} URLs at a rate of ${rate.toFixed(
      2
    )} URLs/second`
  );

  // Recursive crawling
  const childPagesData = [];
  for (const link of pageData.links.filter(
    (link) =>
      link.startsWith(config.startUrl) &&
      !link.match(/\.(css|js|png|jpg|jpeg|gif|svg)$/)
  )) {
    childPagesData.push(...(await crawlPage(link, depth + 1)));
  }

  // Return data for this page and all child pages
  const { links, ...dataWithoutLinks } = pageData;
  return [{ ...dataWithoutLinks }, ...childPagesData];
};

// Function to append data to a JSON file
const appendToJsonFile = async (data) => {
  console.log(`Appending data to the JSON file`);
  await fs.writeFile("output.json", JSON.stringify(data, null, 2));
  console.log(`Data appended to the JSON file`);
};

// Main function to start crawling
const main = async () => {
  try {
    // If no screenshots folder exists, create one
    try {
      await fs.mkdir("screenshots");
    } catch (error) {
      // Ignore the error if the folder already exists
      if (error.code !== "EEXIST") {
        throw error;
      }
    }

    console.log(`Launching browser`);
    browser = await puppeteer.launch({ headless: "new" });

    console.log(`Starting crawl at ${config.startUrl}`);
    const crawledData = await crawlPage(config.startUrl);

    console.log(`Writing crawled data to JSON file`);
    await appendToJsonFile(crawledData);

    await browser.close();
    console.log(`Crawl completed and browser closed`);
    console.log(`Crawled ${visitedUrls.size} URLs in total`);
  } catch (error) {
    console.error("Crawling failed:", error);
  }
};

main();
