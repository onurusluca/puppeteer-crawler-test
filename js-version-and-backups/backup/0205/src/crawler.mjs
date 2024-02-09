export const crawlPage = async (
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
) => {
  if (visitedUrls.has(url) || depth > maxDepth || url.endsWith(".rss")) {
    /*   if (visitedUrls.has(url)) console.log(`Already visited: ${url}`);
    else console.log(`Reached max depth at: ${url}`);
 */
    return [];
  }

  console.log(`Crawling: ${url} at depth ${depth}`);
  visitedUrls.add(url);
  crawledUrlsCount.count++; // Increment the count of crawled URLs

  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 }); // Set a reasonable viewport size before taking a screenshot

    // page.setDefaultNavigationTimeout(0);

    // Setup for emulation, request interception, and navigation with enhanced error handling
    await setupPage(page, takeScreenshot, colorScheme, url);

    // Navigate to the page
    await page.goto(url, { waitUntil: "networkidle2" });

    // If takeScreenshot is true, take a screenshot and upload it

    let screenshotUrl = null;
    if (takeScreenshot) {
      /*  screenshotUrl = await takeAndUploadScreenshot(
        page,
        userId,
        serviceId,
        url
      ); */
    }

    // Extract page data
    const pageData = await extractPageData(page);

    // Include screenshot URL in the page data, if applicable
    if (screenshotUrl) {
      pageData.screenshotUrl = screenshotUrl;
    }

    // Calculate and log the crawl rate
    logTotalCrawledAndCrawlRate(startTime, crawledUrlsCount.count);

    // Recursively crawl child pages, filtering out non-desirable links
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
};

async function setupPage(page, takeScreenshot, colorScheme, url) {
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: colorScheme },
  ]);
  page.setDefaultNavigationTimeout(10000);
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
  try {
    await page.goto(url, { waitUntil: "networkidle2" });
  } catch (error) {
    console.error(`Failed to load ${url}:`, error.message);
  }
}

async function extractPageData(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    text: document.body.innerText,
    links: Array.from(document.querySelectorAll("a")).map((a) => a.href),
  }));
}

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

async function takeAndUploadScreenshot(page, userId, serviceId, url) {
  try {
    const screenshotOptions = { fullPage: true };
    const screenshotBuffer = await page.screenshot(screenshotOptions);
    // Logic to upload screenshot to cloud storage and return the URL...
    return "URL_of_uploaded_screenshot";
  } catch (error) {
    console.error(`Error taking screenshot for ${url}:`, error);
    return ""; // Return an empty string or null if the screenshot couldn't be taken
  }
}
