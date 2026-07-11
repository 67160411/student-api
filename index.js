const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ message: "Student API พร้อมใช้งาน" });
});

let students = [
  { id: 1, name: "สมชาย ใจดี", major: "วิทยาการคอมพิวเตอร์" },
  { id: 2, name: "สมหญิง รักเรียน", major: "เทคโนโลยีสารสนเทศ" },
];
let nextId = 3;

app.listen(PORT, () => {
  console.log(`Server กำลังทำงานที่ http://localhost:${PORT}`);
});
