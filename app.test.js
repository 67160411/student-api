const { hashPassword } = require("./auth-helpers");

jest.mock("./db", () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));

jest.mock("./cache", () => ({
  redisClient: {
    del: jest.fn().mockResolvedValue(1),
  },
}));

const request = require("supertest");
const app = require("./app");
const pool = require("./db");
const { redisClient } = require("./cache");

beforeEach(() => {
  jest.clearAllMocks();
  redisClient.del.mockResolvedValue(1);
});

// =====================================================
// GET /api/v1/students
// =====================================================

describe("GET /api/v1/students", () => {
  test("กรณีไม่มี major", async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, name: "Test", major: "IT" }]])
      .mockResolvedValueOnce([[{ total: 1 }]]);

    const response = await request(app).get("/api/v1/students").query({
      page: 1,
      limit: 10,
      sort: "name",
      order: "asc",
    });

    expect(response.status).toBe(200);
  });

  test("กรณีมี major", async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, name: "Test", major: "IT" }]])
      .mockResolvedValueOnce([[{ total: 1 }]]);

    const response = await request(app).get("/api/v1/students").query({
      page: 1,
      limit: 10,
      major: "IT",
      sort: "name",
      order: "asc",
    });

    expect(response.status).toBe(200);
  });

  test("กรณี database error", async () => {
    pool.query.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app).get("/api/v1/students").query({
      page: 1,
      limit: 10,
      sort: "name",
      order: "asc",
    });

    expect(response.status).toBe(500);
  });
});

// =====================================================
// GET /api/v2/students
// =====================================================

describe("GET /api/v2/students", () => {
  test("กรณีสำเร็จ", async () => {
    pool.query.mockResolvedValueOnce([
      [
        { id: 1, name: "Student 1" },
        { id: 2, name: "Student 2" },
      ],
    ]);

    const response = await request(app).get("/api/v2/students");

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.count).toBe(2);
  });

  test("กรณี database error", async () => {
    pool.query.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app).get("/api/v2/students");

    expect(response.status).toBe(500);
  });
});

// =====================================================
// POST /api/v1/students
// =====================================================

describe("POST /api/v1/students", () => {
  test("กรณีข้อมูลไม่ครบ", async () => {
    const response = await request(app).post("/api/v1/students").send({
      name: "Test Student",
    });

    expect(response.status).toBe(400);
  });

  test("กรณีไม่พบผู้ใช้", async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "notfound@example.com",
      password: "Passw0rd!",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("กรณี password ไม่ถูกต้อง", async () => {
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          email: "test@example.com",
          password_hash: "wrong-hash",
          role: "student",
        },
      ],
    ]);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "WrongPassword!",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("กรณี login สำเร็จ", async () => {
    const passwordHash = await hashPassword("Passw0rd!");

    pool.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          email: "test@example.com",
          password_hash: passwordHash,
          role: "student",
        },
      ],
    ]);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "Passw0rd!",
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
  });

  test("กรณีเพิ่มข้อมูลสำเร็จ", async () => {
    pool.query.mockResolvedValueOnce([
      {
        insertId: 10,
      },
    ]);

    const response = await request(app).post("/api/v1/students").send({
      name: "Test Student",
      major: "IT",
      email: "test@example.com",
    });

    expect(response.status).toBe(201);

    expect(redisClient.del).toHaveBeenCalledWith("students:all");
  });

  test("กรณี email ซ้ำ", async () => {
    const error = new Error("Duplicate");
    error.code = "ER_DUP_ENTRY";

    pool.query.mockRejectedValueOnce(error);

    const response = await request(app).post("/api/v1/students").send({
      name: "Test Student",
      major: "IT",
      email: "duplicate@example.com",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DUPLICATE_EMAIL");
  });

  test("กรณี database error", async () => {
    pool.query.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app).post("/api/v1/students").send({
      name: "Test Student",
      major: "IT",
      email: "error@example.com",
    });

    expect(response.status).toBe(500);
  });
});

// =====================================================
// PUT /api/v1/students/:id
// =====================================================

describe("PUT /api/v1/students/:id", () => {
  test("กรณีไม่พบ student", async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const response = await request(app).put("/api/v1/students/9999").send({
      name: "Test",
      major: "IT",
    });

    expect(response.status).toBe(404);
  });

  test("กรณีข้อมูลไม่ครบ", async () => {
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          name: "Old",
          major: "IT",
        },
      ],
    ]);

    const response = await request(app).put("/api/v1/students/1").send({
      name: "New",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("กรณี update แล้ว affectedRows = 0", async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Old",
            major: "IT",
          },
        ],
      ])
      .mockResolvedValueOnce([
        {
          affectedRows: 0,
        },
      ]);

    const response = await request(app).put("/api/v1/students/1").send({
      name: "New",
      major: "CS",
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  test("กรณีแก้ไขสำเร็จ", async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Old",
            major: "IT",
          },
        ],
      ])
      .mockResolvedValueOnce([
        {
          affectedRows: 1,
        },
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "New",
            major: "CS",
          },
        ],
      ]);

    const response = await request(app).put("/api/v1/students/1").send({
      name: "New",
      major: "CS",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("New");
  });

  test("กรณี database error", async () => {
    pool.query.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app).put("/api/v1/students/1").send({
      name: "New",
      major: "CS",
    });

    expect(response.status).toBe(500);
  });
});

// =====================================================
// PATCH /api/v1/students/:id
// =====================================================

describe("PATCH /api/v1/students/:id", () => {
  test("กรณีไม่พบ student", async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const response = await request(app).patch("/api/v1/students/9999").send({
      name: "Test",
    });

    expect(response.status).toBe(404);
  });

  test("กรณีแก้เฉพาะ name", async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Old",
            major: "IT",
            email: "test@example.com",
          },
        ],
      ])
      .mockResolvedValueOnce([
        {
          affectedRows: 1,
        },
      ]);

    const response = await request(app).patch("/api/v1/students/1").send({
      name: "New Name",
    });

    expect(response.status).toBe(200);
  });

  test("กรณีแก้เฉพาะ major", async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Student",
            major: "IT",
            email: "test@example.com",
          },
        ],
      ])
      .mockResolvedValueOnce([
        {
          affectedRows: 1,
        },
      ]);

    const response = await request(app).patch("/api/v1/students/1").send({
      major: "CS",
    });

    expect(response.status).toBe(200);
  });

  test("กรณีแก้เฉพาะ email", async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Student",
            major: "IT",
            email: "old@example.com",
          },
        ],
      ])
      .mockResolvedValueOnce([
        {
          affectedRows: 1,
        },
      ]);

    const response = await request(app).patch("/api/v1/students/1").send({
      email: "new@example.com",
    });

    expect(response.status).toBe(200);
  });

  test("กรณีแก้ name major email พร้อมกัน", async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Old",
            major: "IT",
            email: "old@example.com",
          },
        ],
      ])
      .mockResolvedValueOnce([
        {
          affectedRows: 1,
        },
      ]);

    const response = await request(app).patch("/api/v1/students/1").send({
      name: "New",
      major: "CS",
      email: "new@example.com",
    });

    expect(response.status).toBe(200);
  });

  test("กรณี database error", async () => {
    pool.query.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app).patch("/api/v1/students/1").send({
      name: "Error",
    });

    expect(response.status).toBe(500);
  });
});

// =====================================================
// GET /api/v1/students/:id/full
// =====================================================

describe("GET /api/v1/students/:id/full", () => {
  test("กรณีไม่พบ student", async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const response = await request(app).get("/api/v1/students/9999/full");

    expect(response.status).toBe(404);
  });

  test("กรณีพบ student และ courses", async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Student",
            major: "IT",
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 10,
            name: "Database",
          },
        ],
      ]);

    const response = await request(app).get("/api/v1/students/1/full");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty("courses");
  });

  test("กรณี courses query error", async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Student",
            major: "IT",
          },
        ],
      ])
      .mockRejectedValueOnce(new Error("Course error"));

    const response = await request(app).get("/api/v1/students/1/full");

    expect(response.status).toBe(500);
  });
});

// =====================================================
// REGISTER
// =====================================================

describe("POST /api/v1/auth/register", () => {
  test("กรณีข้อมูลไม่ครบ", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({});

    expect(response.status).toBe(400);
  });

  test("กรณี email มีอยู่แล้ว", async () => {
    pool.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          email: "duplicate@example.com",
        },
      ],
    ]);

    const response = await request(app).post("/api/v1/auth/register").send({
      email: "duplicate@example.com",
      password: "Passw0rd!",
    });

    expect(response.status).toBe(409);
  });

  test("กรณี database error", async () => {
    pool.query.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app).post("/api/v1/auth/register").send({
      email: "error@example.com",
      password: "Passw0rd!",
    });

    expect(response.status).toBe(500);
  });
});

// =====================================================
// 404 ROUTE
// =====================================================

describe("404 Handler", () => {
  test("กรณี route ไม่มีอยู่", async () => {
    const response = await request(app).get("/api/v1/not-found-route");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});

// =====================================================
// ERROR HANDLER
// =====================================================

describe("Error Handler", () => {
  test("กรณี err.statusCode", async () => {
    const error = new Error("Bad Request");
    error.statusCode = 400;
    error.type = "BAD_REQUEST";

    pool.query.mockRejectedValueOnce(error);

    const response = await request(app).get("/api/v2/students");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });

  test("กรณี err.status", async () => {
    const error = new Error("Forbidden");
    error.status = 403;
    error.type = "FORBIDDEN";

    pool.query.mockRejectedValueOnce(error);

    const response = await request(app).get("/api/v2/students");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
