const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Swap & Save API",
      version: "1.0.0",
      description: "API documentation for Swap & Save - AI Powered Product Exchange Platform",
    },
    servers: [
      {
        url: "http://localhost:5000",
      },
    ],
    tags: [
      {
        name: "Auth",
        description: "Authentication APIs",
      },
      {
        name: "Products",
        description: "Product management APIs",
      },
      {
        name: "Swaps",
        description: "Swap request management APIs",
      },
      {
        name: "Admin",
        description: "Admin APIs",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;