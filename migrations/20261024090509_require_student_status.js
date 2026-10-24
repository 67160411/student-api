exports.up = function (knex) {
  return knex.schema.alterTable("students", (table) => {
    table.string("student_status", 20).notNullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("students", (table) => {
    table.string("student_status", 20).nullable().alter();
  });
};
