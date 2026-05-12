const request = require("supertest");

const TRACKED_ENV_KEYS = ["NODE_ENV", "ENABLE_API_DOCS", "JWT_SECRET"];
const originalEnv = {};

const restoreTrackedEnv = () => {
  TRACKED_ENV_KEYS.forEach((key) => {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  });
};

const loadAppForEnv = ({ nodeEnv, enableApiDocs } = {}) => {
  jest.resetModules();

  process.env.NODE_ENV = nodeEnv;
  process.env.JWT_SECRET = "test_jwt_secret";

  if (enableApiDocs === undefined) {
    delete process.env.ENABLE_API_DOCS;
  } else {
    process.env.ENABLE_API_DOCS = enableApiDocs;
  }

  return require("../src/app");
};

beforeAll(() => {
  TRACKED_ENV_KEYS.forEach((key) => {
    originalEnv[key] = process.env[key];
  });
});

afterEach(() => {
  restoreTrackedEnv();
  jest.resetModules();
});

afterAll(() => {
  restoreTrackedEnv();
});

describe("production-only route exposure", () => {
  test("production hides API docs and the demo protected route by default while keeping healthcheck", async () => {
    const app = loadAppForEnv({ nodeEnv: "production" });

    const healthRes = await request(app).get("/health");
    const docsRes = await request(app).get("/api-docs/");
    const protectedRes = await request(app).get("/protected");

    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.body.status).toBe("ok");
    expect(docsRes.statusCode).toBe(404);
    expect(protectedRes.statusCode).toBe(404);
  });

  test("production exposes API docs only when explicitly enabled", async () => {
    const app = loadAppForEnv({ nodeEnv: "production", enableApiDocs: "true" });

    const docsRes = await request(app).get("/api-docs/");
    const protectedRes = await request(app).get("/protected");

    expect(docsRes.statusCode).toBe(200);
    expect(docsRes.text).toContain("Swagger UI");
    expect(protectedRes.statusCode).toBe(404);
  });

  test("test environment keeps API docs and the demo protected route available", async () => {
    const app = loadAppForEnv({ nodeEnv: "test" });

    const docsRes = await request(app).get("/api-docs/");
    const protectedRes = await request(app).get("/protected");

    expect(docsRes.statusCode).toBe(200);
    expect(docsRes.text).toContain("Swagger UI");
    expect(protectedRes.statusCode).toBe(401);
  });
});
