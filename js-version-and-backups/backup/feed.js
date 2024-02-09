import Typesense from "typesense";

// Initialize Typesense client
const client = new Typesense.Client({
  nodes: [{ host: "localhost", port: 8108, protocol: "http" }],
  apiKey: "Hu52dwsas2AdxdE",
  connectionTimeoutSeconds: 2,
});

// Typesense collection schema
const schema = {
  name: "webpages",
  fields: [
    { name: "url", type: "string" },
    { name: "title", type: "string" },
    { name: "text", type: "string" },
    { name: "screenshot", type: "string" },
  ],
};

// Function to initialize the Typesense collection
async function initializeCollection() {
  try {
    // Delete collection if it already exists
    await deleteCollection("webpages");

    console.log("Creating collection...");
    await client.collections().create(schema);
    console.log("Collection created");
  } catch (error) {
    if (error.code === "collection_already_exists") {
      console.log("Collection already exists");
    } else {
      console.error("Error creating collection:", error);
      throw error; // Rethrow error to prevent further execution if collection creation fails
    }
  }
}

// Function to index page data into Typesense
export async function indexPageData(pageData) {
  try {
    await client.collections("webpages").documents().upsert(pageData);
    console.log(`Indexed page: ${pageData.url}`);
  } catch (error) {
    console.error("Error indexing page data:", error);
  }
}

async function deleteCollection(collectionName) {
  try {
    console.log(`Deleting collection: ${collectionName}...`);
    await client.collections(collectionName).delete();
    console.log(`Collection ${collectionName} deleted successfully`);
  } catch (error) {
    console.error(`Error deleting collection ${collectionName}:`, error);
  }
}

// Initialize the Typesense collection before starting any indexing
initializeCollection()
  .then(() => {
    console.log("Typesense is ready for indexing");

    // Example page data to index (this should come from your crawler)
    const examplePageData = {
      url: "http://example.com",
      title: "Example Title",
      text: "Example text content of the page",
      screenshot: "example.png",
    };

    // Index example data (replace this part with your actual data indexing logic)
    indexPageData(examplePageData)
      .then(() => {
        console.log("Data indexing complete");
      })
      .catch((error) => {
        console.error("Data indexing failed:", error);
      });
  })
  .catch((error) => {
    console.error("Failed to initialize Typesense:", error);
  });
