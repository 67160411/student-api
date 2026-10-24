// migrations/<timestamp>_add_phone_number_to_students.js
exports.up = function (knex) {
  return knex.schema.alterTable("students", (table) => {
    table.string("phone_number", 20).nullable().defaultTo(null);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("students", (table) => {
    table.dropColumn("phone_number");
  });
};
