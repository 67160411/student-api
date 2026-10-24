exports.up = function (knex) {
  return knex("students")
    .whereNull("student_status")
    .update({ student_status: "active" });
};

exports.down = function (knex) {
  return Promise.resolve();
};
