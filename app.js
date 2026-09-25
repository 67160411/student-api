require("dotenv").config();

// นำเข้า Express สำหรับสร้าง Web Server
const express = require("express");
// นำเข้า Helmet สำหรับเพิ่มความปลอดภัยให้ HTTP Headers
const helmet = require("helmet");
// นำเข้า CORS สำหรับกำหนดสิทธิ์การเข้าถึง API จากเว็บไซต์อื่น
const cors = require("cors");
// นำเข้า Morgan สำหรับแสดง Log ของ HTTP Request
const morgan = require("morgan");

// นำเข้า express-graphql สำหรับสร้าง GraphQL API
const { graphqlHTTP } = require("express-graphql");
const schema = require("./schema");
const root = require("./resolvers");

const pool = require("./db");

// นำเข้าฟังก์ชันช่วยเหลือสำหรับการเข้ารหัสรหัสผ่านและการสร้าง Token
const {
  hashPassword,
  verifyPassword,
  generateToken,
} = require("./auth-helpers");

// นำเข้า Middleware สำหรับการตรวจสอบ Token และการอนุญาตบทบาทผู้ใช้
const { authenticateToken, authorizeRole } = require("./middlewares/auth");
// นำเข้า Redis Client สำหรับการจัดการ Cache
const { redisClient } = require("./cache");
// นำเข้า Middleware สำหรับการจัดการ Pagination และ Sort
const { parsePagination, parseSort } = require("./middlewares/query-parser");

const app = express();

const v1Router = express.Router();
const v2Router = express.Router();

// MIDDLEWARE

app.use(helmet());

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));

// GRAPHQL
app.use(
  "/graphql",
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  }),
);

// =========================================================
// GET /api/v1/students
// ดึงข้อมูลนักศึกษาทั้งหมด
// รองรับ Pagination, Sort และ Filter ตามสาขา (major)
// =========================================================

v1Router.get(
  "/students",
  parsePagination,
  parseSort,
  async (req, res, next) => {
    const { major } = req.query;
    const { page, limit, offset } = req.pagination;
    const { field, order } = req.sort;

    let baseQuery = "SELECT * FROM students";
    let countQuery = "SELECT COUNT(*) AS total FROM students";

    const params = [];

    // ถ้ามีการส่ง major มาจะเพิ่มเงื่อนไข WHERE major = ?
    if (major) {
      baseQuery += " WHERE major = ?";
      countQuery += " WHERE major = ?";
      params.push(major);
    }

    baseQuery += ` ORDER BY ${field} ${order} LIMIT ? OFFSET ?`;

    // ใช้ try-catch เพื่อจัดการข้อผิดพลาดที่อาจเกิดขึ้นระหว่างการ Query ข้อมูลจากฐานข้อมูล
    // ถ้ามีข้อผิดพลาดเกิดขึ้นจะส่งต่อไปยัง Error Handler
    try {
      const [rows] = await pool.query(baseQuery, [...params, limit, offset]);
      const [[{ total }]] = await pool.query(countQuery, params);

      res.status(200).json({
        message: "สำเร็จ",
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

//=========================================================
// GET /api/v2/students
// ดึงข้อมูลนักศึกษาทั้งหมด (เวอร์ชัน 2)
//========================================================= */

v2Router.get("/students", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students");

    res.status(200).json({
      items: rows,
      count: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// ============================
// POST /api/v1/auth/login
// สำหรับเข้าสู่ระบบ
// ============================

v1Router.post("/auth/login", async (req, res, next) => {
  // ดึง email และ password จาก body ของ request
  const { email, password } = req.body;

  // ตรวจสอบว่ามีการส่ง email และ password มาหรือไม่
  // ถ้าไม่มีให้ส่ง response 400 Bad Request พร้อมข้อความแจ้งเตือน
  if (!email || !password) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุ email และ password",
      },
    });
  }

  try {
    // Query ค้นหาข้อมูลผู้ใช้จากฐานข้อมูลตาม email ที่ส่งมา
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    // ถ้าไม่พบผู้ใช้ที่มี email ดังกล่าว ให้ส่ง response 401 Unauthorized
    if (rows.length === 0) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        },
      });
    }

    // ดึงข้อมูลผู้ใช้ที่พบจากผลลัพธ์ของ Query
    // ตรวจสอบรหัสผ่านที่ส่งมาว่าตรงกับรหัสผ่านที่เข้ารหัสในฐานข้อมูลหรือไม่
    const user = rows[0];
    const isPasswordValid = await verifyPassword(password, user.password_hash);

    // ถ้ารหัสผ่านไม่ถูกต้อง ให้ส่ง response 401 Unauthorized พร้อมข้อความแจ้งเตือน
    if (!isPasswordValid) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        },
      });
    }

    // ถ้ารหัสผ่านถูกต้อง ให้สร้าง Token สำหรับผู้ใช้และส่ง response 200 OK พร้อม Token กลับไป
    const token = generateToken(user);
    res.status(200).json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
    });
  } catch (err) {
    next(err);
  }
});

//========================
// POST /api/v1/students
// เพิ่มข้อมูลนักศึกษาใหม่
//========================

v1Router.post("/students", async (req, res, next) => {
  const { name, major, email } = req.body;

  // ตรวจสอบว่ามีการส่ง name, major และ email มาหรือไม่
  // ถ้าไม่มีให้ส่ง response 400 Bad Request พร้อมข้อความแจ้งเตือน
  if (!name || !major || !email) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุข้อมูลให้ครบถ้วน",
      },
    });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO students
        (name, major, email)
        VALUES (?, ?, ?)`,
      [name, major, email],
    );

    // ลบ Cache ของข้อมูลนักศึกษาทั้งหมดออกจาก Redis เพื่อให้ข้อมูลที่ดึงมาครั้งถัดไปเป็นข้อมูลล่าสุด
    await redisClient.del("students:all");

    // ส่ง response 201 Created พร้อมข้อมูลนักศึกษาที่เพิ่มเข้ามา
    res.status(201).json({
      message: "เพิ่มข้อมูลสำเร็จ",
      data: {
        id: result.insertId,
        name,
        major,
        email,
      },
    });
  } catch (err) {
    // ตรวจสอบว่ามีข้อผิดพลาดเกิดขึ้นหรือไม่
    if (err.code === "ER_DUP_ENTRY") {
      // ถ้าเกิดข้อผิดพลาดเนื่องจากอีเมลซ้ำ ให้ส่ง response 409 Conflict พร้อมข้อความแจ้งเตือน
      return res.status(409).json({
        error: {
          code: "DUPLICATE_EMAIL",
          message: "อีเมลนี้มีอยู่ในระบบแล้ว",
        },
      });
    }

    next(err);
  }
});

//================================
// PUT /api/v1/students/:id
// แก้ไขข้อมูลนักศึกษา
//================================

v1Router.put("/students/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  const { name, major } = req.body;

  try {
    // ตรวจสอบว่ามีนักศึกษาคนนี้อยู่ในฐานข้อมูลหรือไม่
    const [students] = await pool.query("SELECT * FROM students WHERE id = ?", [
      id,
    ]);

    const student = students[0];

    // ไม่พบข้อมูลนักศึกษา
    if (!student) {
      return res.status(404).json({
        message: "ไม่พบข้อมูลนักศึกษา",
      });
    }

    // ตรวจสอบข้อมูลที่ส่งมา
    if (!name || !major) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "กรุณาระบุ name และ major ให้ครบถ้วน",
        },
      });
    }

    // แก้ไขข้อมูล
    const [result] = await pool.query(
      `UPDATE students
       SET name = ?, major = ?
       WHERE id = ?`,
      [name, major, id],
    );

    // ไม่พบข้อมูลที่ต้องการแก้ไข
    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "ไม่พบข้อมูลนักศึกษา",
        },
      });
    }

    // ดึงข้อมูลที่แก้ไขแล้ว
    const [rows] = await pool.query("SELECT * FROM students WHERE id = ?", [
      id,
    ]);

    res.status(200).json({
      message: "แก้ไขข้อมูลสำเร็จ",
      data: rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ==============================
// PATCH /api/v1/students/:id
// แก้ไขข้อมูลนักศึกษาแบบบางส่วน
// ==============================

v1Router.patch("/students/:id", async (req, res, next) => {
  // ดึง id ของนักศึกษาจาก URL parameter และข้อมูล name, major, email จาก body ของ request
  const id = Number(req.params.id);
  const { name, major, email } = req.body;

  // ตรวจสอบว่ามีการส่งข้อมูล name, major หรือ email มาหรือไม่
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM students WHERE id = ?",
      [id],
    );

    // ตรวจสอบว่ามีข้อมูลนักศึกษาที่ต้องการแก้ไขหรือไม่
    // ถ้าไม่มีให้ส่ง response 404 Not Found พร้อมข้อความแจ้งเตือน
    if (existingRows.length === 0) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "ไม่พบข้อมูลนักศึกษา",
        },
      });
    }

    // ดึงข้อมูลนักศึกษาที่มีอยู่แล้วเพื่อนำไปแก้ไข
    const student = existingRows[0];
    if (name !== undefined) {
      student.name = name;
    }
    if (major !== undefined) {
      student.major = major;
    }
    if (email !== undefined) {
      student.email = email;
    }

    // ทำการอัปเดตข้อมูลนักศึกษาในฐานข้อมูล
    await pool.query(
      `UPDATE students
         SET name = ?, major = ?, email = ?
         WHERE id = ?`,
      [student.name, student.major, student.email, id],
    );

    // ส่ง response 200 OK พร้อมข้อมูลนักศึกษาที่แก้ไขแล้ว
    res.status(200).json({
      message: "แก้ไขข้อมูลสำเร็จ",
      data: student,
    });
  } catch (err) {
    next(err);
  }
});

// ===============================
// DELETE /api/v1/students/:id
// ลบข้อมูลนักศึกษา
// ===============================

v1Router.delete(
  "/students/:id",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res, next) => {
    // ดึง id ของนักศึกษาจาก URL parameter
    try {
      const [result] = await pool.query("DELETE FROM students WHERE id = ?", [
        req.params.id,
      ]);

      // ตรวจสอบว่ามีการลบข้อมูลนักศึกษาหรือไม่
      // ถ้าไม่มีให้ส่ง response 404 Not Found พร้อมข้อความแจ้งเตือน
      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "ไม่พบข้อมูลนิสิต",
          },
        });
      }

      // ส่ง response 200 OK พร้อมข้อความยืนยันการลบข้อมูลสำเร็จ
      res.status(200).json({
        message: "ลบข้อมูลสำเร็จ",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ======================
// GET /api/v1/auth/me
// ดึงข้อมูลผู้ใช้ที่เข้าสู่ระบบ
// ======================

v1Router.get("/auth/me", authenticateToken, (req, res) => {
  res.status(200).json({
    message: "สำเร็จ",
    data: req.user,
  });
});

// =================================
// GET /api/v1/students/:id/full
// ดึงข้อมูลนักศึกษาและรายวิชาที่ลงทะเบียน
// =================================

v1Router.get("/students/:id/full", async (req, res, next) => {
  const id = Number(req.params.id);

  // ตรวจสอบว่ามีการส่ง id ของนักศึกษามาหรือไม่
  try {
    const [studentRows] = await pool.query(
      "SELECT * FROM students WHERE id = ?",
      [id],
    );

    // ตรวจสอบว่ามีข้อมูลนักศึกษาที่ต้องการดึงหรือไม่
    // ถ้าไม่มีให้ส่ง response 404 Not Found พร้อมข้อความแจ้งเตือน
    if (studentRows.length === 0) {
      return res.status(404).json({
        message: "ไม่พบข้อมูลนักศึกษา",
      });
    }

    // ดึงข้อมูลนักศึกษาที่พบจากผลลัพธ์ของ Query
    const student = studentRows[0];

    // ดึงข้อมูลรายวิชาที่นักศึกษาลงทะเบียนจากตาราง enrollments และ courses
    // ใช้ INNER JOIN เพื่อเชื่อมโยงข้อมูลระหว่างตาราง enrollments และ courses
    // ใช้ WHERE e.student_id = ? เพื่อกรองข้อมูลเฉพาะนักศึกษาที่มี id ตรงกับที่ส่งมา
    // ใช้ pool.query เพื่อทำการ Query ข้อมูลจากฐานข้อมูล
    const [courses] = await pool.query(
      `SELECT c.*
         FROM courses c
         INNER JOIN enrollments e
         ON c.id = e.course_id
         WHERE e.student_id = ?`,
      [id],
    );

    // ส่ง response 200 OK พร้อมข้อมูลนักศึกษาและรายวิชาที่ลงทะเบียน
    res.status(200).json({
      message: "สำเร็จ",
      data: {
        ...student,
        courses,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =============================
// POST /api/v1/auth/register
// ลงทะเบียนผู้ใช้ใหม่
// =============================

v1Router.post("/auth/register", async (req, res, next) => {
  // ดึง email และ password จาก body ของ request
  const { email, password } = req.body;

  // ตรวจสอบว่ามีการส่ง email และ password มาหรือไม่
  // ถ้าไม่มีให้ส่ง response 400 Bad Request พร้อมข้อความแจ้งเตือน
  if (!email || !password) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุ email และ password",
      },
    });
  }

  // ตรวจสอบรูปแบบอีเมลด้วย Regular Expression
  try {
    const [existingUsers] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email],
    );

    // ตรวจสอบว่ามีผู้ใช้ที่มีอีเมลนี้อยู่แล้วหรือไม่
    // ถ้ามีให้ส่ง response 409 Conflict พร้อมข้อความแจ้งเตือน
    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: {
          code: "DUPLICATE_EMAIL",
          message: "อีเมลนี้มีอยู่ในระบบแล้ว",
        },
      });
    }

    // ถ้าไม่มีผู้ใช้ที่มีอีเมลนี้อยู่แล้ว ให้ทำการเข้ารหัสรหัสผ่านและบันทึกข้อมูลผู้ใช้ใหม่ลงในฐานข้อมูล
    const passwordHash = await hashPassword(password);

    // ทำการบันทึกข้อมูลผู้ใช้ใหม่ลงในฐานข้อมูล
    // ใช้ pool.query เพื่อทำการ Query ข้อมูลจากฐานข้อมูล
    // ใช้ INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) เพื่อเพิ่มข้อมูลผู้ใช้ใหม่
    // ใช้ [email, passwordHash, "student"] เป็นค่าที่จะถูกแทนที่ใน Query
    // ใช้ await เพื่อรอผลลัพธ์ของ Query ก่อนที่จะดำเนินการต่อ
    const [result] = await pool.query(
      `INSERT INTO users
           (email, password_hash, role)
           VALUES (?, ?, ?)`,
      [email, passwordHash, "student"],
    );

    // ส่ง response 201 Created พร้อมข้อมูลผู้ใช้ใหม่ที่ถูกบันทึกลงในฐานข้อมูล
    res.status(201).json({
      message: "สมัครสมาชิกสำเร็จ",
      data: {
        id: result.insertId,
        email,
        role: "student",
      },
    });
  } catch (err) {
    // ตรวจสอบว่ามีข้อผิดพลาดเกิดขึ้นหรือไม่
    if (err.code === "ER_DUP_ENTRY") {
      // ถ้าเกิดข้อผิดพลาดเนื่องจากอีเมลซ้ำ ให้ส่ง response 409 Conflict พร้อมข้อความแจ้งเตือน
      return res.status(409).json({
        error: {
          code: "DUPLICATE_EMAIL",
          message: "อีเมลนี้มีอยู่ในระบบแล้ว",
        },
      });
    }

    next(err);
  }
});

// ===========================================
// POST /api/v1/students/:id/enrollments
// ลงทะเบียนนักศึกษาเข้ารายวิชา
// ===========================================

v1Router.post("/students/:id/enrollments", async (req, res, next) => {
  // ดึง id ของนักศึกษาจาก URL parameter และ courseId จาก body ของ request
  const studentId = req.params.id;
  // ดึง courseId จาก body ของ request
  const { courseId } = req.body;

  let connection;

  // ตรวจสอบว่ามีการส่ง courseId มาหรือไม่
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // ตรวจสอบว่ามีรายวิชาที่ต้องการลงทะเบียนหรือไม่
    const [courseRows] = await connection.query(
      `SELECT *
           FROM courses
           WHERE id = ?
           FOR UPDATE`,
      [courseId],
    );

    // ตรวจสอบว่ามีรายวิชาที่ต้องการลงทะเบียนหรือไม่
    // ถ้าไม่มีให้ส่ง response 404 Not Found พร้อมข้อความแจ้งเตือน
    if (courseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: {
          code: "COURSE_NOT_FOUND",
          message: "ไม่พบรายวิชาที่ระบุ",
        },
      });
    }

    // ตรวจสอบว่ามีที่นั่งว่างในรายวิชาหรือไม่
    // ถ้าไม่มีให้ส่ง response 409 Conflict พร้อมข้อความแจ้งเตือน
    if (courseRows[0].seat_available <= 0) {
      await connection.rollback();
      return res.status(409).json({
        error: {
          code: "SEAT_FULL",
          message: "ที่นั่งเต็มแล้ว",
        },
      });
    }

    // ตรวจสอบว่านักศึกษาได้ลงทะเบียนรายวิชานี้ไปแล้วหรือไม่
    await connection.query(
      `INSERT INTO enrollments
         (student_id, course_id)
         VALUES (?, ?)`,
      [studentId, courseId],
    );

    // ลดจำนวนที่นั่งว่างในรายวิชา 1 ที่นั่ง
    await connection.query(
      `UPDATE courses
         SET seat_available =
             seat_available - 1
         WHERE id = ?`,
      [courseId],
    );

    // Commit Transaction เพื่อยืนยันการเปลี่ยนแปลงในฐานข้อมูล
    await connection.commit();

    // ส่ง response 201 Created พร้อมข้อความยืนยันการลงทะเบียนสำเร็จ
    res.status(201).json({
      message: "ลงทะเบียนสำเร็จ",
    });
  } catch (err) {
    // ตรวจสอบว่ามีข้อผิดพลาดเกิดขึ้นหรือไม่
    if (connection) {
      // ถ้ามีการเชื่อมต่อฐานข้อมูล ให้ทำการ Rollback Transaction เพื่อยกเลิกการเปลี่ยนแปลงในฐานข้อมูล
      await connection.rollback();
    }

    // ตรวจสอบว่ามีข้อผิดพลาดเกิดขึ้นเนื่องจากนักศึกษาได้ลงทะเบียนรายวิชานี้ไปแล้วหรือไม่
    // ถ้าใช่ให้ส่ง response 409 Conflict พร้อมข้อความแจ้งเตือน
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: {
          code: "ALREADY_ENROLLED",
          message: "นักศึกษาลงทะเบียนรายวิชานี้ไปแล้ว",
        },
      });
    }

    next(err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ===========
// ROUTERS
// ===========

// กำหนด Router สำหรับ API v1 และ v2
app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);

// ================
// 404 HANDLER
// ================

// ถ้าไม่มี Route ใดตรงกับ Request ที่เข้ามา ให้ส่ง Response 404 Not Found พร้อมข้อความแจ้งเตือน
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "ไม่พบเส้นทางที่ร้องขอ",
    },
  });
});

// =================
// ERROR HANDLER
// =================

// ถ้ามี Error เกิดขึ้นใน Middleware หรือ Route ใด ๆ ให้ส่ง Response 500 Internal Server Error พร้อมข้อความแจ้งเตือน
app.use((err, req, res, next) => {
  console.error(err.stack);

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: {
      code: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : err.type || "ERROR",

      message:
        statusCode === 500
          ? "เกิดข้อผิดพลาดที่ไม่คาดคิดภายในระบบ"
          : err.message,
    },
  });
});

module.exports = app;
