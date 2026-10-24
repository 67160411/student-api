// migrations/<timestamp>_change_logged_in_at_type_in_login_history.js
exports.up = function (knex) {
  return knex.schema.alterTable("login_history", (table) => {
    table
      .timestamp("logged_in_at", { useTz: true })
      .defaultTo(knex.fn.now())
      .alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("login_history", (table) => {
    table.timestamp("logged_in_at").defaultTo(knex.fn.now()).alter();
  });
};
