exports.up = function (knex) {
  return knex.schema.createTable("login_history", (table) => {
    table.increments("id").primary();
    table.integer("student_id").notNullable();
    table.foreign("student_id").references("id").inTable("students");
    table.timestamp("logged_in_at").defaultTo(knex.fn.now());
    table.string("ip_address", 45).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("login_history");
};
