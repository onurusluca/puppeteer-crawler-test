import puppeteer from "puppeteer";

const crawlPage = async (
  browser,
  url,
  depth,
  maxDepth,
  takeScreenshot,
  colorScheme,
  visitedUrls,
  startTime,
  crawledCurrentCount,
  startUrl
) => {
  if (visitedUrls.has(url) || depth > maxDepth) {
    if (visitedUrls.has(url)) console.log(`Already visited: ${url}`);
    else console.log(`Reached max depth at: ${url}`);
    return [];
  }

  console.log(`Crawling: ${url} at depth ${depth}`);
  visitedUrls.add(url);
  crawledCurrentCount++;

  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: colorScheme },
  ]);

  await page.setRequestInterception(true);
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

  /*   const screenshotPath = takeScreenshot
    ? `screenshots/${encodeURIComponent(url)
        .replace(/%/g, "_")
        .substring(0, 100)}_${new Date()
        .toISOString()
        .replace(/[:/]/g, "-")
        .replace(/ /g, "_")}_${colorScheme}_${depth}.png`
    : "";
  if (takeScreenshot) await page.screenshot({ path: screenshotPath });
 */
  const pageData = await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    text: document.body.innerText,
    links: Array.from(document.querySelectorAll("a")).map((a) => a.href),
  }));

  await page.close();

  const dataForIndexingAndSaving = {
    url: pageData.url,
    title: pageData.title,
    text: pageData.text,
    // screenshot: screenshotPath,
  };

  // TODO: feed the data to Typesense
  // await indexPageData(dataForIndexingAndSaving);

  const elapsedTime = (Date.now() - startTime) / 1000;
  const rate = crawledCurrentCount / elapsedTime;
  console.log(
    `Crawled ${crawledCurrentCount} URLs at a rate of ${rate.toFixed(
      2
    )} URLs/second`
  );

  const childPagesData = [];
  for (const link of pageData.links.filter(
    (link) =>
      link.startsWith(startUrl) &&
      !link.match(/\.(css|js|png|jpg|jpeg|gif|svg)$/)
  )) {
    childPagesData.push(
      ...(await crawlPage(
        browser,
        link,
        depth + 1,
        maxDepth,
        takeScreenshot,
        colorScheme,
        visitedUrls,
        startTime,
        crawledCurrentCount,
        startUrl
      ))
    );
  }

  return [
    { ...dataForIndexingAndSaving, links: pageData.links },
    ...childPagesData,
  ];
};

// Main function to start crawling
const startCrawling = async (
  userId,
  serviceId,
  startUrl,
  maxDepth,
  takeScreenshot,
  colorScheme
) => {
  const visitedUrls = new Set();
  let crawledCurrentCount = 0;
  const startTime = Date.now();

  try {
    console.log(`Launching browser for user ${userId}, service ${serviceId}`);
    const browser = await puppeteer.launch();
    const crawledData = await crawlPage(
      browser,
      startUrl,
      0,
      maxDepth,
      takeScreenshot,
      colorScheme,
      visitedUrls,
      startTime,
      crawledCurrentCount,
      startUrl
    );

    // TODO: feed the data to Typesense

    await browser.close();
    console.log(
      `Crawl completed for user ${userId}, service ${serviceId}. Crawled ${visitedUrls.size} URLs in total`
    );
  } catch (error) {
    console.error("Crawling failed:", error);
  }
};

export { startCrawling };
