import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post("/crawl", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).send({ error: "URL is required" });
  }

  try {
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(url);
    const content = await page.content();
    console.log(content);
    await browser.close();

    res.status(200).send({ message: "Crawl successful", content: content });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Error during crawl" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
