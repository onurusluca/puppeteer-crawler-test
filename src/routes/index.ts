import express, { Request, Response } from 'express';
import logger from '../utils/logger';
import { healthCheck } from '../handlers/healthCheck';
import { CrawlRequestParams } from '../crawler/interfaces/index';
import { crawl } from '../crawler/crawler';

const router = express.Router();

router.get('/', healthCheck);

router.post('/start-crawl', async (req: Request, res: Response) => {
  const { userId, serviceId, startUrl, maxDepth, takeScreenshot, colorScheme } = req.body as CrawlRequestParams;

  if (!userId || !serviceId || !startUrl) {
    return res.status(400).send('Missing required parameters.');
  }

  res.status(202).json({
    message: 'Crawl started successfully.',
    userId,
    serviceId,
  });

  crawl({
    userId,
    serviceId,
    startUrl,
    maxDepth,
    takeScreenshot,
    colorScheme,
  }).catch((error) => {
    console.error('Crawling process encountered an error:', error);
  });
});

export default router;

/* 

curl -X POST -H "Content-Type: application/json" -d '{
  "userId": "yourUserId",
  "serviceId": "yourServiceId",
  "startUrl": "https://typesense.org/docs/",
  "maxDepth": 3,
  "takeScreenshot": true,
  "colorScheme": "light"
}' http://localhost:3000/start-crawl

curl -X POST -H "Content-Type: application/json" -d '{
  "userId": "yourUserId",
  "serviceId": "yourServiceId",
  "startUrl": "https://typesense.org/docs/",
}' http://localhost:3000/start-crawl

curl -X POST http://localhost:3000/start-crawl -H "Content-Type: application/json" -d '{\"userId\": \"user123\", \"serviceId\": \"service456\", \"startUrl\": \"https://typesense.org/\"}'

*/
