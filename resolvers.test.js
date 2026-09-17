const root = require("./resolvers");

describe("GraphQL Resolvers", () => {
  test("student ควรคืน null เมื่อไม่พบ student", () => {
    const result = root.student({ id: 9999 });

    expect(result).toBeNull();
  });

  test("course ควรคืน null เมื่อไม่พบ course", () => {
    const result = root.course({ id: 9999 });

    expect(result).toBeNull();
  });

  test("updateStudent ควรคืน null เมื่อไม่พบ student", () => {
    const result = root.updateStudent({
      id: 9999,
      input: {
        name: "ไม่มีอยู่จริง",
      },
    });

    expect(result).toBeNull();
  });

  test("deleteStudent ควรคืน success false เมื่อไม่พบ student", () => {
    const result = root.deleteStudent({ id: 9999 });

    expect(result).toEqual({
      success: false,
      message: "ไม่พบข้อมูลนักศึกษาที่ต้องการลบ",
    });
  });
});
