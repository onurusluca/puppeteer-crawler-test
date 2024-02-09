<h1 align="center">Puppeteer Scraper with Nodejs, Express Typescript server</h1>

<p align="center">
  <b>Crawl any website using puppeteer concurrently & serve the data using a server app with nodejs, express & typescript</b>
  </b>

</p>

<br>

## What can it do?

- Crawl a whole website or a specific page
- Save the data in a JSON file
- Save screenshots of the website
- Serve the data using a server app with nodejs, express & typescript

## How to use?

- Clone the repository
- Run `npm install` to install the dependencies
- Run `npm start` to start the server
- Edit `src/crawler/crawler.ts/` to change the crawler settings to your needs
- Make a POST request to `http://localhost:3000/crawl`. Example request with curl:

```curl
curl -X POST -H "Content-Type: application/json" -d '{
  "userId": "yourUserId",
  "serviceId": "yourServiceId",
  "startUrl": "https://typesense.org/docs/",
  "maxDepth": 3,
  "takeScreenshot": true,
  "colorScheme": "light"
}' http://localhost:3000/start-crawl
```

- Profit!
