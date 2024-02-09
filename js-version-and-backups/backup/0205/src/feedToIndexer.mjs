import Typesense from "typesense";

// Setup Typesense client
const client = new Typesense.Client({
  nodes: [
    {
      host: "localhost",
      port: "8108",
      protocol: "http",
    },
  ],
  apiKey:
    "OzAGF2Yb0sN04O1fHWv5gKYLcVyx15staiRolcipS34qTCKvNmgCrs2wX6Ux0ERdGNZUIPSynNmUGcPaoZzbXBGhWrtVL25Qwvv3PDgtplVwpGOGCHzdnOwdq7mVQp2D",
  connectionTimeoutSeconds: 2,
});

// Function to initialize the Typesense collection
export async function initializeCollection() {
  try {
    // Attempt to delete the existing collection if it exists
    // TODO: This is not necessary in production, but is useful for development
    await client.collections("webpages").delete();
  } catch (error) {
    console.log("Collection does not exist or error deleting:", error.message);
  }

  // Create the collection
  return client.collections().create({
    name: "webpages",
    fields: [
      { name: "userId", type: "string" },
      { name: "serviceId", type: "string" },
      { name: "url", type: "string" },
      { name: "title", type: "string" },
      { name: "text", type: "string" },
      { name: "screenshot", type: "string", optional: true },
    ],
  });
}

// Function to index page data into Typesense
export async function feedDataToIndexer(data) {
  // Ensure data is in the expected format or throw an error
  if (!data.userId || !data.serviceId || !data.url) {
    throw new Error("Data missing necessary userId, serviceId, or url");
  }

  try {
    const response = await client
      .collections("webpages")
      .documents()
      .upsert(data);
    // console.log("Successfully indexed:", response);
  } catch (error) {
    console.error("Error indexing data:", error);
    throw error; // Rethrow the error for external handling if needed
  }
}
