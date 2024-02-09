import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";
import Typesense from "typesense";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// Setup Typesense client for indexing
/* const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: "localhost",
      port: 8108,
      protocol: "http",
    },
  ],
  apiKey: process.env.TYPESSENSE_API_KEY!,
}); */

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

interface CrawlRequest {
  userId: string;
  serviceId: string;
  startingUrl: string;
  maxDepth: number;
  takeScreenshots: boolean;
  colorScheme: "light" | "dark";
}

interface PageData {
  url: string;
  title: string;
  bodyText: string;
}

const crawledUrls = new Set<string>();
let crawlDepth = 0;

const crawlPage = async (
  url: string,
  depth: number,
  maxDepth: number,
  takeScreenshots: boolean,
  colorScheme: "light" | "dark",
  userId: string,
  serviceId: string
): Promise<PageData[]> => {
  if (depth > maxDepth || crawledUrls.has(url)) {
    return [];
  }

  crawledUrls.add(url);
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  if (colorScheme === "dark") {
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: "dark" },
    ]);
  }

  await page.goto(url, { waitUntil: "networkidle2" });

  if (takeScreenshots) {
    const screenshotPath = `screenshots/${userId}_${serviceId}_${new Date().toISOString()}.png`;
    await page.screenshot({ path: screenshotPath });
  }

  const pageData = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText,
    };
  });

  const links = await page.$$eval("a", (as) => as.map((a) => a.href));
  await browser.close();

  const childPageDataPromises = links
    .filter((link) => link.startsWith("http"))
    .map((link) =>
      crawlPage(
        link,
        depth + 1,
        maxDepth,
        takeScreenshots,
        colorScheme,
        userId,
        serviceId
      )
    );
  const childPagesData = (await Promise.all(childPageDataPromises)).flat();

  return [pageData, ...childPagesData];
};

app.post("/crawl", async (req, res) => {
  const {
    userId,
    serviceId,
    startingUrl,
    maxDepth,
    takeScreenshots,
    colorScheme,
  }: CrawlRequest = req.body;
  crawledUrls.clear();
  crawlDepth = 0;

  try {
    const data = await crawlPage(
      startingUrl,
      0,
      maxDepth,
      takeScreenshots,
      colorScheme,
      userId,
      serviceId
    );
    const outputPath = `output/${userId}_${serviceId}_${new Date().toISOString()}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    res.json({ message: "Crawl completed", outputPath });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error during crawl" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
