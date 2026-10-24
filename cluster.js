// cluster.js
const cluster = require("cluster");
const os = require("os");

const numWorkers = 3; // จำลองว่ามี 3 instance (ใช้ os.availableParallelism() แทนได้หากต้องการ fork ตามจำนวน CPU จริง)

if (cluster.isPrimary) {
  console.log(`Primary process ${process.pid} กำลังทำงาน`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} หยุดทำงาน (code: ${code})`);
  });
} else {
  // Worker process แต่ละตัวโหลดแอป Express เดิมของโปรเจกต์
  require("./server.js");
}
