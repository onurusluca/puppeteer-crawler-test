import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";
import fs from "fs/promises";
import { crawlPage } from "./crawler.mjs";
import { initializeCollection, feedDataToIndexer } from "./feedToIndexer.mjs";

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

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
  ).catch((error) => {
    console.error("Crawling process encountered an error:", error);
    // TODO: Implement any notification logic here, if necessary
  });
});

async function crawlInBackground(
  userId,
  serviceId,
  startUrl,
  maxDepth,
  takeScreenshot,
  colorScheme
) {
  try {
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

    await browser.close();

    const endTime = Date.now();
    const crawlDuration = (endTime - startTime) / 1000; // Duration in seconds

    console.log(
      `Crawl completed in ${crawlDuration} seconds. Crawled ${visitedUrls.size} URLs in total.`
    );

    await initializeCollection();

    // Feed crawled data to Typesense, and log after all data is indexed
    console.log("Indexing data...");
    for (let data of crawledData) {
      await feedDataToIndexer({
        userId,
        serviceId,
        ...data,
      });
    }

    /*    for (let data of crawledData) {
      console.log("Indexing data:", data.length);
      await feedDataToIndexer({
        userId,
        serviceId,
        ...data,
      });

      for (let item of crawledData) {
        await appendToJsonFile({
          userId: userId,
          serviceId: serviceId,
          ...item, // Spread the individual item properties here
        });
      }
    } */
  } catch (error) {
    console.error("Error during the crawling process:", error);
    throw error; // Re-throw to catch in calling function for additional handling if necessary
  }
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

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
